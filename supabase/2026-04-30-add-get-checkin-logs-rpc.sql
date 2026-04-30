-- Migration: Add get_user_checkin_logs RPC
-- Created: 2026-04-30
-- Purpose: Return full check-in records (time + station name) for a user, newest first.

CREATE OR REPLACE FUNCTION get_user_checkin_logs(p_user_id uuid)
RETURNS TABLE(created_at timestamptz, station_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT cl.created_at, s.station_name
  FROM checkin_logs cl
  JOIN railway_stations s ON s.station_id = cl.station_id
  WHERE cl.user_id = p_user_id
  ORDER BY cl.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_user_checkin_logs(uuid) TO authenticated;
