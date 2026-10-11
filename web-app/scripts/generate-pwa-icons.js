const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'public', 'favicon.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

const sizes = [
  { name: 'icon-192x192.png', size: 192, maskable: false },
  { name: 'icon-512x512.png', size: 512, maskable: false },
  { name: 'icon-192x192-maskable.png', size: 192, maskable: true },
  { name: 'icon-512x512-maskable.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source icon not found: ${SOURCE}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sourceMeta = await sharp(SOURCE).metadata();
  const sourceSize = Math.max(sourceMeta.width ?? 0, sourceMeta.height ?? 0);

  for (const { name, size, maskable } of sizes) {
    let pipeline = sharp(SOURCE, { density: 72 })
      .resize(size, size, { fit: 'contain', background: { r: 37, g: 99, b: 235, alpha: 1 } });

    if (maskable) {
      // Maskable safe zone is 60% of the icon, so pad the logo inside a larger
      // canvas and then resize back down to the target size with the logo at 40%
      // of the final icon, leaving 30% padding on each side.
      const canvasSize = Math.round(size / 0.4);
      const pad = Math.round((canvasSize - size) / 2);
      pipeline = sharp(SOURCE, { density: 72 })
        .resize(Math.round(size * 0.4), Math.round(size * 0.4), {
          fit: 'contain',
          background: { r: 37, g: 99, b: 235, alpha: 0 },
        })
        .extend({
          top: pad,
          bottom: pad,
          left: pad,
          right: pad,
          background: { r: 37, g: 99, b: 235, alpha: 1 },
        })
        .resize(size, size, { fit: 'cover' });
    }

    await pipeline.png({ compressionLevel: 9 }).toFile(path.join(OUT_DIR, name));
    console.log(`Generated ${name}`);
  }

  // Copy a non-transparent apple touch icon background if needed - already done above.
  console.log(`Icons written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
