import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildBrowser } from './build-browser.mjs';

const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit'
});
buildBrowser();
