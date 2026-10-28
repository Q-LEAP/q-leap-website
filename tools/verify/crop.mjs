// node crop.mjs <shot-prefix> <x> <y> <w> <h> <out.png> : live | local | diff side by side
import fs from 'fs';
import { PNG } from 'pngjs';
const [prefix, x, y, w, h, out] = process.argv.slice(2);
const [X, Y, W, H] = [x, y, w, h].map(Number);
const parts = ['live', 'local', 'diff'].map(k => PNG.sync.read(fs.readFileSync(`shots/${prefix}-${k}.png`)));
const canvas = new PNG({ width: W * 3 + 20, height: H });
canvas.data.fill(255);
parts.forEach((png, i) => {
  const w2 = Math.min(W, png.width - X), h2 = Math.min(H, png.height - Y);
  if (w2 > 0 && h2 > 0) PNG.bitblt(png, canvas, X, Y, w2, h2, i * (W + 10), 0);
});
fs.writeFileSync(out, PNG.sync.write(canvas));
