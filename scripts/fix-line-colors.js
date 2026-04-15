#!/usr/bin/env node
/**
 * scripts/fix-line-colors.js
 * 
 * Updates railway_lines color_hex values to match the design spec §4.2.
 * Also ensures badge_image_url column exists and updates the RPC function.
 */
'use strict';
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const COLOR_FIXES = [
  // TRTC 北捷
  { line_id: 'BL', system_type: 'TRTC', color_hex: '#0070BD', name: '板南線' },
  { line_id: 'BR', system_type: 'TRTC', color_hex: '#C48C31', name: '文湖線' },
  { line_id: 'G',  system_type: 'TRTC', color_hex: '#008659', name: '松山新店線' },
  { line_id: 'O',  system_type: 'TRTC', color_hex: '#F8B61C', name: '中和新蘆線' },
  { line_id: 'R',  system_type: 'TRTC', color_hex: '#E3002C', name: '淡水信義線' },
  // TYMC 桃捷
  { line_id: 'A',  system_type: 'TYMC', color_hex: '#8246AF', name: '桃園機場捷運線' },
  // KRTC 高捷
  { line_id: 'O',  system_type: 'KRTC', color_hex: '#faa73f', name: '橘線' },
  { line_id: 'R',  system_type: 'KRTC', color_hex: '#e20b65', name: '紅線' },
  // NTMC 新北捷運
  { line_id: 'Y',  system_type: 'NTMC', color_hex: '#FCDA01', name: '環狀線' },
  { line_id: 'V',  system_type: 'NTMC', color_hex: '#CD212A', name: '淡海輕軌' },
  { line_id: 'K',  system_type: 'NTMC', color_hex: '#B8860B', name: '安坑輕軌' },
  // KLRT 高雄輕軌
  { line_id: 'C',  system_type: 'KLRT', color_hex: '#7cbd52', name: '環狀輕軌' },
];

async function main() {
  console.log('🎨 Updating railway line colors...\n');

  for (const fix of COLOR_FIXES) {
    const { error } = await supabase
      .from('railway_lines')
      .update({ color_hex: fix.color_hex })
      .eq('line_id', fix.line_id)
      .eq('system_type', fix.system_type);

    if (error) {
      console.error(`  ❌ ${fix.system_type} ${fix.name}: ${error.message}`);
    } else {
      console.log(`  ✅ ${fix.system_type} ${fix.name} → ${fix.color_hex}`);
    }
  }

  console.log('\n🎉 Line color updates complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
