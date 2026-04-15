#!/usr/bin/env node
/**
 * scripts/test-tdx.js
 *
 * Quick test script to verify TDX API v2 endpoints return valid JSON data.
 * Tests both station and shape endpoints and logs response structure.
 */
'use strict';
require('dotenv').config({ path: '.env.local' });

async function test() {
  // Get token
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.TDX_CLIENT_ID,
    client_secret: process.env.TDX_CLIENT_SECRET,
  });
  const tokRes = await fetch(
    'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  );
  const { access_token } = await tokRes.json();
  console.log('Token OK\n');

  const headers = { Authorization: `Bearer ${access_token}` };
  const BASE = 'https://tdx.transportdata.tw/api/basic';

  // Test correct v2 endpoints with $format=JSON
  const urls = [
    // TRA Station
    `${BASE}/v2/Rail/TRA/Station?$format=JSON`,
    // THSR Station
    `${BASE}/v2/Rail/THSR/Station?$format=JSON`,
    // Metro Station (TRTC)
    `${BASE}/v2/Rail/Metro/Station/TRTC?$format=JSON`,
    // TRA Shape
    `${BASE}/v2/Rail/TRA/Shape?$format=JSON`,
    // THSR Shape
    `${BASE}/v2/Rail/THSR/Shape?$format=JSON`,
    // Metro Shape (TRTC)
    `${BASE}/v2/Rail/Metro/Shape/TRTC?$format=JSON`,
    // NTDLRT (淡海輕軌) Station — mapped to NTMC
    `${BASE}/v2/Rail/Metro/Station/NTDLRT?$format=JSON`,
    // NTALRT (安坑輕軌) Station — mapped to NTMC
    `${BASE}/v2/Rail/Metro/Station/NTALRT?$format=JSON`,
  ];

  for (const url of urls) {
    console.log('--- Fetching:', url);
    const res = await fetch(url, { headers });
    console.log('Status:', res.status);

    if (res.ok) {
      const json = await res.json();
      const isArray = Array.isArray(json);
      console.log('Response is array:', isArray);
      console.log('Record count:', isArray ? json.length : 'N/A');

      if (isArray && json.length > 0) {
        const first = json[0];
        console.log('First record keys:', Object.keys(first).join(', '));

        // Show station-specific fields
        if (first.StationPosition) {
          console.log('StationUID:', first.StationUID);
          console.log('StationName:', JSON.stringify(first.StationName));
          console.log('StationPosition:', JSON.stringify(first.StationPosition));
        }

        // Show shape-specific fields
        if (first.Geometry) {
          console.log('LineID:', first.LineID);
          console.log('LineName:', JSON.stringify(first.LineName));
          console.log('Geometry (first 200 chars):', first.Geometry?.substring(0, 200));
        }
      }
    } else {
      const text = await res.text();
      console.log('Error body:', text.substring(0, 500));
    }

    console.log('');
    // Wait 3s between requests (TDX free tier rate limit)
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('✅  Test complete.');
}

test().catch((e) => console.error(e));
