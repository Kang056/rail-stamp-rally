#!/usr/bin/env node
/**
 * Simple API-level integration test skeleton for the check-in RPC.
 *
 * Usage:
 *   - Create a .env.local (or set env vars) with:
 *       - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *       - SUPABASE_SERVICE_ROLE_KEY (required to inspect user_collected_badges)
 *       - TEST_USER_ID (UUID of a test user in Supabase Auth)
 *       - CHECKIN_RPC_NAME (optional, default: check_in)
 *       - TEST_USER_LAT / TEST_USER_LON (optional sample coords; defaults to Taipei Main Station)
 *   - Run: node tests/api/checkin.test.js
 *
 * Notes:
 *   - This is a lightweight script (no test runner) that demonstrates how to call
 *     a Supabase RPC and optionally verify the side effects using the service key.
 *   - Do NOT commit production/service-role keys to version control. Use environment variables / secrets.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHECKIN_RPC_NAME = process.env.CHECKIN_RPC_NAME || 'check_in';
const TEST_USER_ID = process.env.TEST_USER_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !TEST_USER_ID) {
  console.log('Skipping API checkin test: Missing required env vars.');
  console.log('Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, TEST_USER_ID');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

(async function main() {
  const lat = parseFloat(process.env.TEST_USER_LAT || '25.0478'); // Taipei Main Station (sample)
  const lon = parseFloat(process.env.TEST_USER_LON || '121.5170');

  console.log(`Calling RPC "${CHECKIN_RPC_NAME}" with coords lat=${lat}, lon=${lon}, user_id=${TEST_USER_ID}`);

  // The RPC parameter names are implementation dependent. Support both
  // legacy `check_in(user_lat, user_lon, user_id)` and the project's
  // `checkin(user_lon, user_lat, p_user_id)` signatures.
  const rpcParams = CHECKIN_RPC_NAME === 'checkin'
    ? { user_lon: lon, user_lat: lat, p_user_id: TEST_USER_ID }
    : { user_lat: lat, user_lon: lon, user_id: TEST_USER_ID };

  const { data, error } = await supabase.rpc(CHECKIN_RPC_NAME, rpcParams);

  if (error) {
    console.error('RPC call failed:', error);
    process.exit(2);
  }

  console.log('RPC response:', JSON.stringify(data, null, 2));

  // Flexible assertions / checks
  const first = Array.isArray(data) ? data[0] : data;

  if (first && (first.ok === true || first.station_id)) {
    console.log('RPC returned success-like response.');
  } else {
    console.warn('RPC did not return expected ok/station_id shape. Implementation may differ.');
  }

  // If we have the service role key, verify the record exists in user_collected_badges
  try {
    const { data: badges, error: badgesErr } = await supabase
      .from('user_collected_badges')
      .select('id, user_id, station_id, unlocked_at')
      .eq('user_id', TEST_USER_ID)
      .limit(10);

    if (badgesErr) {
      console.warn('Could not query user_collected_badges:', badgesErr.message || badgesErr);
    } else {
      console.log(`Found ${badges.length} badge records for user ${TEST_USER_ID}.`);
      if (badges.length) console.log('Example record:', badges[0]);
    }
  } catch (e) {
    console.warn('Skipping DB verification due to error:', e.message || e);
  }

  // Call RPC again — many implementations will return an "already_unlocked" status
  const { data: data2, error: err2 } = await supabase.rpc(CHECKIN_RPC_NAME, rpcParams);

  if (err2) {
    console.error('Second RPC call failed:', err2);
    process.exit(2);
  }

  console.log('Second RPC response:', JSON.stringify(data2, null, 2));
  const second = Array.isArray(data2) ? data2[0] : data2;
  if (second && (second.already_unlocked || second.status === 'already_unlocked' || second === 'already_unlocked')) {
    console.log('Second call indicates already_unlocked as expected.');
  } else {
    console.warn('Second call did not return an already_unlocked marker. Implementation may instead rely on unique constraints.');
  }

  console.log('API checkin script finished (may be partial if DB RPC/table not implemented).');
  process.exit(0);
})();
