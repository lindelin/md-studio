import type { ConfigurableServiceDescriptor } from '../../application/service-catalog';
import type { ImportPreview } from '../../application/import-preview';
import type { CustomParameters } from '../../custom-parameters';
import type { MetadataImportPlan } from '../../domain/metadata-import';
import type { DeviceSnapshot } from '../../application/contracts';

export type WorkbenchDraftField = 'title' | 'album' | 'artist' | 'fullWidthTitle';

export interface SelectionModifiers {
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}

export interface OrderedSelection<T> {
    selection: T[];
    anchor: T;
    primary: T;
}

export interface LibrarySelectionItem {
    path: string[];
}

export function libraryPathKey(path: string[]) {
    return JSON.stringify(path);
}

export function toggleLibraryTrackSelection<T extends LibrarySelectionItem>(current: T[], target: T): T[] {
    const targetKey = libraryPathKey(target.path);
    return current.some((item) => libraryPathKey(item.path) === targetKey)
        ? current.filter((item) => libraryPathKey(item.path) !== targetKey)
        : [...current, target];
}

export function toggleVisibleLibraryTracks<T extends LibrarySelectionItem>(current: T[], visible: T[]): T[] {
    const selectedKeys = new Set(current.map((item) => libraryPathKey(item.path)));
    const visibleKeys = new Set(visible.map((item) => libraryPathKey(item.path)));
    const allVisibleSelected = visible.length > 0 && visible.every((item) => selectedKeys.has(libraryPathKey(item.path)));
    if (allVisibleSelected) return current.filter((item) => !visibleKeys.has(libraryPathKey(item.path)));
    return [...current, ...visible.filter((item) => !selectedKeys.has(libraryPathKey(item.path)))];
}

export function createDefaultServiceParameters(service?: ConfigurableServiceDescriptor): CustomParameters {
    return Object.fromEntries((service?.parameters ?? []).map((parameter) => [parameter.key, parameter.defaultValue]));
}

export function areServiceParametersValid(service: ConfigurableServiceDescriptor | undefined, values: CustomParameters) {
    return (service?.parameters ?? []).every((parameter) => {
        const value = values[parameter.key];
        if (parameter.type === 'number') return typeof value === 'number' && Number.isFinite(value);
        if (parameter.type === 'boolean') return typeof value === 'boolean';
        if (parameter.type === 'hostFilePath' || parameter.type === 'hostDirPath') {
            return typeof value === 'string' && value.length > 0;
        }
        if (parameter.key.toLowerCase().includes('address')) {
            try {
                new URL(String(value));
                return true;
            } catch {
                return false;
            }
        }
        return typeof value === 'string';
    });
}

export function updateOrderedSelection<T>(
    current: T[],
    ordered: T[],
    target: T,
    anchor: T | null,
    modifiers: SelectionModifiers
): OrderedSelection<T> {
    if (!ordered.includes(target)) throw new Error('The selected item is not present in the current view.');

    if (modifiers.shiftKey && anchor !== null) {
        const anchorIndex = ordered.indexOf(anchor);
        const targetIndex = ordered.indexOf(target);
        if (anchorIndex !== -1) {
            const start = Math.min(anchorIndex, targetIndex);
            const end = Math.max(anchorIndex, targetIndex);
            return {
                selection: Array.from(new Set([...current, ...ordered.slice(start, end + 1)])),
                anchor: target,
                primary: target,
            };
        }
    }

    if (modifiers.ctrlKey || modifiers.metaKey) {
        const selection = current.includes(target) ? current.filter((item) => item !== target) : [...current, target];
        return { selection, anchor: target, primary: selection.includes(target) ? target : selection[0] ?? target };
    }

    return { selection: [target], anchor: target, primary: target };
}

export interface MetadataDraft {
    title: string;
    album: string;
    artist: string;
    fullWidthTitle: string;
}

export function buildBatchMetadataUpdates<T>(
    targets: T[],
    primary: T,
    dirtyFields: WorkbenchDraftField[],
    draft: MetadataDraft,
    sharedFields: WorkbenchDraftField[] = ['album', 'artist']
) {
    const orderedTargets = Array.from(new Set([primary, ...targets]));
    return orderedTargets.flatMap((target) => {
        const fields = target === primary ? dirtyFields : dirtyFields.filter((field) => sharedFields.includes(field));
        if (fields.length === 0) return [];
        return [
            {
                target,
                changes: Object.fromEntries(fields.map((field) => [field, draft[field]])) as Partial<MetadataDraft>,
            },
        ];
    });
}

export function taskProgressPercent(task: {
    progress: { currentPercent?: number; completed: number; total: number };
    status: string;
}) {
    if (task.status === 'succeeded') return 100;
    if (task.progress.currentPercent !== undefined) return Math.round(task.progress.currentPercent);
    if (task.progress.total <= 0) return 0;
    return Math.round((task.progress.completed / task.progress.total) * 100);
}

export function isActiveUninterruptibleWrite(task: {
    kind: string;
    status: string;
    phase: string;
}) {
    return task.kind === 'disc.write' && task.status === 'running' && task.phase === 'transferring';
}

