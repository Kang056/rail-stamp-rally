#!/usr/bin/env node
/**
 * scripts/collect-station-images.js
 *
 * Collects station image URLs from Chinese Wikipedia for all 531 stations.
 * Uses the Wikipedia pageimages API to fetch thumbnail URLs.
 *
 * Usage:
 *   node scripts/collect-station-images.js          # Fetch images → data/station-images.json
 *   node scripts/collect-station-images.js --upload  # Upload to Supabase after fetching
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// Load environment for Supabase upload mode
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') }); } catch { /* ignore */ }

const INPUT  = path.resolve(__dirname, '..', 'data', 'tdx-railway-data.json');
const OUTPUT = path.resolve(__dirname, '..', 'data', 'station-images.json');

const THUMB_SIZE = 600; // thumbnail width in pixels
const BATCH_SIZE = 50;  // Wikipedia API supports up to 50 titles per query
const DELAY_MS   = 500; // delay between batches to avoid rate limiting

// ─────────────────────────────────────────────
// Wikipedia title mapping for station names
// ─────────────────────────────────────────────
// Wikipedia article naming conventions for Taiwan stations:
//  TRA: "{name}車站"  (e.g. 基隆車站)
//  HSR: "高鐵{name}站" for some, or "{name}站"
//  MRT: "{name}站" with system prefix for disambiguation
const SYSTEM_WIKI_SUFFIX = {
  TRA:  '車站',
  HSR:  '站',
  TRTC: '站',
  TYMC: '站',
  KRTC: '站',
  TMRT: '站',
  NTMC: '站',
  KLRT: '站',
};

// Manual overrides for stations with non-standard Wikipedia titles
const WIKI_TITLE_OVERRIDES = {
  // HSR stations
  'HSR-0990': '南港車站',
  'HSR-1000': '臺北車站',
  'HSR-1020': '板橋車站_(臺灣)',
  'HSR-1035': '桃園車站_(高鐵)',
  'HSR-1070': '新竹車站_(高鐵)',
  'HSR-2070': '苗栗車站_(高鐵)',
  'HSR-3000': '臺中車站_(高鐵)',
  'HSR-3200': '彰化車站_(高鐵)',
  'HSR-3400': '雲林車站_(高鐵)',
  'HSR-4080': '嘉義車站_(高鐵)',
  'HSR-4200': '臺南車站_(高鐵)',
  'HSR-5010': '左營車站',
  // TRA - stations with disambiguation
  'TRA-1000': '臺北車站',
  'TRA-1020': '板橋車站_(臺灣)',
  'TRA-3360': '臺中車站',
  'TRA-4220': '臺南車站',
  'TRA-5060': '高雄車站',
  'TRA-1080': '桃園車站_(臺鐵)',
  'TRA-1190': '新竹車站',
  'TRA-2070': '苗栗車站',
  'TRA-3400': '彰化車站',
  // TRTC
  'TRTC-BL12': '臺北車站',
  'TRTC-R10':  '臺北車站',
};

function getWikiTitle(station) {
  if (WIKI_TITLE_OVERRIDES[station.station_id]) {
    return WIKI_TITLE_OVERRIDES[station.station_id];
  }
  const suffix = SYSTEM_WIKI_SUFFIX[station.system_type] || '站';
  return station.station_name + suffix;
}

