# Leaflet default marker icons

The files in this directory are copied from `leaflet/dist/images/` and are
referenced by the icon path fix in `components/Map.tsx`.

Copy these files from `node_modules/leaflet/dist/images/` after running
`npm install`:

```
marker-icon.png
marker-icon-2x.png
marker-shadow.png
```

Or run the following one-liner from the project root:

```bash
cp node_modules/leaflet/dist/images/marker-*.png public/leaflet/
```
