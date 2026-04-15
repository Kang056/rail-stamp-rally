#!/usr/bin/env node
/**
 * scripts/ingest-tdx-data.js
 *
 * One-time data ingestion script for Rail Stamp Rally (鐵道集旅).
 * Fetches railway geometry and station data from the TDX (Transport Data
 * eXchange) platform and inserts it into Supabase/PostGIS.
 *
 * Prerequisites:
 *   1. Copy .env.local.example → .env.local and fill in:
 *        TDX_CLIENT_ID, TDX_CLIENT_SECRET
 *        NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   2. npm install @supabase/supabase-js dotenv
 *   3. node scripts/ingest-tdx-data.js
 *
 * NOTE: Use the Supabase service-role key (not the anon key) for INSERT
 * operations so that Row-Level Security is bypassed.
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_BASE_URL  = 'https://tdx.transportdata.tw/api/basic';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TDX_CLIENT_ID     = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

const FETCH_DELAY = 3000; // 3s between each request (TDX free tier is restrictive)

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
      const wait = 3000 * attempt; // 3s, 6s, 9s
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
// Step 4 — Parse and insert station data
//
// TDX JSON station object:
// {
//   StationUID: "TRA-1000",
//   StationID: "1000",
//   StationName: { Zh_tw: "基隆", En: "Keelung" },
//   StationPosition: { PositionLon: 121.74, PositionLat: 25.13 },
//   ...
// }
// ─────────────────────────────────────────────────────────────────────────────
async function insertStations(supabase, stationsArray, dbSystemType) {
  if (!Array.isArray(stationsArray) || !stationsArray.length) {
    console.log(`  No station data for ${dbSystemType}`);
    return;
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
  if (!rows.length) return;

  try {
    const { error } = await supabase.rpc('insert_stations_bulk', { rows: JSON.stringify(rows) });
    if (error) {
      console.error(`  ❌  insert_stations_bulk error for ${dbSystemType}:`, error);
    } else {
      console.log(`  ✅  insert_stations_bulk succeeded for ${dbSystemType} (${rows.length} rows)`);
    }
  } catch (err) {
    console.error(`  ❌  RPC call failed for ${dbSystemType}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Parse and insert line/shape data
//
// TDX JSON shape object:
// {
//   LineNo: "WL",
//   LineID: "WL",
//   LineName: { Zh_tw: "西部幹線", En: "Western Line" },
//   Geometry: "MULTILINESTRING((121.74 25.13, 121.75 25.14, ...))",
//   ...
// }
// ─────────────────────────────────────────────────────────────────────────────
async function insertLines(supabase, shapesArray, dbSystemType, colorHex) {
  if (!Array.isArray(shapesArray) || !shapesArray.length) {
    console.log(`  No line/shape data for ${dbSystemType}`);
    return;
  }

  const rows = shapesArray
    .map((s) => {
      const geom = parseWKT(s.Geometry);
      return {
        line_id:      s.LineID || s.LineNo || '',
        line_name:    s.LineName?.Zh_tw || '',
        system_type:  dbSystemType,
        color_hex:    colorHex,
        geom:         geom,
        history_desc: null,
      };
    })
    .filter((r) => r.geom !== null);

  console.log(`  ${dbSystemType} lines parsed: ${rows.length} rows`);
  if (!rows.length) return;

  try {
    const { error } = await supabase.rpc('insert_lines_bulk', { rows: JSON.stringify(rows) });
    if (error) {
      console.error(`  ❌  insert_lines_bulk error for ${dbSystemType}:`, error);
    } else {
      console.log(`  ✅  insert_lines_bulk succeeded for ${dbSystemType} (${rows.length} rows)`);
    }
  } catch (err) {
    console.error(`  ❌  RPC call failed for ${dbSystemType}:`, err);
  }
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
  const out = { dryRun: false, useMock: false, localFile: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--mock') out.useMock = true;
    else if ((a === '--file' || a === '-f') && args[i + 1]) {
      out.localFile = args[i + 1];
      i++;
    }
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
  console.log('🚂  Rail Stamp Rally — TDX data ingestion script');
  console.log('─'.repeat(60));
  const opts = parseArgs();

  // Initialise Supabase client
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase URL/key must be set in .env.local');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Local / mock mode ───────────────────────────────────────────────────
  if (opts.useMock || opts.localFile) {
    if (!opts.dryRun && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Writing to Supabase requires SUPABASE_SERVICE_ROLE_KEY (set in .env.local).');
    }

    const localPath = opts.localFile
      ? path.resolve(opts.localFile)
      : path.join(__dirname, 'mockGeoJSON.json');

    if (!fs.existsSync(localPath)) {
      throw new Error(`Local geojson not found: ${localPath}`);
    }

    console.log(`\n📂  Loading local GeoJSON: ${localPath}`);
    const raw = fs.readFileSync(localPath, 'utf8');
    const local = JSON.parse(raw);

    const systems = ['TRA','HSR','TRTC','TYMC','KRTC','TMRT','NTMC','KLRT'];
    const stationsBySystem = {};
    const linesBySystem = {};
    systems.forEach((s) => {
      stationsBySystem[s] = [];
      linesBySystem[s] = [];
    });

    for (const feat of (local.features || [])) {
      const props = feat.properties || {};
      const sys = (props.system_type || props.systemType || 'TRA').toUpperCase();
      if (!systems.includes(sys)) continue;

      const ft = (props.feature_type || props.featureType || '').toLowerCase();
      if (ft === 'station') {
        stationsBySystem[sys].push({
          StationUID: props.id ?? props.station_id ?? props.stationId ?? '',
          StationID: props.id ?? props.station_id ?? props.stationId ?? '',
          StationName: { Zh_tw: props.name ?? props.station_name ?? '' },
          StationPosition: {
            PositionLon: feat.geometry?.coordinates?.[0],
            PositionLat: feat.geometry?.coordinates?.[1],
          },
          LineID: props.line_id ?? props.lineId ?? '',
        });
      } else if (ft === 'line') {
        const geom = feat.geometry;
        const geomJson = geom?.type === 'LineString'
          ? { type: 'MultiLineString', coordinates: [geom.coordinates] }
          : geom;

        linesBySystem[sys].push({
          LineID: props.id ?? props.line_id ?? props.lineId ?? '',
          LineName: { Zh_tw: props.name ?? props.line_name ?? '' },
          _geomOverride: geomJson,
        });
      }
    }

    console.log('\n📍  Processing local stations…');
    for (const s of systems) {
      if (!stationsBySystem[s].length) continue;
      console.log(`  ${s} stations: ${stationsBySystem[s].length}`);
      if (!opts.dryRun) await insertStations(supabase, stationsBySystem[s], s);
    }

    console.log('\n🛤   Processing local lines…');
    for (const s of systems) {
      if (!linesBySystem[s].length) continue;
      const rows = linesBySystem[s].map((ms) => ({
        line_id:      ms.LineID || '',
        line_name:    ms.LineName?.Zh_tw || '',
        system_type:  s,
        color_hex:    SYSTEM_COLORS[s],
        geom:         ms._geomOverride,
        history_desc: null,
      })).filter((r) => r.geom != null);
      console.log(`  ${s} lines: ${rows.length}`);
      if (!opts.dryRun) {
        try {
          const { error } = await supabase.rpc('insert_lines_bulk', { rows: JSON.stringify(rows) });
          if (error) console.error(`  ❌  insert_lines_bulk error for ${s}:`, error);
          else console.log(`  ✅  insert_lines_bulk succeeded for ${s} (${rows.length} rows)`);
        } catch (err) {
          console.error(`  ❌  RPC call failed for ${s}:`, err);
        }
      }
    }

    console.log('\n✅  Local ingestion complete.');
    if (opts.dryRun) console.log('Dry-run mode: no writes were performed.');
    return;
  }

  // ── Live TDX fetch mode ─────────────────────────────────────────────────
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

  // ── Insert stations ─────────────────────────────────────────────────────
  console.log('\n📍  Inserting stations into Supabase…');
  await insertStations(supabase, traStations,  'TRA');
  await insertStations(supabase, thsrStations, 'HSR');   // TDX THSR → DB HSR
  await insertStations(supabase, trtcStations, 'TRTC');
  await insertStations(supabase, tymcStations, 'TYMC');
  await insertStations(supabase, krtcStations, 'KRTC');
  await insertStations(supabase, tmrtStations, 'TMRT');
  await insertStations(supabase, ntmcStations, 'NTMC');  // Merged NTMC + NTDLRT + NTALRT
  await insertStations(supabase, klrtStations, 'KLRT');

  // ── Insert lines ────────────────────────────────────────────────────────
  console.log('\n🛤   Inserting lines into Supabase…');
  await insertLines(supabase, traLines,  'TRA',  SYSTEM_COLORS.TRA);
  await insertLines(supabase, thsrLines, 'HSR',  SYSTEM_COLORS.HSR);
  await insertLines(supabase, trtcLines, 'TRTC', SYSTEM_COLORS.TRTC);
  await insertLines(supabase, tymcLines, 'TYMC', SYSTEM_COLORS.TYMC);
  await insertLines(supabase, krtcLines, 'KRTC', SYSTEM_COLORS.KRTC);
  await insertLines(supabase, tmrtLines, 'TMRT', SYSTEM_COLORS.TMRT);
  await insertLines(supabase, ntmcLines, 'NTMC', SYSTEM_COLORS.NTMC);
  await insertLines(supabase, klrtLines, 'KLRT', SYSTEM_COLORS.KLRT);

  console.log('\n✅  Ingestion script complete.');
}

main().catch((err) => {
  console.error('❌  Ingestion failed:', err);
  process.exit(1);
});
