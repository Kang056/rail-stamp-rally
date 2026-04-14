# Playwright test evidence — Map fix

This file collects the local Playwright verification artifacts for the recent map fix.

## Summary
- Fix commit(s) in repo: see recent commits below.
- Playwright tests executed locally; all map-related tests passed.

## Recent commits (last 6)
`
54c65c8 chore: ignore Playwright artifacts, test results, and local logs
33b4c13 chore(ci): merge ci/playwright-tests into main
7c70c00 ci: add Playwright GitHub Actions workflow
1756e01 fix(map): add vh fallback to avoid NaN tile transforms
4233c89 feat(map): render mock GeoJSON when Supabase env missing
d8c449d test(playwright): add map metrics & panning tests

`

## Playwright log (playwright-results.txt)

`

Running 5 tests using 1 worker

  ?? 1 tests\home.debug.spec.js:5:1 ??collect console and network logs and take screenshots (2.6s)
PAGE_CONTENT_LENGTH: 18935
  ?? 2 tests\home.spec.js:3:1 ??home page loads and screenshot (1.6s)
TILES_BEFORE_COUNT: [33m12[39m
BAD_BEFORE: [33mfalse[39m
TILES_AFTER_COUNT: [33m20[39m
BAD_AFTER: [33mfalse[39m
  ?? 3 tests\map.interaction.spec.js:5:1 ??map tiles load and zoom interaction (2.7s)
METRICS_WRITTEN
  ?? 4 tests\map.metrics.spec.js:5:1 ??collect map layout metrics (996ms)
TILES_INITIAL: [33m12[39m
TILES_AFTER_PAN1: [33m20[39m
TILES_AFTER_ZOOM: [33m20[39m
HAS_NAN: [33mfalse[39m
  ?? 5 tests\map.panning.spec.js:11:1 ??pan and zoom without broken tiles (3.7s)

  5 passed (13.6s)

`

## Screenshots (playwright-screenshots/)
`
home-debug-logs.json
home-debug.html
home-debug.png
home.png
map-after-zoom.png
map-before-zoom.png
map-metrics.json
map-metrics.png
pan-after-1.png
pan-after-zoom.png
pan-zoom-before.png
`

## Map metrics (map-metrics.json)
`
{
  "devicePixelRatio": 1,
  "innerWidth": 1280,
  "innerHeight": 720,
  "htmlRect": {
    "selector": "html",
    "width": 1280,
    "height": 720,
    "top": 0,
    "left": 0,
    "position": "static",
    "transform": "none",
    "overflow": "visible",
    "display": "block"
  },
  "bodyRect": {
    "selector": "body",
    "width": 1280,
    "height": 720,
    "top": 0,
    "left": 0,
    "position": "static",
    "transform": "none",
    "overflow": "visible",
    "display": "block"
  },
  "mainRect": {
    "selector": "main",
    "width": 1280,
    "height": 720,
    "top": 0,
    "left": 0,
    "position": "relative",
    "transform": "none",
    "overflow": "hidden",
    "display": "flex"
  },
  "mapSectionRect": {
    "selector": "section[aria-label=\"Interactive railway map\"]",
    "width": 960,
    "height": 720,
    "top": 0,
    "left": 320,
    "position": "relative",
    "transform": "none",
    "overflow": "visible",
    "display": "block"
  },
  "leafletContainerRect": {
    "selector": ".leaflet-container",
    "width": 960,
    "height": 720,
    "top": 0,
    "left": 320,
    "position": "relative",
    "transform": "none",
    "overflow": "visible",
    "display": "block"
  },
  "tilePaneRect": {
    "selector": ".leaflet-tile-pane",
    "width": 960,
    "height": 1040,
    "top": 0,
    "left": 320,
    "position": "static",
    "transform": "none",
    "overflow": "visible",
    "display": "block"
  },
  "tileContainerRect": {
    "selector": ".leaflet-tile-container",
    "width": 960,
    "height": 1040,
    "top": 0,
    "left": 320,
    "position": "static",
    "transform": "matrix(1, 0, 0, 1, 0, 0)",
    "overflow": "visible",
    "display": "block"
  },
  "tileContainerTransform": "matrix(1, 0, 0, 1, 0, 0)",
  "tileCount": 12,
  "tileSamples": [
    {
      "src": "https://c.tile.openstreetmap.org/8/213/110.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 213, 235)"
    },
    {
      "src": "https://a.tile.openstreetmap.org/8/214/110.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 469, 235)"
    },
    {
      "src": "https://b.tile.openstreetmap.org/8/213/109.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 213, -21)"
    },
    {
      "src": "https://c.tile.openstreetmap.org/8/214/109.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 469, -21)"
    },
    {
      "src": "https://a.tile.openstreetmap.org/8/213/111.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 213, 491)"
    },
    {
      "src": "https://b.tile.openstreetmap.org/8/214/111.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 469, 491)"
    },
    {
      "src": "https://b.tile.openstreetmap.org/8/212/110.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, -43, 235)"
    },
    {
      "src": "https://b.tile.openstreetmap.org/8/215/110.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 725, 235)"
    },
    {
      "src": "https://a.tile.openstreetmap.org/8/212/109.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, -43, -21)"
    },
    {
      "src": "https://a.tile.openstreetmap.org/8/215/109.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 725, -21)"
    },
    {
      "src": "https://c.tile.openstreetmap.org/8/212/111.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, -43, 491)"
    },
    {
      "src": "https://c.tile.openstreetmap.org/8/215/111.png",
      "width": 256,
      "height": 256,
      "transform": "matrix(1, 0, 0, 1, 725, 491)"
    }
  ],
  "hasNaNTransforms": false,
  "parentTransforms": [
    {
      "tag": "section",
      "transform": "none"
    },
    {
      "tag": "main",
      "transform": "none"
    },
    {
      "tag": "body",
      "transform": "none"
    }
  ],
  "computedBodyStyle": ""
}
`

## Notes for reviewers
- The map rendering issue (black/NaN tiles) was addressed by:
  - Adding height: 100vh fallback while keeping height: 100dvh.
  - Ensuring Leaflet CSS is included (CDN fallback) and calling map.invalidateSize() on tile load, whenReady and on resize.
  - Using a dedicated map.__featureLayer for GeoJSON layers to avoid direct addTo(map) race conditions.

Files with test artifacts are committed to the repository to make them easily available for reviewers.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
