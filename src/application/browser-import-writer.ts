import serviceRegistry from '../services/registry';
import { Capability, getDefaultCodec, type Codec } from '../services/interfaces/netmd';
import type { TitledFile } from '../utils';
import { ApplicationError } from './contracts';
import { createDeferredFile, isAdaptiveFile, isDeferredFile } from './deferred-file';
import type { ImportQueue, ImportWriteRequest, ImportWriter } from './import-queue';
import type { TaskManager } from './task-manager';
import { assertDiscWritableForImport, assertImportDeviceVersion, assertImportWritePolicy } from './import-write-policy';
import { INTERACTIVE_HOMEBREW_AUTHORIZATION } from './interactive-authorization';

export interface BrowserImportWriterDependencies {
    startUpload(
        files: TitledFile[],
        format: Codec,
        parameters: { enableReplayGain: boolean; enableGapless: boolean },
        taskId: string
    ): Promise<void>;
    showImportDialog(): void;
}

export class BrowserImportWriter implements ImportWriter {
    constructor(private readonly dependencies: BrowserImportWriterDependencies) {}

    async start(request: ImportWriteRequest, queue: ImportQueue, tasks: TaskManager) {
        const selected = queue.resolveSelection(request.ids, request.expectedRevision);
        const spec = serviceRegistry.netmdSpec;
        const service = serviceRegistry.netmdService;
        const application = serviceRegistry.application;
        if (!spec || !service || !application) {
            throw new ApplicationError('NO_DISC', 'Connect a MiniDisc device before starting a write task.');
        }
        const device = application.readSnapshot() ?? (await application.refresh());
        assertImportDeviceVersion(
            request.expectedDeviceSessionId,
            request.expectedDeviceRevision,
            device.sessionId,
            device.revision
        );
        assertDiscWritableForImport(device.disc);

        const format = this.resolveFormat(request.format, spec);
        const capabilities = await service.getServiceCapabilities();
        assertImportWritePolicy({
            selected,
            format,
            nativeMonoUpload: capabilities.includes(Capability.nativeMonoUpload),
            allowInteractiveHomebrew:
                request.interactiveHomebrewAuthorization === INTERACTIVE_HOMEBREW_AUTHORIZATION,
        });

        const task = tasks.create(
            'disc.write',
            `Write ${selected.length} track${selected.length === 1 ? '' : 's'} to MiniDisc`,
            selected.length,
            'tracks'
        );
        tasks.start(task.id, 'preparing');
        void this.run(task.id, selected, request, format, queue, tasks);
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        selected: ReturnType<ImportQueue['resolveSelection']>,
        request: ImportWriteRequest,
        format: Codec,
        queue: ImportQueue,
        tasks: TaskManager
    ) {
        try {
            const files: TitledFile[] = [];
            for (const { item, payload } of selected) {
                let resolvedPayload = payload;
                if (resolvedPayload === undefined && item.kind === 'local-path' && serviceRegistry.importPayloadResolver) {
                    resolvedPayload = createDeferredFile(item.name, item.reference, (reference) =>
                        serviceRegistry.importPayloadResolver!.resolve(reference)
                    );
                }
                if (!(resolvedPayload instanceof File) && !isAdaptiveFile(resolvedPayload) && !isDeferredFile(resolvedPayload)) {
                    throw new ApplicationError('INVALID_INPUT', `Import item ${item.name} has no readable audio payload.`, {
                        id: item.id,
                    });
                }
                files.push({
                    file: resolvedPayload,
                    title: item.title,
                    fullWidthTitle: item.fullWidthTitle ?? '',
                    forcedEncoding: (item.forcedEncoding as TitledFile['forcedEncoding']) ?? null,
                    bytesToSkip: item.bytesToSkip ?? 0,
                    artist: item.artist ?? '',
                    album: item.album ?? '',
                });
            }

            await this.dependencies.startUpload(
                files,
                format,
                {
                    enableReplayGain: request.enableReplayGain ?? false,
                    enableGapless: request.enableGapless ?? false,
                },
                taskId
            );

            const finalTask = tasks.get(taskId);
            if (finalTask.status === 'succeeded' && request.removeOnSuccess) {
                queue.remove(selected.map(({ item }) => item.id));
            } else if (finalTask.status === 'failed' || finalTask.status === 'cancelled') {
                this.dependencies.showImportDialog();
            }
        } catch (error) {
            const task = tasks.get(taskId);
            if (task.status === 'queued' || task.status === 'running') tasks.fail(taskId, error);
            this.dependencies.showImportDialog();
        }
    }

    private resolveFormat(requested: ImportWriteRequest['format'], spec: NonNullable<typeof serviceRegistry.netmdSpec>) {
        if (!requested) return getDefaultCodec(spec);
        const supported = spec.availableFormats.some(
            (format) => format.codec === requested.codec && format.availableBitrates.includes(requested.bitrate)
        );
        if (!supported) {
            throw new ApplicationError('INVALID_INPUT', `Recording format ${requested.codec}/${requested.bitrate} is unavailable.`);
        }
        return requested as Codec;
    }

}
