-- Migration: Enhance checkin RPC (return unlocked_at, fix badge_image_url)
--            + new get_user_badges RPC
-- Created: 2026-04-16

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Replace checkin() to return unlocked_at and fix badge_image_url source
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_unlocked_at TIMESTAMPTZ;
BEGIN
  -- Find one nearby station within 100 meters
  -- Use badge_image_url (not history_image_url) for the badge
  SELECT station_id, station_name, badge_image_url
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
    -- Already unlocked: fetch the original unlocked_at timestamp
    v_already_unlocked := true;
    SELECT unlocked_at INTO v_unlocked_at
    FROM user_collected_badges
    WHERE user_collected_badges.user_id = checkin.user_id
      AND user_collected_badges.station_id = v_station_id;
  ELSE
    v_already_unlocked := false;
    v_unlocked_at := NOW();
  END IF;

  RETURN json_build_object(
    'ok', true,
    'already_unlocked', v_already_unlocked,
    'station_id', v_station_id,
    'station_name', v_station_name,
    'badge_image_url', v_badge_image_url,
    'unlocked_at', v_unlocked_at
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. New RPC: get_user_badges – returns all collected badges for a user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_badges(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      ucb.station_id,
      ucb.unlocked_at,
      rs.station_name,
      rs.badge_image_url
    FROM user_collected_badges ucb
    JOIN railway_stations rs ON rs.station_id = ucb.station_id
    WHERE ucb.user_id = p_user_id
    ORDER BY ucb.unlocked_at DESC
  ) t;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grant execute to authenticated role
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_user_badges(uuid) TO authenticated;
