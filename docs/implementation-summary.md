實作摘要 — 2026-04-14

概覽
- 新增 user_collected_badges 資料表與 RLS、實作 checkin(user_lon, user_lat, user_id) RPC (使用 ST_DWithin 100m)
- 新增 bulk RPC：insert_stations_bulk(rows jsonb)、insert_lines_bulk(rows jsonb)
- 更新 scripts/ingest-tdx-data.js：解析 TDX GeoJSON 並呼叫上述 bulk RPC 以寫入 PostGIS
- 前端：在 app/page.tsx 整合 getAllRailwayGeoJSON，新增 BadgeCheckin 元件（打卡按鈕、定位、呼叫 checkin RPC）
- 測試：新增 Playwright E2E 與 API 測試骨架（tests/），以及 CI workflow 範本

主要檔案
- supabase/2026-04-14-add-user_collected_badges.sql
- supabase/2026-04-14-add-bulk-insert-rpcs.sql
- supabase/README.md (RPC 使用說明)
- scripts/ingest-tdx-data.js (已改為呼叫 insert_*_bulk RPC)
- app/page.tsx, components/BadgeCheckin.tsx
- tests/checkin.spec.ts, tests/api/checkin.test.js, tests/README.md

分支與提交
- feat/user-collected-badges — commit: 54a4568 (migration + RPC)
  PR 建立：https://github.com/Kang056/rail-stamp-rally/pull/new/feat/user-collected-badges
- feat/ingest-bulk-rpc — commit: eaa3c9f (bulk RPC + ingest script)
  PR 建立：https://github.com/Kang056/rail-stamp-rally/pull/new/feat/ingest-bulk-rpc
- feat/badge-ui — commit: 2b0fa1d (前端整合與 Badge UI)
  PR 建立：https://github.com/Kang056/rail-stamp-rally/pull/new/feat/badge-ui
- feat/tests-and-ci — commit: 97dbae8 (測試骨架與 CI 範本)
  PR 建立：https://github.com/Kang056/rail-stamp-rally/pull/new/feat/tests-and-ci

如何在本機驗證（要點）
1) 建立 .env.local：
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY (執行 ingest / 查驗需 service-key)
   - TDX_CLIENT_ID, TDX_CLIENT_SECRET (執行 ingest 需)
2) 執行 DB migration：在 Supabase SQL Editor 執行 supabase/* .sql 檔案（或使用 psql 以 service key 連線並執行）
3) 執行資料注入：
   npm ci
   node scripts\ingest-tdx-data.js
   （需 SUPABASE_SERVICE_ROLE_KEY 與 TDX 憑證）
4) 啟動前端並測試打卡：
   npm run dev → http://localhost:3000
   開啟 DevTools 模擬地理位置 → 點擊「打卡 / 到訪」按鈕
5) 測試：
   npx playwright test tests/checkin.spec.ts
   node tests/api/checkin.test.js

注意事項與建議
- migration 已在 user_collected_badges 中加入 RLS（Insert/Select for authenticated user）與 UNIQUE(user_id, station_id)
- 建議為 railway_stations.station_id 新增 UNIQUE 約束以避免重複錄入（視 ingest 資料品質決定）
- 大量匯入時建議採批次/COPY 或在維護窗口建立索引後再重建

如需我：
- 幫忙在 GitHub 建立 draft PR（我已經 push 各 feature branch）
- 在 CI/本機跑完整 E2E 測試（需要你提供 service-role key 與測試用帳號）
- 加入 FK 與更嚴格的約束（我可提出 migration 草案）

文件建立於： docs/implementation-summary.md
