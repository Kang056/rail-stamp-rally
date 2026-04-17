-- ══════════════════════════════════════════════════════════════════════
-- Rail Stamp Rally (鐵道集旅) — 全新 Supabase 專案一次性初始化腳本
-- 請在 Supabase SQL Editor 中一次性執行本檔案
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────
-- 1. 啟用必要的 Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- 2. 建立共用 Enum 型別
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'railway_system_type') THEN
    CREATE TYPE railway_system_type AS ENUM (
      'TRA',   -- 台灣鐵路
      'HSR',   -- 高速鐵路
      'TRTC',  -- 台北捷運
      'TYMC',  -- 桃園捷運
      'KRTC',  -- 高雄捷運
      'TMRT',  -- 台中捷運
      'NTMC',  -- 新北捷運 (淡海/安坑輕軌)
      'KLRT'   -- 高雄輕軌
    );
  END IF;
END$$;

-- ─────────────────────────────────────────────
-- 3. 建立 railway_stations 車站節點表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS railway_stations (
  id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id        TEXT             NOT NULL,
  station_name      TEXT             NOT NULL,
  system_type       railway_system_type NOT NULL,
  line_id           TEXT             NOT NULL,
  geom              GEOMETRY(Point, 4326) NOT NULL,
  established_year  INTEGER,
  history_desc      TEXT,
  history_image_url TEXT,
  badge_image_url   TEXT,
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_railway_stations_station_id
  ON railway_stations (station_id);

CREATE INDEX IF NOT EXISTS idx_railway_stations_geom
  ON railway_stations USING GIST (geom);

-- (station_id, system_type) 唯一複合索引，避免重複寫入
CREATE UNIQUE INDEX IF NOT EXISTS uq_railway_stations_station_system
  ON railway_stations (station_id, system_type);

-- ─────────────────────────────────────────────
-- 4. 建立 railway_lines 軌道路線表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS railway_lines (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id      TEXT             NOT NULL,
  line_name    TEXT             NOT NULL,
  system_type  railway_system_type NOT NULL,
  color_hex    TEXT             NOT NULL DEFAULT '#888888',
  geom         GEOMETRY(MultiLineString, 4326) NOT NULL,
  history_desc TEXT,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_railway_lines_line_id
  ON railway_lines (line_id);

CREATE INDEX IF NOT EXISTS idx_railway_lines_geom
  ON railway_lines USING GIST (geom);

-- (line_id, system_type) 唯一複合索引
CREATE UNIQUE INDEX IF NOT EXISTS uq_railway_lines_line_system
  ON railway_lines (line_id, system_type);

-- ─────────────────────────────────────────────
-- 5. 建立 user_collected_badges 使用者集章紀錄表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_collected_badges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  station_id  TEXT        NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (user_id, station_id) 唯一複合索引，避免重複派發
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_collected_badges_user_station
  ON user_collected_badges (user_id, station_id);

-- ─────────────────────────────────────────────
-- 6. auto-update updated_at 觸發器
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stations_updated_at ON railway_stations;
CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON railway_stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lines_updated_at ON railway_lines;
CREATE TRIGGER trg_lines_updated_at
  BEFORE UPDATE ON railway_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- 7. RPC: get_all_railway_geojson()
--    前端初始化時呼叫，取得完整 GeoJSON FeatureCollection
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_railway_geojson()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(feature), '[]'::json)
  )
  FROM (
    -- 車站 features
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
    FROM public.railway_stations

    UNION ALL

    -- 路線 features
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
    FROM public.railway_lines
  ) features;
$$;