// ─────────────────────────────────────────────
// Wikipedia API helper
// ─────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RailStampRally/1.0 (github.com/rail-stamp-rally)' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchWikipediaImages(titles) {
  // Wikipedia API: query multiple page images at once (up to 50)
  const titlesParam = titles.map(t => encodeURIComponent(t)).join('|');
  const url = `https://zh.wikipedia.org/w/api.php?action=query&titles=${titlesParam}&prop=pageimages&pithumbsize=${THUMB_SIZE}&format=json&redirects=1`;
  const result = await fetchJson(url);
  const pages = result?.query?.pages ?? {};
  const redirects = {};
  // Build redirect map: from → to
  if (result?.query?.redirects) {
    for (const r of result.query.redirects) {
      redirects[r.from] = r.to;
    }
  }
  // Build normalized map
  const normalized = {};
  if (result?.query?.normalized) {
    for (const n of result.query.normalized) {
      normalized[n.from] = n.to;
    }
  }

  const imageMap = {};
  for (const page of Object.values(pages)) {
    if (page.thumbnail?.source) {
      imageMap[page.title] = page.thumbnail.source;
    }
  }

  return { imageMap, redirects, normalized };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const doUpload = process.argv.includes('--upload');

  console.log('Reading station data from:', INPUT);
  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const allStations = [];
  for (const systemStations of Object.values(raw.stations)) {
    for (const s of systemStations) {
      allStations.push(s);
    }
  }
  console.log(`Total stations: ${allStations.length}`);

  // Build title → station mapping
  const titleToStations = {};
  const stationTitles = {};
  for (const s of allStations) {
    const title = getWikiTitle(s);
    stationTitles[s.station_id] = title;
    if (!titleToStations[title]) titleToStations[title] = [];
    titleToStations[title].push(s.station_id);
  }

  // Deduplicate titles for API calls
  const uniqueTitles = [...new Set(Object.values(stationTitles))];
  console.log(`Unique Wikipedia titles to query: ${uniqueTitles.length}`);

  // Fetch in batches
  const allImages = {};
  for (let i = 0; i < uniqueTitles.length; i += BATCH_SIZE) {
    const batch = uniqueTitles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniqueTitles.length / BATCH_SIZE);
    process.stdout.write(`Fetching batch ${batchNum}/${totalBatches} (${batch.length} titles)...`);

    try {
      const { imageMap, redirects, normalized } = await fetchWikipediaImages(batch);
      // Map results back: check original title, normalized form, and redirect target
      for (const title of batch) {
        const norm = normalized[title] || title;
        const redir = redirects[norm] || norm;
        const url = imageMap[title] || imageMap[norm] || imageMap[redir];
        if (url) allImages[title] = url;
      }
      const found = batch.filter(t => allImages[t]).length;
      console.log(` ${found}/${batch.length} images found`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }

    if (i + BATCH_SIZE < uniqueTitles.length) {
      await sleep(DELAY_MS);
    }
  }

  // Build final output: station_id → image_url
  const results = [];
  let foundCount = 0;
  for (const s of allStations) {
    const title = stationTitles[s.station_id];
    const imageUrl = allImages[title] || null;
    if (imageUrl) foundCount++;
    results.push({
      station_id: s.station_id,
      system_type: s.system_type,
      station_name: s.station_name,
      history_image_url: imageUrl,
    });
  }

  console.log(`\nResults: ${foundCount}/${allStations.length} stations have images`);

  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Written to: ${OUTPUT}`);

  // Upload to Supabase
  if (doUpload) {
    await uploadToSupabase(results.filter(r => r.history_image_url));
  }
}

async function uploadToSupabase(records) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.log('Set these in .env.local to enable upload.');
    process.exit(1);
  }

  console.log(`\nUploading ${records.length} image URLs to Supabase...`);

  // Update in batches of 50
  const UPLOAD_BATCH = 50;
  let updated = 0;

  for (let i = 0; i < records.length; i += UPLOAD_BATCH) {
    const batch = records.slice(i, i + UPLOAD_BATCH);

    for (const record of batch) {
      const apiUrl = `${url}/rest/v1/railway_stations?station_id=eq.${encodeURIComponent(record.station_id)}&system_type=eq.${encodeURIComponent(record.system_type)}`;

      const body = JSON.stringify({ history_image_url: record.history_image_url });

      try {
        const response = await fetch(apiUrl, {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body,
        });

        if (response.ok) {
          updated++;
        } else {
          const text = await response.text();
          console.error(`  Failed ${record.station_id}: ${response.status} ${text}`);
        }
      } catch (err) {
        console.error(`  Error ${record.station_id}: ${err.message}`);
      }
    }

    process.stdout.write(`  Updated ${Math.min(i + UPLOAD_BATCH, records.length)}/${records.length}\r`);
    await sleep(200);
  }

  console.log(`\nDone! Updated ${updated} station image URLs.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
