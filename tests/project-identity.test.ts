import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { describe, it } from 'node:test';
import { LibraryServices } from '../src/services/library-services.ts';

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

    it('offers a local folder library without changing the legacy remote service index', () => {
        assert.equal(LibraryServices[0].id, 'remote-library');
        assert.equal(LibraryServices[1].id, 'browser-folder');
        assert.notEqual(LibraryServices[1].requiresOnlineServices, true);
        assert.deepEqual(LibraryServices[1].customParameters, undefined);
    });
});