-- ─────────────────────────────────────────────
-- 8. RPC: insert_stations_bulk(rows json)
--    匯入腳本用，冪等式 upsert 車站資料
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION insert_stations_bulk(rows json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO railway_stations (
    station_id, station_name, system_type, line_id, geom,
    established_year, history_desc, history_image_url, badge_image_url
  )
  SELECT
    elem->>'station_id',
    COALESCE(elem->>'station_name', ''),
    (elem->>'system_type')::railway_system_type,
    elem->>'line_id',
    ST_SetSRID(ST_GeomFromGeoJSON((elem->'geom')::text), 4326),
    NULLIF(elem->>'established_year', '')::int,
    elem->>'history_desc',
    elem->>'history_image_url',
    elem->>'badge_image_url'
  FROM json_array_elements(rows) AS arr(elem)
  ON CONFLICT (station_id, system_type) DO UPDATE
  SET
    station_name      = EXCLUDED.station_name,
    line_id           = EXCLUDED.line_id,
    geom              = EXCLUDED.geom,
    established_year  = EXCLUDED.established_year,
    history_desc      = EXCLUDED.history_desc,
    history_image_url = EXCLUDED.history_image_url,
    badge_image_url   = EXCLUDED.badge_image_url,
    updated_at        = NOW();
END;
$$;

-- ─────────────────────────────────────────────
-- 9. RPC: insert_lines_bulk(rows json)
--    匯入腳本用，冪等式 upsert 路線資料
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION insert_lines_bulk(rows json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO railway_lines (
    line_id, line_name, system_type, color_hex, geom, history_desc
  )
  SELECT
    elem->>'line_id',
    COALESCE(elem->>'line_name', ''),
    (elem->>'system_type')::railway_system_type,
    COALESCE(elem->>'color_hex', '#888888'),
    ST_SetSRID(ST_GeomFromGeoJSON((elem->'geom')::text), 4326),
    elem->>'history_desc'
  FROM json_array_elements(rows) AS arr(elem)
  ON CONFLICT (line_id, system_type) DO UPDATE
  SET
    line_name    = EXCLUDED.line_name,
    color_hex    = EXCLUDED.color_hex,
    geom         = EXCLUDED.geom,
    history_desc = EXCLUDED.history_desc,
    updated_at   = NOW();
END;
$$;

-- ─────────────────────────────────────────────
-- 10. RPC: checkin(user_lon, user_lat, p_user_id)
--     GPS 打卡判定，使用 ST_DWithin 100m 比對
--     SECURITY DEFINER：以函式擁有者身份執行，繞過 RLS 直接寫入徽章紀錄
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION checkin(
  user_lon  double precision,
  user_lat  double precision,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_station_id       TEXT;
  v_station_name     TEXT;
  v_badge_image_url  TEXT;
  v_inserted_id      UUID;
  v_already_unlocked BOOLEAN := false;
  v_unlocked_at      TIMESTAMPTZ;
BEGIN
  -- 尋找 100 公尺內最近的車站
  SELECT rs.station_id, rs.station_name,
         COALESCE(rs.badge_image_url, rs.history_image_url)
  INTO v_station_id, v_station_name, v_badge_image_url
  FROM railway_stations rs
  WHERE ST_DWithin(
    rs.geom::geography,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    100
  )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_nearby');
  END IF;

  -- 嘗試寫入徽章紀錄；若已存在則不重複寫入
  INSERT INTO user_collected_badges (user_id, station_id, unlocked_at)
    VALUES (p_user_id, v_station_id, NOW())
    ON CONFLICT (user_id, station_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    -- 已打卡：取出原始打卡時間
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
    'ok',               true,
    'already_unlocked', v_already_unlocked,
    'station_id',       v_station_id,
    'station_name',     v_station_name,
    'badge_image_url',  v_badge_image_url,
    'unlocked_at',      v_unlocked_at
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 11. RPC: get_user_badges(p_user_id)
--     回傳使用者已收集的所有車站徽章
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 12. Row Level Security (RLS)
-- ─────────────────────────────────────────────

-- railway_stations — 公開只讀
ALTER TABLE railway_stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read stations"
  ON railway_stations FOR SELECT
  USING (true);

-- railway_lines — 公開只讀
ALTER TABLE railway_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read lines"
  ON railway_lines FOR SELECT
  USING (true);

-- user_collected_badges — 已驗證使用者只能存取自己的紀錄
ALTER TABLE user_collected_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert own badges"
  ON user_collected_badges FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::uuid = user_id);

CREATE POLICY "Select own badges"
  ON user_collected_badges FOR SELECT TO authenticated
  USING (auth.uid()::uuid = user_id);

-- ─────────────────────────────────────────────
-- 13. GRANTs — 授予 anon/authenticated 角色權限
-- ─────────────────────────────────────────────
GRANT SELECT ON railway_stations       TO anon, authenticated;
GRANT SELECT ON railway_lines          TO anon, authenticated;
GRANT SELECT, INSERT ON user_collected_badges TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_all_railway_geojson()                              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin(double precision, double precision, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges(uuid)                                  TO authenticated;

-- insert_stations_bulk / insert_lines_bulk 為 SECURITY DEFINER
-- 僅由 service-role key (bypass RLS) 呼叫，無需額外 GRANT

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- ✅ 執行完畢後，請到 Supabase Dashboard → Database → Restart 以重新載入
--    PostgREST schema cache，確保 RPC 函式可被前端呼叫。
-- ══════════════════════════════════════════════════════════════════════
