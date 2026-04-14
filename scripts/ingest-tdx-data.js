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
 *        NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or service role key)
 *   2. npm install @supabase/supabase-js dotenv
 *   3. node scripts/ingest-tdx-data.js
 *
 * NOTE: Use the Supabase service-role key (not the anon key) for INSERT
 * operations so that Row-Level Security is bypassed.
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_BASE_URL  = 'https://tdx.transportdata.tw/api/basic';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
// For writes use the service-role key; for reads the anon key is fine.
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TDX_CLIENT_ID     = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

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
// Step 2 — TDX API Endpoints
// Always append ?$format=GEOJSON to receive GeoJSON FeatureCollections.
// ─────────────────────────────────────────────────────────────────────────────
// TDX Rail V3 API base paths:
//   Taiwan Railways (台鐵)   : /v3/Rail/TRA
//   High Speed Rail (高鐵)   : /v3/Rail/THSR
//   Taipei Metro (台北捷運)  : /v3/Rail/Metro/TRTC
//   Taoyuan Metro (桃園捷運) : /v3/Rail/Metro/TYMC
//   Kaohsiung Metro (高雄捷運): /v3/Rail/Metro/KRTC
//   Taichung MRT (台中捷運)  : /v3/Rail/Metro/TMRT
//
// NOTE: Not all metro systems expose full GeoJSON shape endpoints.
//       Check the TDX API documentation for the exact paths.
const TDX_ENDPOINTS = {
  // Stations (Point geometries)
  TRA_STATIONS:   `${TDX_BASE_URL}/v3/Rail/TRA/Station?$format=GEOJSON`,
  THSR_STATIONS:  `${TDX_BASE_URL}/v3/Rail/THSR/Station?$format=GEOJSON`,
  TRTC_STATIONS:  `${TDX_BASE_URL}/v3/Rail/Metro/Station/TRTC?$format=GEOJSON`,
  TYMC_STATIONS:  `${TDX_BASE_URL}/v3/Rail/Metro/Station/TYMC?$format=GEOJSON`,
  KRTC_STATIONS:  `${TDX_BASE_URL}/v3/Rail/Metro/Station/KRTC?$format=GEOJSON`,
  TMRT_STATIONS:  `${TDX_BASE_URL}/v3/Rail/Metro/Station/TMRT?$format=GEOJSON`,

  // Lines / shapes (LineString / MultiLineString geometries)
  TRA_LINES:      `${TDX_BASE_URL}/v3/Rail/TRA/Shape?$format=GEOJSON`,
  THSR_LINES:     `${TDX_BASE_URL}/v3/Rail/THSR/Shape?$format=GEOJSON`,
  TRTC_LINES:     `${TDX_BASE_URL}/v3/Rail/Metro/Shape/TRTC?$format=GEOJSON`,
  TYMC_LINES:     `${TDX_BASE_URL}/v3/Rail/Metro/Shape/TYMC?$format=GEOJSON`,
  KRTC_LINES:     `${TDX_BASE_URL}/v3/Rail/Metro/Shape/KRTC?$format=GEOJSON`,
  TMRT_LINES:     `${TDX_BASE_URL}/v3/Rail/Metro/Shape/TMRT?$format=GEOJSON`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Fetch a GeoJSON endpoint with the Bearer token
// ─────────────────────────────────────────────────────────────────────────────
async function fetchGeoJSON(url, accessToken) {
  console.log(`  Fetching: ${url}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.warn(`  ⚠️  ${url} → ${res.status} — skipping`);
    return null;
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Parse and insert station features
//
// TDX GeoJSON station feature structure (approximate):
// {
//   type: 'Feature',
//   geometry: { type: 'Point', coordinates: [lng, lat] },
//   properties: {
//     StationID: 'TRA-001',
//     StationName: { Zh_tw: '台北', En: 'Taipei' },
//     LineID: 'TRA-WestLine',
//     ...
//   }
// }
//
// Adapt the field mappings below to match the actual TDX response schema.
// ─────────────────────────────────────────────────────────────────────────────
async function insertStations(supabase, featureCollection, systemType) {
  if (!featureCollection?.features?.length) {
    console.log(`  No station features for ${systemType}`);
    return;
  }

  const rows = featureCollection.features
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({
      station_id:   f.properties.StationID ?? f.properties.station_id ?? '',
      station_name: f.properties.StationName?.Zh_tw ?? f.properties.station_name ?? '',
      system_type:  systemType,
      line_id:      f.properties.LineID ?? f.properties.line_id ?? '',
      // Use ST_GeomFromGeoJSON to store the Point geometry
      // Supabase JS client does not yet support direct geometry literals;
      // we pass the GeoJSON string and use an RPC or raw SQL:
      //   INSERT … geom = ST_GeomFromGeoJSON('{"type":"Point","coordinates":[…]}')
      geom:         `ST_GeomFromGeoJSON('${JSON.stringify(f.geometry)}')`,
    }));

  // TODO: replace with a Supabase RPC or raw SQL call that accepts
  // ST_GeomFromGeoJSON.  The snippet below shows the intended approach:
  //
  //   const { error } = await supabase.rpc('insert_stations_bulk', { rows });
  //
  // For now log the first row to confirm the shape:
  console.log(`  ${systemType} stations parsed: ${rows.length} features`);
  if (rows.length) console.log('  Sample row:', JSON.stringify(rows[0], null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Parse and insert line features
//
// TDX GeoJSON line feature structure (approximate):
// {
//   type: 'Feature',
//   geometry: { type: 'LineString' | 'MultiLineString', coordinates: … },
//   properties: {
//     LineID: 'TRA-WestLine',
//     LineName: { Zh_tw: '縱貫線', En: 'Western Line' },
//     ...
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────
async function insertLines(supabase, featureCollection, systemType, colorHex) {
  if (!featureCollection?.features?.length) {
    console.log(`  No line features for ${systemType}`);
    return;
  }

  const rows = featureCollection.features
    .filter((f) => ['LineString', 'MultiLineString'].includes(f.geometry?.type))
    .map((f) => {
      // Normalise LineString → MultiLineString for the DB schema
      const geomJson =
        f.geometry.type === 'LineString'
          ? {
              type: 'MultiLineString',
              coordinates: [f.geometry.coordinates],
            }
          : f.geometry;

      return {
        line_id:     f.properties.LineID ?? f.properties.line_id ?? '',
        line_name:   f.properties.LineName?.Zh_tw ?? f.properties.line_name ?? '',
        system_type: systemType,
        color_hex:   colorHex,
        geom:        `ST_GeomFromGeoJSON('${JSON.stringify(geomJson)}')`,
      };
    });

  console.log(`  ${systemType} lines parsed: ${rows.length} features`);
  if (rows.length) console.log('  Sample row:', JSON.stringify(rows[0], null, 2));
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
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚂  Rail Stamp Rally — TDX data ingestion script');
  console.log('─'.repeat(60));

  // Validate environment
  if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET) {
    throw new Error('TDX_CLIENT_ID and TDX_CLIENT_SECRET must be set in .env.local');
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase URL/key must be set in .env.local');
  }

  // Initialise Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Step 1 — Get TDX token
  const token = await getTdxAccessToken();

  // Step 2 — Fetch all datasets in parallel
  console.log('\n📡  Fetching GeoJSON from TDX API…');
  const [
    traStations, thsrStations, trtcStations, tymcStations, krtcStations, tmrtStations,
    traLines,    thsrLines,    trtcLines,    tymcLines,    krtcLines,    tmrtLines,
  ] = await Promise.all([
    fetchGeoJSON(TDX_ENDPOINTS.TRA_STATIONS,  token),
    fetchGeoJSON(TDX_ENDPOINTS.THSR_STATIONS, token),
    fetchGeoJSON(TDX_ENDPOINTS.TRTC_STATIONS, token),
    fetchGeoJSON(TDX_ENDPOINTS.TYMC_STATIONS, token),
    fetchGeoJSON(TDX_ENDPOINTS.KRTC_STATIONS, token),
    fetchGeoJSON(TDX_ENDPOINTS.TMRT_STATIONS, token),
    fetchGeoJSON(TDX_ENDPOINTS.TRA_LINES,     token),
    fetchGeoJSON(TDX_ENDPOINTS.THSR_LINES,    token),
    fetchGeoJSON(TDX_ENDPOINTS.TRTC_LINES,    token),
    fetchGeoJSON(TDX_ENDPOINTS.TYMC_LINES,    token),
    fetchGeoJSON(TDX_ENDPOINTS.KRTC_LINES,    token),
    fetchGeoJSON(TDX_ENDPOINTS.TMRT_LINES,    token),
  ]);

  // Step 3 — Parse & insert stations
  console.log('\n📍  Processing stations…');
  await insertStations(supabase, traStations,  'TRA');
  await insertStations(supabase, thsrStations, 'HSR');
  await insertStations(supabase, trtcStations, 'TRTC');
  await insertStations(supabase, tymcStations, 'TYMC');
  await insertStations(supabase, krtcStations, 'KRTC');
  await insertStations(supabase, tmrtStations, 'TMRT');

  // Step 4 — Parse & insert lines
  console.log('\n🛤   Processing lines…');
  await insertLines(supabase, traLines,  'TRA',  SYSTEM_COLORS.TRA);
  await insertLines(supabase, thsrLines, 'HSR',  SYSTEM_COLORS.HSR);
  await insertLines(supabase, trtcLines, 'TRTC', SYSTEM_COLORS.TRTC);
  await insertLines(supabase, tymcLines, 'TYMC', SYSTEM_COLORS.TYMC);
  await insertLines(supabase, krtcLines, 'KRTC', SYSTEM_COLORS.KRTC);
  await insertLines(supabase, tmrtLines, 'TMRT', SYSTEM_COLORS.TMRT);

  console.log('\n✅  Ingestion script complete.');
  console.log(
    'NOTE: The geom column inserts above are placeholder stubs.\n' +
    '      To actually write to Supabase you should:\n' +
    '      a) Call a Supabase Edge Function that runs the SQL, OR\n' +
    '      b) Use a direct psql connection with the service-role password\n' +
    '         and run: INSERT INTO railway_stations … VALUES … ST_GeomFromGeoJSON(…)',
  );
}

main().catch((err) => {
  console.error('❌  Ingestion failed:', err);
  process.exit(1);
});
