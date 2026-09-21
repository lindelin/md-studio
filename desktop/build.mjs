await access('vendor/zadig/zadig-2.9.exe').catch(() => { throw new Error('Run node desktop/prepare-driver.mjs first'); });
import { build } from 'esbuild';
import { mkdir, copyFile, access } from 'node:fs/promises';
await mkdir('desktop-build', { recursive: true });
await build({ entryPoints: ['desktop/main.ts'], outfile: 'desktop-build/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22' });
await build({ entryPoints: ['desktop/preload.ts'], outfile: 'desktop-build/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22' });
await build({ entryPoints: ['desktop/cli.ts'], outfile: 'desktop-build/cli.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
await copyFile('desktop/mdstudio.cmd', 'desktop-build/mdstudio.cmd');
