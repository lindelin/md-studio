import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { describe, it } from 'node:test';
import { AudioServices } from '../src/services/audio-export-service-manager.ts';
import { Services } from '../src/services/interface-service-manager.ts';

describe('independent project identity', () => {
    it('publishes MD Studio as the package, document, and PWA identity', async () => {
        const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
            name?: string;
            description?: string;
        };
        const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
        const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');

        assert.equal(packageJson.name, 'md-studio');
        assert.match(packageJson.description ?? '', /making MDs/i);
        assert.match(indexHtml, /<title>MD Studio<\/title>/);
        assert.match(viteConfig, /"name": "MD Studio"/);
        assert.match(viteConfig, /"short_name": "MD Studio"/);
    });

    it('keeps a source-controlled version module available before any build step', async () => {
        const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
        const prepareRuntime = await readFile(new URL('../scripts/prepare-runtime.mjs', import.meta.url), 'utf8');
        const versionInfo = await readFile(new URL('../src/version-info.ts', import.meta.url), 'utf8');

        assert.doesNotMatch(gitignore, /^src\/version-info\.ts$/m);
        assert.doesNotMatch(prepareRuntime, /writeFile[\s\S]*version-info\.ts/);
        assert.match(versionInfo, /typeof __MINIDISC_BUILD_INFO__ === 'undefined'/);
    });

    it('keeps obsolete upstream integration artifacts and branding out of product-facing services', async () => {

        await assert.rejects(
            () => access(new URL('../webminidisc-song-recognition.user.js', import.meta.url), constants.F_OK),
            (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
        );
    });

    it('keeps product help inside the independent application', async () => {
        for (const path of [
            '../src/components/topmenu.tsx',
            '../src/components/workbench/device-connection.tsx',
            '../src/components/workbench/workbench.tsx',
        ]) {
            const source = await readFile(new URL(path, import.meta.url), 'utf8');
            assert.doesNotMatch(source, /minidisc\.wiki\/guides/i);
        }
    });

    it('keeps remote services and their dependency out of the local-only release', async () => {
        const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
            dependencies?: Record<string, string>;
        };
        assert.equal(packageJson.dependencies?.['shazam-api'], undefined);
        assert.equal(AudioServices.some((service) => service.id === 'remote-atrac'), false);
        assert.equal(Services.some((service) => service.id === 'remote-netmd'), false);

        for (const path of [
            '../src/services/audio/remote-atrac-export.ts',
            '../src/services/interfaces/remote-netmd.ts',
            '../src/services/library/remote-library.ts',
            '../src/application/browser-track-recognizer.ts',
        ]) {
            await assert.rejects(
                () => access(new URL(path, import.meta.url), constants.F_OK),
                (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
            );
        }
    });
});
