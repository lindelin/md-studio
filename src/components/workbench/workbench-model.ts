import { localizeJapanese } from '../../i18n';
import type { ConfigurableServiceDescriptor } from '../../application/service-catalog';
import type { ImportPreview } from '../../application/import-preview';
import type { CustomParameters } from '../../custom-parameters';
import type { MetadataImportPlan } from '../../domain/metadata-import';
import type { DeviceSnapshot } from '../../application/contracts';
export {
    canRequestTaskCancellation,
    getTaskCancellationPresentation,
    isActiveUninterruptibleWrite,
} from '../../application/task-cancellation-policy';

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

export function localizeSelfTestReadinessReason(reason: string, language: 'en' | 'zh-CN' | 'ja') {
    if (language !== 'zh-CN') return localizeJapanese(language, reason);
    const missing = reason.match(/^The connected device is missing: (.+)\.$/);
    if (missing) return `当前设备缺少以下能力：${missing[1]}。`;
    const reasons: Record<string, string> = {
        'Connect a device with an inserted test disc.': '请连接设备并插入测试碟。',
        'The inserted disc is read-only or write-protected.': '插入的碟片为只读或已写保护。',
        'The self-test needs a disposable disc containing at least two tracks.': '自检需要一张至少包含两首曲目的可擦写测试碟。',
        'This disc can run the complete 14-step destructive self-test.': '这张碟片可以执行完整的 14 步破坏性自检。',
    };
    return reasons[reason] ?? reason;
}

export type DiscMaintenanceAction = 'erase' | 'formatHimd';

export function getDiscMaintenanceConfirmationToken(action: DiscMaintenanceAction) {
    return action === 'erase' ? 'ERASE DISC' : 'FORMAT HI-MD';
}

export function isDiscMaintenanceConfirmationValid(action: DiscMaintenanceAction, confirmation: string) {
    return confirmation === getDiscMaintenanceConfirmationToken(action);
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

export function localizeTaskLabel(label: string, language: 'en' | 'zh-CN' | 'ja') {
    if (language !== 'zh-CN') return localizeJapanese(language, label);
    const patterns: [RegExp, (count: string) => string][] = [
        [/^Write (\d+) tracks? to MiniDisc$/, (count) => `将 ${count} 首曲目录制到 MiniDisc`],
        [/^Export (\d+) tracks? with device recovery$/, (count) => `通过设备恢复导出 ${count} 首曲目`],
        [/^Record (\d+) tracks? through the audio input$/, (count) => `通过音频输入录制 ${count} 首曲目`],
        [/^Export (\d+) tracks? from MiniDisc$/, (count) => `从 MiniDisc 导出 ${count} 首曲目`],
    ];
    for (const [pattern, format] of patterns) {
        const match = label.match(pattern);
        if (match) return format(match[1]);
    }
    const labels: Record<string, string> = {
        'Export device RAM': '导出设备 RAM',
        'Export device firmware': '导出设备固件',
        'Run destructive MiniDisc device self-test': '运行破坏性 MiniDisc 设备自检',
    };
    return labels[label] ?? label;
}

export function localizeTaskMessage(message: string, language: 'en' | 'zh-CN' | 'ja') {
    if (language !== 'zh-CN' || !message) return localizeJapanese(language, message);
    const noAudio = message.match(/^The device returned no audio for track (\d+)\.$/);
    if (noAudio) return `设备没有返回曲目 ${noAudio[1]} 的音频。`;
    const messages: Record<string, string> = {
        'Keep the completed files and retry only the remaining tracks.': '保留已完成的文件，只重试剩余曲目。',
        'Check the device connection and output directory, then retry the export.': '检查设备连接和输出目录，然后重试导出。',
        'Keep the device connected and retry the advanced export.': '保持设备连接，然后重试高级导出。',
        'Keep the downloaded recordings and retry only the remaining tracks.': '保留已下载的录音，只重试剩余曲目。',
        'Check the audio input and device playback connection before retrying.': '重试前请检查音频输入和设备播放连接。',
        'Refresh the disc, keep the completed tracks, and retry only the remaining imports.': '刷新碟片并保留已完成的曲目，只重试剩余导入项。',
        'Check the source audio, encoder, and device connection before retrying the write.': '检查源音频、编码器和设备连接，然后重试写入。',
        'The recording task stopped before all tracks were transferred.': '录制任务在所有曲目传输完成前停止。',
        'The recording task stopped unexpectedly.': '录制任务意外停止。',
        'The device session ended before the task completed.': '设备会话在任务完成前已结束。',
        'Reconnect the device, refresh its state, and verify what completed before retrying.': '重新连接设备并刷新状态；确认已完成的内容后再重试。',
    };
    return messages[message] ?? message;
}

export function summarizeTaskResult(result: unknown, language: 'en' | 'zh-CN' | 'ja' = 'en') {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
    const record = result as Record<string, unknown>;
    const labels: Record<string, [string, string]> = {
        writtenTracks: ['Written', '已写入'],
        exportedTracks: ['Exported', '已导出'],
        recordedTracks: ['Recorded', '已录制'],
        completedItems: ['Completed', '已完成'],
        pendingItems: ['Pending', '待处理'],
    };
    const lines: string[] = [];
    for (const [key, label] of Object.entries(labels)) {
        if (typeof record[key] === 'number') lines.push(`${localizeJapanese(language, label[language === 'zh-CN' ? 1 : 0])}: ${record[key]}`);
    }
    if (Array.isArray(record.files)) lines.push(`${language === 'zh-CN' ? '文件' : localizeJapanese(language, 'Files')}: ${record.files.length}`);
    if (Array.isArray(record.tracks)) lines.push(`${language === 'zh-CN' ? '曲目' : localizeJapanese(language, 'Tracks')}: ${record.tracks.length}`);
    return lines;
}

export interface TaskOutputFile {
    value: string;
    label: string;
}

export function getTaskOutputFiles(result: unknown, limit = 100): { files: TaskOutputFile[]; total: number } {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return { files: [], total: 0 };
    const raw = (result as Record<string, unknown>).files;
    if (!Array.isArray(raw)) return { files: [], total: 0 };
    const values = raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const safeLimit = Number.isInteger(limit) ? Math.max(0, limit) : 100;
    const files = values.slice(0, safeLimit).map((value) => ({
        value,
        label: value.split(/[\\/]/).filter(Boolean).at(-1) ?? value,
    }));
    return { files, total: values.length };
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
