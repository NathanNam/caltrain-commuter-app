// Rebuilds the favicon set and the social share image in the 1830 board style.
//
// Usage (from the repo root; puppeteer-core is not a project dependency):
//   npm i --no-save puppeteer-core
//   node scripts/brand/make.mjs
//
// Options (environment):
//   CHROME_PATH     Chrome/Chromium binary (default: the macOS Google Chrome path)
//   PUPPETEER_CORE  path to a puppeteer-core install, if not in node_modules
//
// Writes:
//   app/icon.svg          vector favicon (red "CT" railroad token, letters drawn as paths)
//   app/favicon.ico       16, 32 and 48 px PNGs in one .ico
//   app/apple-icon.png    180 px
//   public/og-image.png   1200x630 share card (Open Graph / X)
// All artwork is original; no game artwork or railroad marks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    if (!process.env.PUPPETEER_CORE) {
      console.error('puppeteer-core not found: run `npm i --no-save puppeteer-core` or set PUPPETEER_CORE.');
      process.exit(1);
    }
    const entry = join(process.env.PUPPETEER_CORE, 'lib', 'esm', 'puppeteer', 'puppeteer-core.js');
    return (await import(pathToFileURL(entry).href)).default;
  }
}

// ---- the token: black rim, red disc, white inner ring, "CT" as paths ----
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="31" fill="#1b1a17"/>
  <circle cx="32" cy="32" r="27.5" fill="#c8202e"/>
  <circle cx="32" cy="32" r="23.5" fill="none" stroke="#fff" stroke-width="2.5"/>
  <path d="M27.4 25.6A8 8 0 1 0 27.4 38.4" fill="none" stroke="#fff" stroke-width="5.4"/>
  <path d="M29.6 23h19.8v5.2h-7.3V41.6h-5.2V28.2h-7.3z" fill="#fff"/>
</svg>
`;

// 16 px variant: no inner ring, heavier letters, so it stays readable in a tab.
export const ICON_SMALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="31" fill="#1b1a17"/>
  <circle cx="32" cy="32" r="26.5" fill="#c8202e"/>
  <path d="M26.6 23.4A10 10 0 1 0 26.6 40.6" fill="none" stroke="#fff" stroke-width="8"/>
  <path d="M28.5 19.5h24v8h-8V45h-8V27.5h-8z" fill="#fff"/>
</svg>
`;

const HEX = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='90' viewBox='0 0 52 90'%3E%3Cpath d='M13 0l13 7.5v15L13 30 0 22.5v-15zM39 45l13 7.5v15L39 75l-13-7.5v-15zM13 60l13 7.5' fill='none' stroke='%23d9c9a3' stroke-width='1.2'/%3E%3C/svg%3E")`;

// A short horizontal stretch of the hex line: SF .. Palo Alto with a live token.
function stripSvg() {
  const names = ['SF', '22nd', 'Bayshore', 'S. SF', 'San Bruno', 'Millbrae', 'Broadway', 'Burlingame', 'San Mateo'];
  const cities = new Set([0, 5, 8]);
  const R = 64;
  const s3 = Math.sqrt(3);
  const pts = names.map((_, i) => ({ x: 40 + i * (s3 * R / 2) + s3 * R / 2, y: 34 + (i % 2) * 1.5 * R + R }));
  const hex = (c) => Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 180 * (60 * k + 30);
    return `${(c.x + R * Math.cos(a)).toFixed(1)},${(c.y + R * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  let g = '';
  pts.forEach((p) => { g += `<polygon points="${hex(p)}" fill="#6fae4b" stroke="#7a6a45" stroke-width="1.5"/>`; });
  pts.forEach((p, i) => [i - 1, i + 1].forEach((j) => {
    if (j < 0 || j >= pts.length) return;
    const q = pts[j];
    g += `<line x1="${p.x}" y1="${p.y}" x2="${(p.x + q.x) / 2}" y2="${(p.y + q.y) / 2}" stroke="#1b1a17" stroke-width="6" stroke-linecap="round"/>`;
  }));
  pts.forEach((p, i) => {
    g += cities.has(i)
      ? `<circle cx="${p.x}" cy="${p.y}" r="17" fill="#fff" stroke="#1b1a17" stroke-width="3.5"/>`
      : `<circle cx="${p.x}" cy="${p.y}" r="8" fill="#1b1a17"/>`;
    const above = i % 2 === 0;
    g += `<text x="${p.x}" y="${above ? p.y - R - 10 : p.y + R + 26}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="20" fill="#1b1a17">${names[i]}</text>`;
  });
  const t = pts[4];
  g += `<circle cx="${t.x}" cy="${t.y + 40}" r="22" fill="#c8202e" stroke="#1b1a17" stroke-width="3"/><text x="${t.x}" y="${t.y + 46}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="16" fill="#fff">662</text>`;
  const W = Math.round(pts[pts.length - 1].x + 70);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="300" viewBox="0 0 ${W} 300">${g}</svg>`;
}

const OG_HTML = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@700&family=Inter:wght@600;700;800&display=block" rel="stylesheet">
<style>
  html,body{margin:0}
  body{width:1200px;height:630px;overflow:hidden;background:#f2e8cf;background-image:${HEX};font-family:Inter,sans-serif;color:#1b1a17;position:relative}
  .frame{position:absolute;inset:18px;border:4px solid #1b1a17;outline:2px solid #1b1a17;outline-offset:-12px}
  .inner{position:absolute;left:100px;right:100px;top:62px;bottom:52px;display:flex;flex-direction:column}
  .head{display:flex;align-items:center;gap:26px}
  .head svg{width:112px;height:112px;flex:none}
  h1{font:700 76px/1 'Zilla Slab',serif;margin:0;text-transform:uppercase;letter-spacing:2px}
  .pitch{font:700 30px/1.25 Inter;margin:14px 0 0;color:#4a4436}
  .rule{border-top:4px double #1b1a17;margin:24px 0 18px}
  .row{display:flex;gap:28px;align-items:center}
  .mins{background:#1b1a17;color:#f2e8cf;width:180px;height:230px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none}
  .mins b{font:700 128px/0.9 'Zilla Slab',serif}
  .mins span{font:800 20px Inter;letter-spacing:5px;margin-top:8px}
  .strip{flex:1;min-width:0;overflow:hidden}
</style></head><body>
<div class="frame"></div>
<div class="inner">
  <div class="head">${ICON_SVG}<div><h1>Caltrain Commuter</h1>
  <p class="pitch">Your next Caltrain, at a glance &mdash; live from 511</p></div></div>
  <div class="rule"></div>
  <div class="row"><div class="mins"><b>8</b><span>MIN</span></div><div class="strip">${stripSvg()}</div></div>
</div>
</body></html>`;

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
try {
  const page = await browser.newPage();

  async function renderIcon(size, svg = ICON_SVG) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    return Buffer.from(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  }

  mkdirSync(join(root, 'app'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'app', 'icon.svg'), ICON_SVG);
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, data: await renderIcon(size, size <= 16 ? ICON_SMALL_SVG : ICON_SVG) });
  writeFileSync(join(root, 'app', 'favicon.ico'), ico(pngs));
  writeFileSync(join(root, 'app', 'apple-icon.png'), await renderIcon(180));

  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(OG_HTML, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(join(root, 'public', 'og-image.png'), Buffer.from(await page.screenshot({ type: 'png' })));
  console.log('Wrote app/icon.svg, app/favicon.ico, app/apple-icon.png, public/og-image.png');
} finally {
  await browser.close();
}
