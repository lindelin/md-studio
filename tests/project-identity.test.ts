import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { describe, it } from 'node:test';
import { LibraryServices } from '../src/services/library-services.ts';
import { AudioServices } from '../src/services/audio-export-service-manager.ts';
import { Services } from '../src/services/interface-service-manager.ts';

describe('independent project identity', () => {
    it('publishes MiniDisc Workspace as the package, document, and PWA identity', async () => {
        const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
            name?: string;
            description?: string;
        };
        const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
        const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');

        assert.equal(packageJson.name, 'minidisc-workspace');
        assert.match(packageJson.description ?? '', /MiniDisc workspace/i);
        assert.match(indexHtml, /<title>MiniDisc Workspace<\/title>/);
        assert.match(viteConfig, /"name": "MiniDisc Workspace"/);
        assert.match(viteConfig, /"short_name": "MD Workspace"/);
    });

    it('keeps obsolete upstream integration artifacts and branding out of product-facing services', async () => {
        const productCopy = LibraryServices.map((service) => service.description ?? '').join('\n');
        assert.doesNotMatch(productCopy, /Web MiniDisc(?: Pro)?/i);

        await assert.rejects(
            () => access(new URL('../webminidisc-song-recognition.user.js', import.meta.url), constants.F_OK),
            (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
        );
    });

    it('offers only the local folder library in the local-only product catalog', () => {
        assert.deepEqual(LibraryServices.map((service) => service.id), ['browser-folder']);
        assert.deepEqual(LibraryServices[0].customParameters, undefined);
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
