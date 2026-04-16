-- Migration: Fix ambiguous column reference "user_id" in checkin() RPC
--            by renaming the function parameter from user_id to p_user_id.
-- Created: 2026-04-16

CREATE OR REPLACE FUNCTION checkin(user_lon double precision, user_lat double precision, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
    VALUES (p_user_id, v_station_id, NOW())
    ON CONFLICT (user_id, station_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    -- Already unlocked: fetch the original unlocked_at timestamp
    v_already_unlocked := true;
    SELECT ucb.unlocked_at INTO v_unlocked_at
    FROM user_collected_badges ucb
    WHERE ucb.user_id = p_user_id
      AND ucb.station_id = v_station_id;
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

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION checkin(double precision, double precision, uuid) TO authenticated;
