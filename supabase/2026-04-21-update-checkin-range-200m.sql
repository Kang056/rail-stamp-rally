-- Migration: Update checkin() RPC search radius from 100m to 200m
-- Created: 2026-04-21

CREATE OR REPLACE FUNCTION checkin(user_lon double precision, user_lat double precision, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_station_id TEXT;
  v_station_name TEXT;
  v_badge_image_url TEXT;
  v_inserted_id UUID;
  v_already_unlocked BOOLEAN := false;
  v_already_checked_today BOOLEAN := false;
  v_unlocked_at TIMESTAMPTZ;
  v_log_inserted_id UUID;
BEGIN
  -- Find nearby station within 200 m
  SELECT station_id, station_name, badge_image_url
  INTO v_station_id, v_station_name, v_badge_image_url
  FROM railway_stations
  WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    200
  )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_nearby');
  END IF;

  -- Check if already checked in today
  SELECT id INTO v_log_inserted_id
  FROM checkin_logs
  WHERE user_id = p_user_id
    AND station_id = v_station_id
    AND checkin_date = CURRENT_DATE;

  IF FOUND THEN
    v_already_checked_today := true;
    RETURN json_build_object(
      'ok', false,
      'reason', 'already_checked_today',
      'station_id', v_station_id,
      'station_name', v_station_name
    );
  END IF;

  -- Insert daily check-in log
  INSERT INTO checkin_logs (user_id, station_id, checkin_date)
    VALUES (p_user_id, v_station_id, CURRENT_DATE)
    ON CONFLICT DO NOTHING;

  -- Insert badge (one-time, for first visit)
  INSERT INTO user_collected_badges (user_id, station_id, unlocked_at)
    VALUES (p_user_id, v_station_id, NOW())
    ON CONFLICT (user_id, station_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    v_already_unlocked := true;
    SELECT unlocked_at INTO v_unlocked_at
    FROM user_collected_badges
    WHERE user_collected_badges.user_id = p_user_id
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