export function canRequestTaskCancellation(task: {
    kind: string;
    status: string;
    phase: string;
    progress: { completed: number; total: number };
}) {
    if (task.status !== 'running' && task.status !== 'queued') return false;
    return !(
        isActiveUninterruptibleWrite(task) &&
        task.progress.completed + 1 >= task.progress.total
    );
}

export function defaultMetadataTrackSelection(plan: MetadataImportPlan) {
    return plan.tracks
        .filter((track) => Boolean(track.actual) && track.matchesDisc)
        .map((track) => track.trackIndex);
}

export function getSelfTestReadiness(device?: Pick<DeviceSnapshot, 'capabilities' | 'disc'>) {
    if (!device?.disc) return { ready: false, reason: 'Connect a device with an inserted test disc.' };
    if (!device.disc.writable || device.disc.writeProtected) {
        return { ready: false, reason: 'The inserted disc is read-only or write-protected.' };
    }
    if (device.disc.trackCount < 2) {
        return { ready: false, reason: 'The self-test needs a disposable disc containing at least two tracks.' };
    }
    const required = [
        'disc.rename',
        'track.rename',
        'track.move',
        'track.delete',
        'disc.erase',
        'metadata.fullWidth',
        'playback.control',
    ] as const;
    const missing = required.filter((capability) => !device.capabilities.includes(capability));
    if (missing.length > 0) {
        return { ready: false, reason: `The connected device is missing: ${missing.join(', ')}.` };
    }
    return { ready: true, reason: 'This disc can run the complete 14-step destructive self-test.' };
}

export type RecognitionTitleFormat = 'title' | 'album-title' | 'artist-title' | 'title-artist' | 'artist-album-title';

export function formatRecognitionTitle(
    metadata: { title?: string; artist?: string; album?: string },
    format: RecognitionTitleFormat
) {
    const title = metadata.title?.trim() ?? '';
    const artist = metadata.artist?.trim() ?? '';
    const album = metadata.album?.trim() ?? '';
    const parts =
        format === 'album-title'
            ? [album, title]
            : format === 'artist-title'
              ? [artist, title]
              : format === 'title-artist'
                ? [title, artist]
                : format === 'artist-album-title'
                  ? [artist, album, title]
                  : [title];
    return parts.filter(Boolean).join(' - ');
}

export function buildAdvancedExportFileName(prefix: string, deviceName: string, firmwareVersion?: string) {
    const sanitize = (value: string) =>
        Array.from(value.trim(), (character) => (character.charCodeAt(0) < 32 ? '_' : character))
            .join('')
            .replace(/[<>:"/\\|?*]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, '') || 'unknown';
    const parts = [sanitize(prefix), sanitize(deviceName)];
    if (firmwareVersion?.trim()) parts.push(sanitize(firmwareVersion));
    return `${parts.join('_')}.bin`;
}

export function summarizeTaskResult(result: unknown) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
    const record = result as Record<string, unknown>;
    const labels: Record<string, string> = {
        writtenTracks: 'Written',
        exportedTracks: 'Exported',
        recordedTracks: 'Recorded',
        completedItems: 'Completed',
        pendingItems: 'Pending',
    };
    const lines: string[] = [];
    for (const [key, label] of Object.entries(labels)) {
        if (typeof record[key] === 'number') lines.push(`${label}: ${record[key]}`);
    }
    if (Array.isArray(record.files)) lines.push(`Files: ${record.files.length}`);
    if (Array.isArray(record.tracks)) lines.push(`Tracks: ${record.tracks.length}`);
    return lines;
}

export function findTaskNeedingAttention<T extends { id: string; status: string }>(
    tasks: T[],
    acknowledgedTaskIds: ReadonlySet<string>
) {
    return tasks.find(
        (task) => (task.status === 'failed' || task.status === 'interrupted') && !acknowledgedTaskIds.has(task.id)
    );
}

export function getTaskErrorDetail(error?: { message: string; details?: Record<string, unknown> }) {
    const detail = error?.details?.displayMessage;
    return typeof detail === 'string' && detail.trim() && detail !== error?.message ? detail : null;
}

export function canStartRecording(preview: ImportPreview | null, encoderState: string) {
    return Boolean(
        preview &&
            preview.complete &&
            preview.capacity.fits &&
            preview.titles.fits &&
            encoderState !== 'unsupported'
    );
}

export function resolveRowNavigationIndex(currentIndex: number, rowCount: number, key: string, pageSize = 10) {
    if (rowCount <= 0 || currentIndex < 0 || currentIndex >= rowCount) return null;
    switch (key) {
        case 'ArrowUp':
            return Math.max(0, currentIndex - 1);
        case 'ArrowDown':
            return Math.min(rowCount - 1, currentIndex + 1);
        case 'Home':
            return 0;
        case 'End':
            return rowCount - 1;
        case 'PageUp':
            return Math.max(0, currentIndex - pageSize);
        case 'PageDown':
            return Math.min(rowCount - 1, currentIndex + pageSize);
        default:
            return null;
    }
}
