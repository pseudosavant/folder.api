// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildBrowser } from '../../scripts/build-browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

describe('published entry points', () => {
  it('type-checks a consumer of the package and CDN entry points', () => {
    expect(() => execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
      'tests/fixtures/consumer.mts', '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
      '--target', 'ES2020', '--skipLibCheck', '--lib', 'ES2020,DOM'
    ], { cwd: root, encoding: 'utf8' })).not.toThrow();
  }, 15000);

  it('reproduces the standalone bundle from TypeScript without hand edits', () => {
    const generated = buildBrowser({ write: false }).outputFiles[0].text;
    expect(generated).toBe(readFileSync(new URL('../../folder-api.cdn.js', import.meta.url), 'utf8'));
  });

  it('installs and type-checks the packed artifact in a clean consumer', () => {
    const directory = mkdtempSync(join(tmpdir(), 'folder-api-consumer-'));
    const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    expect(existsSync(npmCli), 'Run this test through npm so its CLI can be located').toBe(true);
    const npm = (args: string[], cwd: string) => execFileSync(process.execPath, [npmCli, ...args], {
      cwd, encoding: 'utf8', timeout: 60000,
      env: { ...process.env, npm_config_cache: join(directory, 'cache'), npm_config_update_notifier: 'false' }
    });
    try {
      const [packed] = JSON.parse(npm(['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', directory], root));
      expect(packed.files.every((file: { path: string }) => /^(?:dist\/|folder-api\.cdn\.js$|package\.json$|README\.md$|LICENSE$)/.test(file.path))).toBe(true);
      const consumer = join(directory, 'consumer');
      mkdirSync(consumer);
      writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'folder-api-consumer', private: true, type: 'module' }));
      npm(['install', '--offline', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', join(directory, packed.filename)], consumer);
      const fixture = join(consumer, 'consumer.mts');
      writeFileSync(fixture, readFileSync(new URL('../fixtures/consumer.mts', import.meta.url), 'utf8'));
      execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), fixture, '--noEmit',
        '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2020', '--skipLibCheck', '--lib', 'ES2020,DOM'
      ], { cwd: consumer, encoding: 'utf8', timeout: 15000 });
      execFileSync(process.execPath, ['--input-type=module', '-e',
        "import assert from 'node:assert/strict'; import { folderApiRequest } from 'folder-api'; import { folderApiRequest as cdn } from 'folder-api/cdn'; assert.equal(typeof folderApiRequest, 'function'); assert.equal(typeof cdn, 'function'); assert.equal(globalThis.folderApiRequest, cdn);"
      ], { cwd: consumer, encoding: 'utf8', timeout: 10000 });
      expect(existsSync(join(consumer, 'node_modules/folder-api/src'))).toBe(false);
      expect(existsSync(join(consumer, 'node_modules/folder-api/scripts'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180000);
});
