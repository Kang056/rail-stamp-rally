-- Migration: Fix line colors + add badge_image_url to RPC output
-- Created: 2026-04-15

-- ─────────────────────────────────────────────
-- 1. Add badge_image_url column if not exists
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'railway_stations' AND column_name = 'badge_image_url'
  ) THEN
    ALTER TABLE railway_stations ADD COLUMN badge_image_url TEXT;
  END IF;
END
$$;

-- ─────────────────────────────────────────────
-- 2. Fix metro/LRT line colors per design spec §4.2
-- ─────────────────────────────────────────────

-- TRTC 北捷
UPDATE railway_lines SET color_hex = '#0070BD' WHERE line_id = 'BL' AND system_type = 'TRTC';
UPDATE railway_lines SET color_hex = '#C48C31' WHERE line_id = 'BR' AND system_type = 'TRTC';
UPDATE railway_lines SET color_hex = '#008659' WHERE line_id = 'G'  AND system_type = 'TRTC';
UPDATE railway_lines SET color_hex = '#F8B61C' WHERE line_id = 'O'  AND system_type = 'TRTC';
UPDATE railway_lines SET color_hex = '#E3002C' WHERE line_id = 'R'  AND system_type = 'TRTC';

-- TYMC 桃捷
UPDATE railway_lines SET color_hex = '#8246AF' WHERE line_id = 'A' AND system_type = 'TYMC';

-- KRTC 高捷
UPDATE railway_lines SET color_hex = '#faa73f' WHERE line_id = 'O' AND system_type = 'KRTC';
UPDATE railway_lines SET color_hex = '#e20b65' WHERE line_id = 'R' AND system_type = 'KRTC';

-- NTMC 新北捷運
UPDATE railway_lines SET color_hex = '#FCDA01' WHERE line_id = 'Y' AND system_type = 'NTMC';
UPDATE railway_lines SET color_hex = '#CD212A' WHERE line_id = 'V' AND system_type = 'NTMC';
UPDATE railway_lines SET color_hex = '#B8860B' WHERE line_id = 'K' AND system_type = 'NTMC';

-- KLRT 高雄輕軌
UPDATE railway_lines SET color_hex = '#7cbd52' WHERE line_id = 'C' AND system_type = 'KLRT';

-- ─────────────────────────────────────────────
-- 3. Update get_all_railway_geojson to include badge_image_url
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_railway_geojson()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', json_agg(feature)
  )
  FROM (
    -- Station features
    SELECT json_build_object(
      'type',       'Feature',
      'geometry',   ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'feature_type',       'station',
        'id',                 id,
        'station_id',         station_id,
        'station_name',       station_name,
        'system_type',        system_type,
        'line_id',            line_id,
        'established_year',   established_year,
        'history_desc',       history_desc,
        'history_image_url',  history_image_url,
        'badge_image_url',    badge_image_url
      )
    ) AS feature
    FROM railway_stations

    UNION ALL

    -- Line features
    SELECT json_build_object(
      'type',       'Feature',
      'geometry',   ST_AsGeoJSON(geom)::json,
      'properties', json_build_object(
        'feature_type', 'line',
        'id',           id,
        'line_id',      line_id,
        'line_name',    line_name,
        'system_type',  system_type,
        'color_hex',    color_hex,
        'history_desc', history_desc
      )
    ) AS feature
    FROM railway_lines
  ) features;
$$;
