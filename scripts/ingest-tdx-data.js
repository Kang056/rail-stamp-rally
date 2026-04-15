#!/usr/bin/env node
/**
 * scripts/ingest-tdx-data.js
 *
 * Fetches TDX data and saves to local JSON file.
 * Use upload-to-supabase.js to write data to Supabase.
 *
 * Prerequisites:
 *   1. Copy .env.local.example → .env.local and fill in:
 *        TDX_CLIENT_ID, TDX_CLIENT_SECRET
 *   2. node scripts/ingest-tdx-data.js
 *   3. (optional) node scripts/ingest-tdx-data.js --dry-run
 *
 * Output: data/tdx-railway-data.json
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_BASE_URL  = 'https://tdx.transportdata.tw/api/basic';

const TDX_CLIENT_ID     = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

const FETCH_DELAY = 10000; // 10s between each request (TDX free tier is restrictive)

const OUTPUT_DIR  = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'tdx-railway-data.json');

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Obtain TDX Access Token (client_credentials flow)
// ─────────────────────────────────────────────────────────────────────────────
async function getTdxAccessToken() {
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     TDX_CLIENT_ID,
    client_secret: TDX_CLIENT_SECRET,
  });

  const res = await fetch(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`TDX token request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  console.log('✅  TDX token obtained — expires in', json.expires_in, 'seconds');
  return json.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — TDX API Endpoints (v2, $format=JSON)
//
// TDX Rail V2 API base paths:
//   台鐵 TRA               : /v2/Rail/TRA
//   高鐵 THSR              : /v2/Rail/THSR
//   台北捷運 TRTC           : /v2/Rail/Metro/.../TRTC
//   桃園捷運 TYMC           : /v2/Rail/Metro/.../TYMC
//   高雄捷運 KRTC           : /v2/Rail/Metro/.../KRTC
//   台中捷運 TMRT           : /v2/Rail/Metro/.../TMRT
//   新北捷運 NTMC           : /v2/Rail/Metro/.../NTMC
//   高雄輕軌 KLRT           : /v2/Rail/Metro/.../KLRT
//   淡海輕軌 NTDLRT         : /v2/Rail/Metro/.../NTDLRT  → mapped to NTMC
//   安坑輕軌 NTALRT         : /v2/Rail/Metro/.../NTALRT  → mapped to NTMC
// ─────────────────────────────────────────────────────────────────────────────
const TDX_ENDPOINTS = {
  // Stations (return JSON arrays of station objects)
  TRA_STATIONS:     `${TDX_BASE_URL}/v2/Rail/TRA/Station?$format=JSON`,
  THSR_STATIONS:    `${TDX_BASE_URL}/v2/Rail/THSR/Station?$format=JSON`,
  TRTC_STATIONS:    `${TDX_BASE_URL}/v2/Rail/Metro/Station/TRTC?$format=JSON`,
  TYMC_STATIONS:    `${TDX_BASE_URL}/v2/Rail/Metro/Station/TYMC?$format=JSON`,
  KRTC_STATIONS:    `${TDX_BASE_URL}/v2/Rail/Metro/Station/KRTC?$format=JSON`,
  TMRT_STATIONS:    `${TDX_BASE_URL}/v2/Rail/Metro/Station/TMRT?$format=JSON`,
  NTMC_STATIONS:    `${TDX_BASE_URL}/v2/Rail/Metro/Station/NTMC?$format=JSON`,
  KLRT_STATIONS:    `${TDX_BASE_URL}/v2/Rail/Metro/Station/KLRT?$format=JSON`,
  NTDLRT_STATIONS:  `${TDX_BASE_URL}/v2/Rail/Metro/Station/NTDLRT?$format=JSON`,
  NTALRT_STATIONS:  `${TDX_BASE_URL}/v2/Rail/Metro/Station/NTALRT?$format=JSON`,

  // Lines / shapes (return JSON arrays of shape objects with WKT Geometry)
  TRA_LINES:        `${TDX_BASE_URL}/v2/Rail/TRA/Shape?$format=JSON`,
  THSR_LINES:       `${TDX_BASE_URL}/v2/Rail/THSR/Shape?$format=JSON`,
  TRTC_LINES:       `${TDX_BASE_URL}/v2/Rail/Metro/Shape/TRTC?$format=JSON`,
  TYMC_LINES:       `${TDX_BASE_URL}/v2/Rail/Metro/Shape/TYMC?$format=JSON`,
  KRTC_LINES:       `${TDX_BASE_URL}/v2/Rail/Metro/Shape/KRTC?$format=JSON`,
  TMRT_LINES:       `${TDX_BASE_URL}/v2/Rail/Metro/Shape/TMRT?$format=JSON`,
  NTMC_LINES:       `${TDX_BASE_URL}/v2/Rail/Metro/Shape/NTMC?$format=JSON`,
  KLRT_LINES:       `${TDX_BASE_URL}/v2/Rail/Metro/Shape/KLRT?$format=JSON`,
  NTDLRT_LINES:     `${TDX_BASE_URL}/v2/Rail/Metro/Shape/NTDLRT?$format=JSON`,
  NTALRT_LINES:     `${TDX_BASE_URL}/v2/Rail/Metro/Shape/NTALRT?$format=JSON`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Fetch a JSON endpoint with the Bearer token
//           Includes retry with backoff for 429 rate-limit errors.
// ─────────────────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJSON(url, accessToken, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`  Fetching (attempt ${attempt}): ${url}`);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const json = await res.json();
      const count = Array.isArray(json) ? json.length : 0;
      console.log(`    → ${res.status} OK — ${count} records`);
      return json;
    }

    if (res.status === 429 && attempt < retries) {
      const wait = 20000 * attempt; // 3s, 6s, 9s
      console.warn(`  ⚠️  429 rate-limited — retrying in ${wait}ms…`);
      await delay(wait);
      continue;
    }

    console.warn(`  ⚠️  ${url} → ${res.status} — skipping`);
    return null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WKT Parser — converts WKT LINESTRING / MULTILINESTRING to GeoJSON
//
// WKT format:
//   LINESTRING(lon lat, lon lat, ...)
//   MULTILINESTRING((lon lat, lon lat, ...), (lon lat, lon lat, ...))
//
// Output: { type: "MultiLineString", coordinates: [[[lon,lat], ...], ...] }
// ─────────────────────────────────────────────────────────────────────────────
function parseWKT(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;

  const trimmed = wkt.trim();

  try {
    if (trimmed.startsWith('MULTILINESTRING')) {
      // Extract everything inside the outer parentheses
      const outer = trimmed.replace(/^MULTILINESTRING\s*\(\s*/, '').replace(/\s*\)$/, '');
      // Split into individual rings by "),("
      const rings = outer.split(/\)\s*,\s*\(/);
      const coordinates = rings.map((ring) => {
        const clean = ring.replace(/^\(/, '').replace(/\)$/, '');
        return clean.split(',').map((pair) => {
          const [lon, lat] = pair.trim().split(/\s+/).map(Number);
          return [lon, lat];
        });
      });
      return { type: 'MultiLineString', coordinates };
    }

    if (trimmed.startsWith('LINESTRING')) {
      const inner = trimmed.replace(/^LINESTRING\s*\(\s*/, '').replace(/\s*\)$/, '');
      const coordinates = inner.split(',').map((pair) => {
        const [lon, lat] = pair.trim().split(/\s+/).map(Number);
        return [lon, lat];
      });
      return { type: 'MultiLineString', coordinates: [coordinates] };
    }
  } catch (e) {
    console.warn(`  ⚠️  WKT parse error: ${e.message}`);
    return null;
  }

  console.warn(`  ⚠️  Unsupported WKT type: ${trimmed.substring(0, 30)}…`);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Parse station data into DB-ready format
