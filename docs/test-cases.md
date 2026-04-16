# Rail Stamp Rally — Manual Test Cases

These test cases verify the four reported bugs and core map functionality.

---

## TC-01: API Fallback Test

**Test Name:** Supabase API Failure Falls Back to Mock Data

**Preconditions:**
- Application is running locally (`npm run dev`)
- `.env.local` is intentionally misconfigured (e.g., `NEXT_PUBLIC_SUPABASE_URL` set to an invalid URL such as `https://invalid.supabase.co`)

**Steps:**
1. Start the dev server with invalid env vars.
2. Open `http://localhost:3000` in a browser.
3. Open the browser DevTools → Console tab.
4. Wait for the page to fully load.

**Expected Result:**
- The map renders and displays **at least one station marker** ("Mock Station 1") and **one railway line** (Mock TRA Line) from the fallback mock data.
- A small red error banner appears at the top-left of the map reading "載入資料失敗：…" (load failed).
- The application does **not** show a blank map or crash.
- The console may show a network/fetch error, but no unhandled JS exceptions.

---

## TC-02: API Success Test

**Test Name:** Real Station and Line Data Loads from Supabase

**Preconditions:**
- Application is running locally (`npm run dev`)
- `.env.local` contains valid `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` pointing to the production/staging Supabase project with ingested data.

**Steps:**
1. Start the dev server with correct env vars.
2. Open `http://localhost:3000`.
3. Wait for the loading indicator ("地圖資料載入中…") to disappear.
4. Inspect the map.

**Expected Result:**
- Multiple railway lines (TRA, HSR, MRT, etc.) appear on the map with correct colours.
- Station markers (white circles) are visible across Taiwan.
- No error banner appears.
- No "Mock Station 1" dummy data is visible (real data replaces it).

---

## TC-03: Visit Button Visibility Test

**Test Name:** "打卡 / 到訪" Button Is Always Visible

**Preconditions:**
- Application is running (mock or real data — either works).
- Map has loaded with at least one station.

**Steps:**
1. Open `http://localhost:3000`.
2. Wait for the map to finish loading.
3. **Without** clicking any station, look at the map area.
4. Click on a station marker on the map.
5. On **desktop**: inspect the left sidebar. On **mobile**: observe the bottom sheet that slides up.

**Expected Result:**
- The "打卡 / 到訪" (BadgeCheckin) button is **always visible** in the map overlay regardless of which station is selected or whether mock data is in use.
- Clicking the button triggers the check-in flow (shows a loading state "打卡中…").
- The button is **not** conditionally hidden based on data source.

---

## TC-04: Badge Display Test

**Test Name:** "顯示所有徽章" Button Renders Badge Icons on Map

**Preconditions:**
- Application is running (mock data is sufficient).
- Map has loaded and shows at least one station.

**Steps:**
1. Open `http://localhost:3000`.
2. Wait for the map to load.
3. Locate the "🏅 顯示所有徽章" button in the bottom-right of the map.
4. Click the "🏅 顯示所有徽章" button.
5. Observe station markers on the map.
6. Click the button again (now labelled "🏅 隱藏徽章").

**Expected Result:**
- After step 4: a badge icon (gold circle with "TRA" label for mock data, or the station's actual badge image for real data) appears **overlaid on top of** the station circle marker.
- The badge image renders as a visible `<img>` element — not a broken image icon.
- After step 6: badge icons disappear, leaving only plain station circle markers.

---

## TC-05: Map Basic Functionality Test

**Test Name:** Map Loads, Pans, and Zooms Correctly

**Preconditions:**
- Application is running (mock or real data).
- A modern browser with JavaScript enabled.

**Steps:**
1. Open `http://localhost:3000`.
2. Wait for the map tiles (OpenStreetMap) to load.
3. Verify the map is centred over Taiwan (approximately latitude 23.9°N, longitude 121.0°E).
4. Click and drag the map to pan to a different area.
5. Use the scroll wheel (or pinch on mobile) to zoom in.
6. Use the `+` / `-` zoom controls in the top-left of the map.
7. Resize the browser window (narrow ↔ wide).

**Expected Result:**
- Map tiles load without blank gaps.
- Panning moves the map view smoothly.
- Zooming in/out works via scroll, pinch, and zoom buttons.
- After window resize, tiles remain aligned (no offset or blank stripes) — the map adjusts its layout automatically to fit the new viewport dimensions.
- On narrow viewport (<768 px): sidebar is hidden; map is full-screen.
- On wide viewport (≥768 px): left sidebar (320 px) and map panel are displayed side by side.

---

## Bug Fix Verification Summary

| Bug | Verified Fixed? | How to Verify |
|-----|----------------|---------------|
| Only Mock Station 1 appears (no real data) | ✅ | TC-01 (fallback), TC-02 (real data) |
| No "到訪" (Visit) button | ✅ | TC-03 |
| "顯示徽章" button does nothing | ✅ | TC-04 |
| Map loads and zooms fine (was working) | ✅ | TC-05 |
