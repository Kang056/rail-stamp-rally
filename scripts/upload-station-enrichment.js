#!/usr/bin/env node
/**
 * scripts/upload-station-enrichment.js
 *
 * Uploads generated station enrichment data (history_desc, established_year,
 * badge_image_url) to Supabase railway_stations table.
 *
 * Usage:
 *   node scripts/upload-station-enrichment.js
 *   node scripts/upload-station-enrichment.js --dry-run
 */
'use strict';

require('dotenv').config({ path: '.env.local' });

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT = path.resolve(__dirname, '..', 'data', 'station-enrichment.json');
const BATCH_SIZE = 50;

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!fs.existsSync(INPUT)) {
    console.error(`❌ Input file not found: ${INPUT}`);
    console.error('   Run "node scripts/generate-station-data.js" first.');
    process.exit(1);
  }

  const enrichment = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
  console.log(`📂 Loaded ${enrichment.length} station enrichment records`);

  if (dryRun) {
    console.log('\n🔍 Dry-run mode — showing first 3 records:\n');
    for (const r of enrichment.slice(0, 3)) {
      console.log(`  ${r.station_id} (${r.system_type})`);
      console.log(`    year: ${r.established_year}`);
      console.log(`    desc: ${r.history_desc?.substring(0, 80)}...`);
      console.log(`    badge: ${r.badge_image_url?.substring(0, 60)}...`);
      console.log();
    }
    console.log('Done (dry-run).');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let successCount = 0;
  let failCount = 0;

  // Process in batches
  for (let i = 0; i < enrichment.length; i += BATCH_SIZE) {
    const batch = enrichment.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(enrichment.length / BATCH_SIZE);

    console.log(`⬆️  Batch ${batchNum}/${totalBatches} (${batch.length} stations)...`);

    // Update each station in the batch
    const promises = batch.map(async (record) => {
      const { error } = await supabase
        .from('railway_stations')
        .update({
          established_year: record.established_year,
          history_desc: record.history_desc,
          badge_image_url: record.badge_image_url,
        })
        .eq('station_id', record.station_id)
        .eq('system_type', record.system_type);

      if (error) {
        console.error(`   ❌ ${record.station_id}: ${error.message}`);
        failCount++;
      } else {
        successCount++;
      }
    });

    await Promise.all(promises);
  }

  console.log(`\n📊 Upload summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed:  ${failCount}`);

  if (failCount > 0) {
    console.log('\n⚠️  Some records failed to upload.');
    process.exit(1);
  } else {
    console.log('\n🎉 All station enrichment data uploaded successfully!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
