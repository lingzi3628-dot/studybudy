/**
 * Generate PNG icons from the SVG source.
 * Sizes: 16x16, 32x32, 192x192, 512x512 (plus favicon.ico from 32x32).
 *
 * Run with: bun run scripts/generate-icons.ts
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const PUBLIC_DIR = "/home/z/my-project/public";

const SIZES = [16, 32, 192, 512];

async function main() {
  if (!existsSync(PUBLIC_DIR)) {
    await mkdir(PUBLIC_DIR, { recursive: true });
  }
  const svgBuffer = await readFile(`${PUBLIC_DIR}/icon.svg`);

  for (const size of SIZES) {
    const out = `${PUBLIC_DIR}/icon-${size}.png`;
    await sharp(svgBuffer, { density: 384 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`✓ Generated ${out}`);
  }

  // Also save a 512 as apple-touch-icon
  await sharp(svgBuffer, { density: 384 })
    .resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`${PUBLIC_DIR}/apple-touch-icon.png`);
  console.log(`✓ Generated apple-touch-icon.png (180x180)`);

  // Copy 32x32 to favicon-32.png and also save as favicon.ico
  await sharp(svgBuffer, { density: 384 })
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`${PUBLIC_DIR}/favicon-32.png`);
  console.log(`✓ Generated favicon-32.png`);

  // favicon.ico is just a PNG renamed (browsers accept this)
  const ico = await sharp(svgBuffer, { density: 384 })
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(`${PUBLIC_DIR}/favicon.ico`, ico);
  console.log(`✓ Generated favicon.ico`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Failed to generate icons:", e);
  process.exit(1);
});
