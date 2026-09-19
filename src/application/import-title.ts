import type { ImportQueueItem, ImportTrackMetadata } from './import-queue';

export type ImportTitleFormat = 'filename' | 'title' | 'album-title' | 'artist-title' | 'artist-album-title' | 'title-artist';

export interface ImportTitleSanitizer {
    sanitizeHalfWidthTitle(title: string): string;
    sanitizeFullWidthTitle(title: string): string;
}

type ImportTitleSource = Pick<
    ImportQueueItem,
    'name' | 'title' | 'sourceTitle' | 'artist' | 'sourceArtist' | 'album' | 'sourceAlbum'
>;

export function formatImportTitle(
    item: ImportTitleSource,
    format: ImportTitleFormat,
    sanitizer: ImportTitleSanitizer,
    allowFullWidth: boolean
): Pick<ImportTrackMetadata, 'title' | 'fullWidthTitle'> {
    const title = item.sourceTitle ?? item.title;
    const artist = item.sourceArtist ?? item.artist ?? '';
    const album = item.sourceAlbum ?? item.album ?? '';
    const rawTitle = selectTitle(item.name, title, artist, album, format);
    const halfWidth = sanitizer.sanitizeHalfWidthTitle(rawTitle);
    const fullWidth = sanitizer.sanitizeFullWidthTitle(rawTitle);
    const halfAsFullWidth = sanitizer.sanitizeFullWidthTitle(halfWidth);
    return {
        title: halfWidth,
        fullWidthTitle: allowFullWidth && fullWidth !== halfAsFullWidth ? fullWidth : '',
    };
}

function selectTitle(name: string, title: string, artist: string, album: string, format: ImportTitleFormat) {
    switch (format) {
        case 'filename':
            return removeExtension(name);
        case 'title':
            return title;
        case 'album-title':
            return joinParts(album, title);
        case 'artist-title':
            return joinParts(artist, title);
        case 'artist-album-title':
            return joinParts(artist, album, title);
        case 'title-artist':
            return joinParts(title, artist);
    }
}

function joinParts(...parts: string[]) {
    return parts.map((part) => part.trim()).filter(Boolean).join(' - ');
}

function removeExtension(name: string) {
    const extensionStart = name.lastIndexOf('.');
    return extensionStart > 0 ? name.slice(0, extensionStart) : name;
}
