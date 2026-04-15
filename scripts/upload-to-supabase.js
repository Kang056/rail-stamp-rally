#!/usr/bin/env node
/**
 * scripts/upload-to-supabase.js
 *
 * Reads local railway data JSON (produced by ingest-tdx-data.js)
 * and uploads to Supabase via insert_stations_bulk / insert_lines_bulk RPCs.
 *
 * Usage:
 *   node scripts/upload-to-supabase.js              # Upload from default data/tdx-railway-data.json
 *   node scripts/upload-to-supabase.js --dry-run     # Show what would be uploaded
 *   node scripts/upload-to-supabase.js --file path   # Use alternate JSON file
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SYSTEM_TYPES = ['TRA', 'HSR', 'TRTC', 'TYMC', 'KRTC', 'TMRT', 'NTMC', 'KLRT'];

const DEFAULT_FILE = path.resolve(__dirname, '..', 'data', 'tdx-railway-data.json');

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { dryRun: false, file: DEFAULT_FILE };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--file' && argv[i + 1]) {
      args.file = path.resolve(argv[++i]);
    }
  }
  return args;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  // Validate env vars
  if (!args.dryRun) {
    if (!SUPABASE_URL) {
      console.error('❌  Missing env var NEXT_PUBLIC_SUPABASE_URL');
      process.exit(1);
    }
    if (!SUPABASE_SERVICE_KEY) {
      console.error('❌  Missing env var SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
  }

  // Read input file
  if (!fs.existsSync(args.file)) {
    console.error(`❌  Input file not found: ${args.file}`);
    console.error('   Run "node scripts/ingest-tdx-data.js" first to generate it.');
    process.exit(1);
  }

  console.log(`📂  Reading ${args.file} ...`);
  const data = JSON.parse(fs.readFileSync(args.file, 'utf-8'));
  console.log(`   fetchedAt: ${data.fetchedAt}`);

  const stations = data.stations || {};
  const lines    = data.lines    || {};

  // Dry-run: just show counts
  if (args.dryRun) {
    console.log('\n🔍  Dry-run mode — no data will be uploaded.\n');
    for (const sys of SYSTEM_TYPES) {
      const sc = (stations[sys] || []).length;
      const lc = (lines[sys]    || []).length;
      if (sc === 0 && lc === 0) continue;
      console.log(`  ${sys.padEnd(6)} stations: ${String(sc).padStart(4)}   lines: ${String(lc).padStart(3)}`);
    }
    console.log('\nDone (dry-run).');
    return;
  }

  // Create Supabase client with service-role key (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Track results per system
  const results = []; // { system, stationCount, lineCount, stationOk, lineOk, stationErr, lineErr }

  for (const sys of SYSTEM_TYPES) {
    const stationRows = stations[sys] || [];
    const lineRows    = lines[sys]    || [];

    if (stationRows.length === 0 && lineRows.length === 0) continue;

    const entry = {
      system: sys,
      stationCount: stationRows.length,
      lineCount:    lineRows.length,
      stationOk:    true,
      lineOk:       true,
      stationErr:   null,
      lineErr:      null,
    };

    // Upload stations
    if (stationRows.length > 0) {
      console.log(`⬆️  ${sys} stations (${stationRows.length}) ...`);
      const { error } = await supabase.rpc('insert_stations_bulk', { rows: stationRows });
      if (error) {
        console.error(`   ❌  ${sys} stations failed: ${error.message}`);
        entry.stationOk  = false;
        entry.stationErr  = error.message;
      } else {
        console.log(`   ✅  ${sys} stations OK`);
      }
    }

    // Upload lines
    if (lineRows.length > 0) {
      console.log(`⬆️  ${sys} lines (${lineRows.length}) ...`);
      const { error } = await supabase.rpc('insert_lines_bulk', { rows: lineRows });
      if (error) {
        console.error(`   ❌  ${sys} lines failed: ${error.message}`);
        entry.lineOk  = false;
        entry.lineErr  = error.message;
      } else {
        console.log(`   ✅  ${sys} lines OK`);
      }
    }

    results.push(entry);
  }

  // Summary
  console.log('\n📊  Upload summary:');
  for (const r of results) {
    const sLabel = r.stationCount > 0
      ? `stations: ${String(r.stationCount).padStart(4)} ${r.stationOk ? '✅' : '❌ ' + r.stationErr}`
      : 'stations:    0 —';
    const lLabel = r.lineCount > 0
      ? `lines: ${String(r.lineCount).padStart(3)} ${r.lineOk ? '✅' : '❌ ' + r.lineErr}`
      : 'lines:   0 —';
    console.log(`  ${r.system.padEnd(6)} ${sLabel}  ${lLabel}`);
  }

  const failures = results.filter(r => !r.stationOk || !r.lineOk);
  if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} system(s) had failures.`);
    process.exit(1);
  } else {
    console.log('\n🎉  All uploads succeeded.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
