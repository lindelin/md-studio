import { ApplicationError } from '../../application/contracts';
import { getMetadataFromFile, removeExtension } from '../../utils';
import type { CustomParameters } from '../../custom-parameters';
import type { LibraryService, LocalDatabase, LocalTrackMetadata } from './library';

const MAX_FOLDER_FILES = 20_000;
const MAX_PATH_DEPTH = 64;
const MAX_PATH_PART_LENGTH = 1024;
const AUDIO_EXTENSIONS = new Set([
    'aa3',
    'aac',
    'aea',
    'aif',
    'aiff',
    'alac',
    'flac',
    'm4a',
    'mp3',
    'mp4',
    'oga',
    'ogg',
    'oma',
    'opus',
    'wav',
    'wave',
    'wma',
]);

interface BrowserFolderState {
    database: LocalDatabase;
    files: Map<string, File>;
}

let activeFolder: BrowserFolderState | null = null;

type MetadataReader = typeof getMetadataFromFile;

export async function indexBrowserFolder(files: readonly File[], readMetadata: MetadataReader = getMetadataFromFile) {
    const audioFiles = files.filter(isSupportedAudioFile);
    if (audioFiles.length === 0) {
        throw new ApplicationError('INVALID_INPUT', 'The selected folder contains no supported audio files.');
    }
    if (audioFiles.length > MAX_FOLDER_FILES) {
        throw new ApplicationError('INVALID_INPUT', `Select a folder containing no more than ${MAX_FOLDER_FILES} audio files.`);
    }

    const nextDatabase = createDirectory();
    const nextFiles = new Map<string, File>();
    for (const file of audioFiles) {
        const path = normalizeBrowserFilePath(file);
        const reference = path.join('/');
        if (nextFiles.has(reference)) {
            throw new ApplicationError('INVALID_INPUT', `The selected folder contains the same audio path more than once: ${reference}.`);
        }
        const metadata = await readMetadata(file);
        insertTrack(nextDatabase, path, {
            artist: normalizeMetadataText(metadata.artist, 'Unknown Artist'),
            album: normalizeMetadataText(metadata.album, 'Unknown Album'),
            title: normalizeMetadataText(metadata.title, removeExtension(file.name)),
            duration: Number.isFinite(metadata.duration) && metadata.duration > 0 ? metadata.duration : 0,
        });
        nextFiles.set(reference, file);
    }

    activeFolder = { database: nextDatabase, files: nextFiles };
    return { database: nextDatabase, fileCount: nextFiles.size };
}

export function clearBrowserFolder() {
    activeFolder = null;
}

export class BrowserFolderLibraryService implements LibraryService {
    constructor(_parameters: CustomParameters) {}

    async getDatabase() {
        if (!activeFolder) {
            throw new ApplicationError('INVALID_INPUT', 'Choose a local music folder to continue.');
        }
        return activeFolder.database;
    }

    async resolveLocalLibraryFile(filePath: string) {
        const file = activeFolder?.files.get(filePath);
        if (!file) {
            throw new ApplicationError('INVALID_INPUT', 'The local folder is no longer available. Choose it again.');
        }
        return file;
    }
}

function isSupportedAudioFile(file: File) {
    if (file.type.toLowerCase().startsWith('audio/')) return true;
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    return AUDIO_EXTENSIONS.has(extension);
}

function normalizeBrowserFilePath(file: File) {
    const rawPath = file.webkitRelativePath || file.name;
    const parts = rawPath.split(/[\\/]/);
    if (
        parts.length === 0 ||
        parts.length > MAX_PATH_DEPTH ||
        parts.some(
            (part) => part.length === 0 || part.length > MAX_PATH_PART_LENGTH || part === '.' || part === '..' || part.includes('\0')
        )
    ) {
        throw new ApplicationError('INVALID_INPUT', `The selected folder contains an invalid audio path: ${rawPath}.`);
    }
    return parts;
}

function insertTrack(database: LocalDatabase, path: string[], metadata: LocalTrackMetadata) {
    let directory = database;
    for (const part of path.slice(0, -1)) {
        const existing = directory[part];
        if (existing && isTrack(existing)) {
            throw new ApplicationError('INVALID_INPUT', `A file and folder use the same local library path: ${path.join('/')}.`);
        }
        if (!existing) directory[part] = createDirectory();
        directory = directory[part] as LocalDatabase;
    }
    const name = path.at(-1)!;
    if (directory[name]) {
        throw new ApplicationError('INVALID_INPUT', `The selected folder contains a duplicate path: ${path.join('/')}.`);
    }
    directory[name] = metadata;
}

function createDirectory(): LocalDatabase {
    return Object.create(null) as LocalDatabase;
}

function isTrack(entry: LocalDatabase | LocalTrackMetadata): entry is LocalTrackMetadata {
    return typeof (entry as LocalTrackMetadata).duration === 'number';
}

function normalizeMetadataText(value: string, fallback: string) {
    const normalized = value.trim();
    return (normalized || fallback).slice(0, MAX_PATH_PART_LENGTH);
}