// ─────────────────────────────────────────────────────────────────────────────
function parseStations(stationsArray, dbSystemType) {
  if (!Array.isArray(stationsArray) || !stationsArray.length) {
    console.log(`  No station data for ${dbSystemType}`);
    return [];
  }

  const rows = stationsArray
    .filter((s) => {
      const pos = s.StationPosition;
      return pos && typeof pos.PositionLon === 'number' && typeof pos.PositionLat === 'number';
    })
    .map((s) => ({
      station_id:        s.StationUID || s.StationID || '',
      station_name:      s.StationName?.Zh_tw || '',
      system_type:       dbSystemType,
      line_id:           s.LineID || '',
      geom:              {
        type: 'Point',
        coordinates: [s.StationPosition.PositionLon, s.StationPosition.PositionLat],
      },
      established_year:  null,
      history_desc:      null,
      history_image_url: null,
      badge_image_url:   null,
    }));

  console.log(`  ${dbSystemType} stations parsed: ${rows.length} rows`);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Parse line/shape data into DB-ready format
// ─────────────────────────────────────────────────────────────────────────────
function parseLines(shapesArray, dbSystemType, colorHex) {
  if (!Array.isArray(shapesArray) || !shapesArray.length) {
    console.log(`  No line/shape data for ${dbSystemType}`);
    return [];
  }

  const rows = shapesArray
    .map((s) => ({
      line_id:      s.LineID || s.LineNo || '',
      line_name:    s.LineName?.Zh_tw || '',
      system_type:  dbSystemType,
      color_hex:    colorHex,
      geom:         parseWKT(s.Geometry),
      history_desc: null,
    }))
    .filter((r) => r.geom !== null);

  console.log(`  ${dbSystemType} lines parsed: ${rows.length} rows`);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// System colour mapping (used for line rendering on the map)
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_COLORS = {
  TRA:  '#006633',
  HSR:  '#e60012',
  TRTC: '#e3002c',
  TYMC: '#8B008B',
  KRTC: '#F7941D',
  TMRT: '#00A0E9',
  NTMC: '#FF6600',
  KLRT: '#00B0B9',
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false };
  for (const a of args) {
    if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: merge multiple JSON arrays (some may be null)
// ─────────────────────────────────────────────────────────────────────────────
function mergeArrays(...arrays) {
  const result = [];
  for (const arr of arrays) {
    if (Array.isArray(arr)) result.push(...arr);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚂  Rail Stamp Rally — TDX data fetch script');
  console.log('─'.repeat(60));
  const opts = parseArgs();

  if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET) {
    throw new Error('TDX_CLIENT_ID and TDX_CLIENT_SECRET must be set in .env.local');
  }

  const token = await getTdxAccessToken();

  console.log('\n📡  Fetching JSON from TDX API v2 (sequential with 3s delays)…');

  // ── Stations ────────────────────────────────────────────────────────────
  console.log('\n📍  Fetching stations…');

  const traStations  = await fetchJSON(TDX_ENDPOINTS.TRA_STATIONS,  token); await delay(FETCH_DELAY);
  const thsrStations = await fetchJSON(TDX_ENDPOINTS.THSR_STATIONS, token); await delay(FETCH_DELAY);
  const trtcStations = await fetchJSON(TDX_ENDPOINTS.TRTC_STATIONS, token); await delay(FETCH_DELAY);
  const tymcStations = await fetchJSON(TDX_ENDPOINTS.TYMC_STATIONS, token); await delay(FETCH_DELAY);
  const krtcStations = await fetchJSON(TDX_ENDPOINTS.KRTC_STATIONS, token); await delay(FETCH_DELAY);
  const tmrtStations = await fetchJSON(TDX_ENDPOINTS.TMRT_STATIONS, token); await delay(FETCH_DELAY);
  const klrtStations = await fetchJSON(TDX_ENDPOINTS.KLRT_STATIONS, token); await delay(FETCH_DELAY);

  // NTMC: merge NTMC + NTDLRT + NTALRT
  const ntmcStationsRaw   = await fetchJSON(TDX_ENDPOINTS.NTMC_STATIONS,   token); await delay(FETCH_DELAY);
  const ntdlrtStationsRaw = await fetchJSON(TDX_ENDPOINTS.NTDLRT_STATIONS, token); await delay(FETCH_DELAY);
  const ntalrtStationsRaw = await fetchJSON(TDX_ENDPOINTS.NTALRT_STATIONS, token); await delay(FETCH_DELAY);
  const ntmcStations = mergeArrays(ntmcStationsRaw, ntdlrtStationsRaw, ntalrtStationsRaw);

  // ── Lines / Shapes ──────────────────────────────────────────────────────
  console.log('\n🛤   Fetching shapes…');

  const traLines  = await fetchJSON(TDX_ENDPOINTS.TRA_LINES,  token); await delay(FETCH_DELAY);
  const thsrLines = await fetchJSON(TDX_ENDPOINTS.THSR_LINES, token); await delay(FETCH_DELAY);
  const trtcLines = await fetchJSON(TDX_ENDPOINTS.TRTC_LINES, token); await delay(FETCH_DELAY);
  const tymcLines = await fetchJSON(TDX_ENDPOINTS.TYMC_LINES, token); await delay(FETCH_DELAY);
  const krtcLines = await fetchJSON(TDX_ENDPOINTS.KRTC_LINES, token); await delay(FETCH_DELAY);
  const tmrtLines = await fetchJSON(TDX_ENDPOINTS.TMRT_LINES, token); await delay(FETCH_DELAY);
  const klrtLines = await fetchJSON(TDX_ENDPOINTS.KLRT_LINES, token); await delay(FETCH_DELAY);

  // NTMC lines: merge NTMC + NTDLRT + NTALRT
  const ntmcLinesRaw   = await fetchJSON(TDX_ENDPOINTS.NTMC_LINES,   token); await delay(FETCH_DELAY);
  const ntdlrtLinesRaw = await fetchJSON(TDX_ENDPOINTS.NTDLRT_LINES, token); await delay(FETCH_DELAY);
  const ntalrtLinesRaw = await fetchJSON(TDX_ENDPOINTS.NTALRT_LINES, token);
  const ntmcLines = mergeArrays(ntmcLinesRaw, ntdlrtLinesRaw, ntalrtLinesRaw);

  // ── Parse stations ──────────────────────────────────────────────────────
  console.log('\n📍  Parsing stations…');
  const stations = {
    TRA:  parseStations(traStations,  'TRA'),
    HSR:  parseStations(thsrStations, 'HSR'),
    TRTC: parseStations(trtcStations, 'TRTC'),
    TYMC: parseStations(tymcStations, 'TYMC'),
    KRTC: parseStations(krtcStations, 'KRTC'),
    TMRT: parseStations(tmrtStations, 'TMRT'),
    NTMC: parseStations(ntmcStations, 'NTMC'),
    KLRT: parseStations(klrtStations, 'KLRT'),
  };

  // ── Parse lines ─────────────────────────────────────────────────────────
  console.log('\n🛤   Parsing lines…');
  const lines = {
    TRA:  parseLines(traLines,  'TRA',  SYSTEM_COLORS.TRA),
    HSR:  parseLines(thsrLines, 'HSR',  SYSTEM_COLORS.HSR),
    TRTC: parseLines(trtcLines, 'TRTC', SYSTEM_COLORS.TRTC),
    TYMC: parseLines(tymcLines, 'TYMC', SYSTEM_COLORS.TYMC),
    KRTC: parseLines(krtcLines, 'KRTC', SYSTEM_COLORS.KRTC),
    TMRT: parseLines(tmrtLines, 'TMRT', SYSTEM_COLORS.TMRT),
    NTMC: parseLines(ntmcLines, 'NTMC', SYSTEM_COLORS.NTMC),
    KLRT: parseLines(klrtLines, 'KLRT', SYSTEM_COLORS.KLRT),
  };

  // ── Summary ─────────────────────────────────────────────────────────────
  const totalStations = Object.values(stations).reduce((sum, arr) => sum + arr.length, 0);
  const totalLines    = Object.values(lines).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\n📊  Total: ${totalStations} stations, ${totalLines} lines`);

  if (opts.dryRun) {
    console.log('\n🏁  Dry-run mode: no file written.');
    return;
  }

  // ── Write to file ───────────────────────────────────────────────────────
  const output = {
    fetchedAt: new Date().toISOString(),
    stations,
    lines,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✅  Data saved to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('❌  Fetch failed:', err);
  process.exit(1);
});
