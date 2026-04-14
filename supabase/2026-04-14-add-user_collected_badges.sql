-- Migration: Add user_collected_badges table, RLS policies, and checkin RPC
-- Created: 2026-04-14

-- Table for storing which badges a user has collected (per station)
CREATE TABLE IF NOT EXISTS user_collected_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  station_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one badge per user per station
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_collected_badges_user_station
  ON user_collected_badges (user_id, station_id);

-- Enable Row Level Security
ALTER TABLE user_collected_badges ENABLE ROW LEVEL SECURITY;

-- Policies
-- Allow authenticated users to INSERT only when auth.uid()::uuid = user_id
CREATE POLICY "Insert own badges"
  ON user_collected_badges FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::uuid = user_id);

-- Allow authenticated users to SELECT only their own badges
CREATE POLICY "Select own badges"
  ON user_collected_badges FOR SELECT TO authenticated
  USING (auth.uid()::uuid = user_id);

-- checkin RPC: attempt to find a station within 100m and record badge
CREATE OR REPLACE FUNCTION checkin(user_lon double precision, user_lat double precision, user_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_station_id TEXT;
  v_station_name TEXT;
  v_badge_image_url TEXT;
  v_inserted_id UUID;
  v_already_unlocked BOOLEAN := false;
BEGIN
  -- Find one nearby station within 100 meters
  SELECT station_id, station_name, history_image_url
  INTO v_station_id, v_station_name, v_badge_image_url
  FROM railway_stations
  WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    100
  )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_nearby');
  END IF;

  -- Try to insert a badge record; if already exists do nothing
  INSERT INTO user_collected_badges (user_id, station_id, unlocked_at)
    VALUES (user_id, v_station_id, NOW())
    ON CONFLICT (user_id, station_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    v_already_unlocked := true;
  ELSE
    v_already_unlocked := false;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'already_unlocked', v_already_unlocked,
    'station_id', v_station_id,
    'station_name', v_station_name,
    'badge_image_url', v_badge_image_url
  );
END;
$$;
