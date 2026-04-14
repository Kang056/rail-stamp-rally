const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist', 'images');
const destDir = path.join(__dirname, '..', 'public', 'leaflet');

try {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir).filter(f => f.startsWith('marker-') && f.endsWith('.png'));
    files.forEach(file => {
      const src = path.join(srcDir, file);
      const dest = path.join(destDir, file);
      fs.copyFileSync(src, dest);
    });
  }
} catch (err) {
  // ignore errors to keep install from failing on copy
}

// exit success
process.exit(0);
