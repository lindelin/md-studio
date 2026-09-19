import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatImportTitle } from '../src/application/import-title.ts';

const sanitizer = {
    sanitizeHalfWidthTitle: (title: string) => title.replaceAll('曲', '?').replaceAll('名', '?'),
    sanitizeFullWidthTitle: (title: string) => title,
};

const source = {
    name: '01. Song.flac',
    title: 'Edited title',
    sourceTitle: '曲名',
    artist: 'Edited artist',
    sourceArtist: 'Artist',
    album: 'Edited album',
    sourceAlbum: 'Album',
};

describe('import title formatting', () => {
    it('formats from immutable source metadata and preserves a useful full-width title', () => {
        assert.deepEqual(formatImportTitle(source, 'artist-album-title', sanitizer, true), {
            title: 'Artist - Album - ??',
            fullWidthTitle: 'Artist - Album - 曲名',
        });
        assert.deepEqual(formatImportTitle(source, 'filename', sanitizer, true), {
            title: '01. Song',
            fullWidthTitle: '',
        });
    });

    it('omits empty metadata segments instead of creating dangling separators', () => {
        assert.deepEqual(
            formatImportTitle(
                { ...source, sourceArtist: '', sourceAlbum: '' },
                'artist-album-title',
                sanitizer,
                false
            ),
            { title: '??', fullWidthTitle: '' }
        );
    });
});
