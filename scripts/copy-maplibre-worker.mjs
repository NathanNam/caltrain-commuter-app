// Copies MapLibre's web-worker bundle into public/ so the browser can load it
// from a stable same-origin URL. maplibre-gl 6 locates its worker next to its
// own module file (import.meta.url), which bundlers such as Turbopack rewrite,
// so the default lookup fails with "Worker failed to load".
// Runs on postinstall, predev and prebuild; the copy is git-ignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const pkgDir = dirname(require.resolve('maplibre-gl/package.json'));
const src = join(pkgDir, 'dist', 'maplibre-gl-worker.mjs');
const dest = join(root, 'public', 'maplibre-gl-worker.mjs');

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`maplibre worker copied to public/maplibre-gl-worker.mjs`);
