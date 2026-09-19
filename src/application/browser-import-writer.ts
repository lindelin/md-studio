import type { Codec } from '../services/interfaces/netmd';
import type { TitledFile } from '../utils';
import { ApplicationError } from './contracts';
import { createDeferredFile, isAdaptiveFile, isDeferredFile } from './deferred-file';
import type { ImportQueue, ImportWriteRequest, ImportWriter } from './import-queue';
import type { TaskManager } from './task-manager';
import {
    assertDiscWritableForImport,
    assertImportDeviceVersion,
    assertImportPreviewWritable,
    assertImportWritePolicy,
} from './import-write-policy';
import { INTERACTIVE_HOMEBREW_AUTHORIZATION } from './interactive-authorization';
import type { MiniDiscApplication } from './minidisc-application';
import type { BrowserLocalFileGateway } from './browser-local-file-gateway';

export interface BrowserImportWriterDependencies {
    getApplication(): MiniDiscApplication | undefined;
    localFiles: BrowserLocalFileGateway;
    startUpload(
        files: TitledFile[],
        format: Codec,
        parameters: { enableReplayGain: boolean; enableGapless: boolean },
        taskId: string,
        deviceVersion: { sessionId: string; revision: number },
        tasks: TaskManager
    ): Promise<void>;
    showImportDialog(): void;
}

export class BrowserImportWriter implements ImportWriter {
    constructor(private readonly dependencies: BrowserImportWriterDependencies) {}

    async start(request: ImportWriteRequest, queue: ImportQueue, tasks: TaskManager) {
        const selected = queue.resolveSelection(request.ids, request.expectedRevision);
        const application = this.dependencies.getApplication();
        if (!application) {
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

        const preview = await application.previewImports(
            selected.map(({ item }) => item),
            request.expectedRevision ?? queue.snapshot().revision,
            request.format,
            request.expectedDeviceRevision
        );
        assertImportPreviewWritable(preview);
        const format = preview.selectedFormat;
        assertImportWritePolicy({
            selected,
            format,
            nativeMonoUpload: device.capabilities.includes('track.uploadMono'),
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
        void this.run(
            task.id,
            selected,
            request,
            format,
            { sessionId: device.sessionId, revision: device.revision },
            queue,
            tasks
        );
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        selected: ReturnType<ImportQueue['resolveSelection']>,
        request: ImportWriteRequest,
        format: Codec,
        deviceVersion: { sessionId: string; revision: number },
        queue: ImportQueue,
        tasks: TaskManager
    ) {
        try {
            const files: TitledFile[] = [];
            for (const { item, payload } of selected) {
                let resolvedPayload = payload;
                if (resolvedPayload === undefined && item.kind === 'local-path' && this.dependencies.localFiles.canResolve()) {
                    resolvedPayload = createDeferredFile(item.name, item.reference, (reference) =>
                        this.dependencies.localFiles.resolve(reference)
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
                taskId,
                deviceVersion,
                tasks
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
}
