import type { ApplicationClient } from './application-client';
import { inspectImportFiles, type ImportInspectionFailure } from './audio-import-inspector';
import type { DeviceRecordingProfile } from './contracts';
import { sanitizeDeviceFullWidthTitle, sanitizeDeviceHalfWidthTitle } from './device-profile';
import { formatImportTitle, type ImportTitleFormat } from './import-title';
import type { ImportQueueSnapshot } from './import-queue';
import type { AdaptiveFile } from '../utils';

export interface BrowserImportPlanOptions {
    recordingProfile: DeviceRecordingProfile;
    titleFormat: ImportTitleFormat;
    fullWidthTitles: boolean;
    supportsFullWidthTitles: boolean;
    usesHimdTitles: boolean;
    expectedRevision: number;
}

export interface BrowserImportPlanResult {
    importQueue: ImportQueueSnapshot | null;
    addedCount: number;
    failures: ImportInspectionFailure[];
}

export async function stageBrowserImports(
    client: Pick<ApplicationClient, 'addLocalImports'>,
    inputs: readonly (File | AdaptiveFile)[],
    options: BrowserImportPlanOptions
): Promise<BrowserImportPlanResult> {
    const inspection = await inspectImportFiles(
        inputs,
        options.recordingProfile.availableFormats.map((format) => format.codec)
    );
    if (inspection.files.length === 0) return { importQueue: null, addedCount: 0, failures: inspection.failures };

    const sanitizer = {
        sanitizeHalfWidthTitle: (title: string) => sanitizeDeviceHalfWidthTitle(options.recordingProfile, title),
        sanitizeFullWidthTitle: (title: string) => sanitizeDeviceFullWidthTitle(options.recordingProfile, title),
    };
    const titleFormat = options.usesHimdTitles ? 'title' : options.titleFormat;
    const allowFullWidth = options.fullWidthTitles && options.supportsFullWidthTitles;
    const importQueue = client.addLocalImports(
        inspection.files.map((inspected) => {
            const sourceMetadata = {
                name: inspected.file.name,
                title: inspected.title,
                sourceTitle: inspected.title,
                artist: inspected.artist,
                sourceArtist: inspected.artist,
                album: inspected.album,
                sourceAlbum: inspected.album,
            };
            return {
                source: {
                    kind: 'browser-file' as const,
                    name: inspected.file.name,
                    reference: createBrowserFileReference(),
                    size: inspected.file instanceof File ? inspected.file.size : undefined,
                    mimeType: inspected.file instanceof File ? inspected.file.type : undefined,
                },
                metadata: {
                    ...sourceMetadata,
                    ...formatImportTitle(sourceMetadata, titleFormat, sanitizer, allowFullWidth),
                    duration: inspected.duration,
                    forcedEncoding: inspected.forcedEncoding,
                    bytesToSkip: inspected.bytesToSkip,
                },
                payload: inspected.file,
            };
        }),
        options.expectedRevision
    );
    return { importQueue, addedCount: inspection.files.length, failures: inspection.failures };
}

function createBrowserFileReference() {
    return `browser-file:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
