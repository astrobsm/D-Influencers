const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(process.cwd(), "assets", "app-icon.png");
const OUT_DIR = path.join(process.cwd(), "assets", "icons");
const NAVY = { r: 5, g: 11, b: 26, alpha: 1 };

if (!fs.existsSync(SRC)) {
  console.error("Source icon missing:", SRC);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

// Standard PWA sizes
const sizes = [72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

async function makeAny(size) {
  const out = path.join(OUT_DIR, `icon-${size}.png`);
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: NAVY })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("any   ", size, "->", path.relative(process.cwd(), out));
}

async function makeMaskable(size) {
  // Maskable icons need ~80% safe zone — pad the artwork with navy.
  const inner = Math.round(size * 0.78);
  const out = path.join(OUT_DIR, `maskable-${size}.png`);
  const resized = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: NAVY })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log("mask  ", size, "->", path.relative(process.cwd(), out));
}

(async () => {
  for (const s of sizes) await makeAny(s);
  for (const s of [192, 512]) await makeMaskable(s);

  // favicon (32x32)
  await sharp(SRC)
    .resize(32, 32, { fit: "contain", background: NAVY })
    .png()
    .toFile(path.join(process.cwd(), "assets", "favicon-32.png"));
  console.log("favicon-32 generated");
  console.log("Done.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
