import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function buildBrowser({ write = true } = {}) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return buildSync({
    absWorkingDir: root,
    entryPoints: ['src/browser.ts'],
    outfile: 'folder-api.cdn.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    legalComments: 'none',
    banner: { js: `/*! folder-api v${version} browser bundle. Generated from TypeScript. MIT License. */` },
    write
  });
}
