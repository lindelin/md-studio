import {
    ApplicationError,
    type AdvancedDeviceGateway,
    type AdvancedTocDump,
    type AdvancedMemoryDump,
    type AdvancedMemoryKind,
    type AdvancedMemoryProgress,
    type AdvancedTrackData,
    type AdvancedTrackReadOptions,
    type AdvancedTrackReadProgress,
    type AdvancedTrackReader,
    type AdvancedUploadService,
    type ApplicationCapability,
    type DestructiveConfirmation,
    type DiagnosticProgress,
    type DeviceGateway,
    type DeviceSnapshot,
    type GroupMetadataUpdate,
    type HiMDTrackMetadataUpdate,
    type PlaybackCommand,
    type SelfTestResult,
    type TrackMetadataUpdate,
} from './contracts';
import { DeviceOperationCoordinator } from './operation-coordinator';
import {
    buildImportedGroups,
    createMetadataImportPlan,
    serializeMetadataCsv,
    type MetadataImportPlan,
} from '../domain/metadata-import';
import { sleep } from '../utils';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from './interactive-authorization';
import { ImportPreviewError, type ImportPreview, type ImportPreviewTrack } from './import-preview';
import { getRecordingCodec } from './device-profile';

export const MINIDISC_SELF_TEST_STEP_COUNT = 14;

function createSessionId() {
    return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class MiniDiscApplication {
    readonly sessionId = createSessionId();
    private revision = 0;
    private snapshot?: DeviceSnapshot;
    private readonly listeners = new Set<(snapshot: DeviceSnapshot) => void>();
    private readonly gateway: DeviceGateway;
    private readonly operations: DeviceOperationCoordinator;
    private readonly advancedGateway?: AdvancedDeviceGateway;

    constructor(
        gateway: DeviceGateway,
        operations = new DeviceOperationCoordinator(),
        advancedGateway?: AdvancedDeviceGateway
    ) {
        this.gateway = gateway;
        this.operations = operations;
        this.advancedGateway = advancedGateway;
    }

    refresh(dropCache = false) {
        return this.serial(async () => {
            const next = await this.gateway.readSnapshot(dropCache);
            return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
        });
    }

    pollDeviceStatus() {
        return this.serial(async () => {
            if (!this.snapshot) {
                const next = await this.gateway.readSnapshot(false);
                return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
            }
            const status = await this.gateway.readStatus();
            if (status.discPresent !== Boolean(this.snapshot.disc)) {
                const next = await this.gateway.readSnapshot(true);
                return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
            }
            if (JSON.stringify(status) === JSON.stringify(this.snapshot.status)) return structuredClone(this.snapshot);
            return this.commitSnapshot({ ...this.snapshot, status });
        });
    }

    synchronizeAfterExternalMutation(dropCache = true) {
        return this.serial(async () => {
            this.revision += 1;
            const next = await this.gateway.readSnapshot(dropCache);
            return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
        });
    }

    readSnapshot() {
        return this.snapshot ? structuredClone(this.snapshot) : null;
    }

    subscribe(listener: (snapshot: DeviceSnapshot) => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    planMetadataImport(text: string): Promise<MetadataImportPlan> {
        return this.serial(async () => createMetadataImportPlan(text, this.requireDisc()));
    }

    exportMetadataCsv() {
        return this.serial(async () => serializeMetadataCsv(this.requireDisc()));
    }

    previewImports(
        tracks: ImportPreviewTrack[],
        importRevision: number,
        requestedFormat?: { codec: string; bitrate: number },
        expectedDeviceRevision?: number
    ): Promise<ImportPreview> {
        return this.serial(async () => {
            this.assertRevision(expectedDeviceRevision);
            const disc = this.requireDisc();
            if (tracks.length === 0) {
                throw new ApplicationError('INVALID_INPUT', 'At least one queued import is required for a preview.');
            }
            const snapshot = this.snapshot!;
            const selectedFormat =
                requestedFormat ?? getRecordingCodec(snapshot.recording, snapshot.recording.defaultFormat);
            if (!selectedFormat) {
                throw new ApplicationError('INVALID_INPUT', 'The connected device has no valid default recording format.');
            }
            let preview;
            try {
                preview = this.gateway.previewImports(disc, tracks, selectedFormat);
            } catch (error) {
                if (error instanceof ImportPreviewError) throw new ApplicationError('INVALID_INPUT', error.message);
                throw error;
            }
            return {
                ...preview,
                deviceSessionId: snapshot.sessionId,
                deviceRevision: snapshot.revision,
                importRevision,
            };
        });
    }

    inspectAdvancedDevice() {
        return this.serial(async () => {
            this.requireCapability('advanced.factory');
            return this.requireAdvancedGateway().readInfo();
        });
    }

    readRawToc(): Promise<AdvancedTocDump> {
        return this.serial(async () => {
            this.requireCapability('advanced.factory');
            this.requireDisc();
            const gateway = this.requireAdvancedGateway();
            const sectorSize = 2352;
            const sectorCount = 6;
            const sectors: Uint8Array[] = [];
            for (let index = 0; index < sectorCount; index += 1) {
                const sector = await gateway.readTocSector(index);
                if (sector.byteLength !== sectorSize) {
                    throw new ApplicationError('INVALID_INPUT', `The device returned an invalid TOC sector ${index}.`, {
                        index,
                        expectedBytes: sectorSize,
                        actualBytes: sector.byteLength,
                    });
                }
                sectors.push(sector);
            }
            const data = new Uint8Array(sectorSize * sectorCount);
            sectors.forEach((sector, index) => data.set(sector, index * sectorSize));
            const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
            return {
                sectorSize,
                sectorCount,
                byteLength: data.byteLength,
                sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
                dataBase64: encodeBase64(data),
            };
        });
    }

    writeRawToc(
        dataBase64: string,
        confirmation?: DestructiveConfirmation,
        expectedRevision?: number,
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION
    ) {
        return this.mutate('advanced.factory', expectedRevision, async () => {
            this.requireInteractiveAdvancedAuthorization(interactiveAuthorization);
            this.requireConfirmation(
                confirmation,
                'Writing a raw TOC can make every track on the disc unreadable and requires explicit confirmation.'
            );
            const sectorSize = 2352;
            const sectorCount = 6;
            const writableSectorCount = 4;
            const data = decodeBase64(dataBase64);
            if (data.byteLength !== sectorSize * sectorCount) {
                throw new ApplicationError('INVALID_INPUT', 'A raw TOC must contain exactly six 2352-byte sectors.', {
                    expectedBytes: sectorSize * sectorCount,
                    actualBytes: data.byteLength,
                });
            }
            const gateway = this.requireAdvancedGateway();
            await this.requireExploitCapability(gateway, 'flushUTOC');
            for (let index = 0; index < writableSectorCount; index += 1) {
                await gateway.writeTocSector(index, data.slice(index * sectorSize, (index + 1) * sectorSize));
            }
            await gateway.flushToc();
        });
    }

    runTetris(
        confirmation?: DestructiveConfirmation,
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION
    ) {
        return this.advancedAction(
            'runTetris',
            (gateway) => gateway.runTetris(),
            interactiveAuthorization,
            confirmation,
            'Running device-side homebrew code requires explicit confirmation.'
        );
    }

    setSpUploadSpeedup(enabled: boolean, interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION) {
        return this.advancedAction(
            'spUploadSpeedup',
            (gateway) => gateway.setSpUploadSpeedup(enabled),
            interactiveAuthorization
        );
    }

    setDiscSwapDetectionDisabled(
        disabled: boolean,
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION
    ) {
        return this.advancedAction(
            'disableDiscSwapDetection',
            (gateway) => gateway.setDiscSwapDetectionDisabled(disabled),
            interactiveAuthorization
        );
    }

    enableHimdFullMode(
        confirmation?: DestructiveConfirmation,
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION
    ) {
        return this.advancedAction(
            'himdFullMode',
            (gateway) => gateway.enableHimdFullMode(),
            interactiveAuthorization,
            confirmation,
            'Loading unrestricted HiMD mode runs device-side homebrew code and requires explicit confirmation.'
        );
    }

    enterServiceMode(
        confirmation?: DestructiveConfirmation,
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION
    ) {
        return this.advancedAction(
            'enterServiceMode',
            (gateway) => gateway.enterServiceMode(),
            interactiveAuthorization,
            confirmation,
            'Entering service mode changes the device operating state and requires explicit confirmation.'
        );
    }

    readAdvancedMemory(
        kind: AdvancedMemoryKind,
        interactiveAuthorization: typeof INTERACTIVE_ADVANCED_AUTHORIZATION,
        onProgress: (progress: AdvancedMemoryProgress) => void
    ): Promise<AdvancedMemoryDump> {
        return this.serial(async () => {
            this.requireInteractiveAdvancedAuthorization(interactiveAuthorization);
            this.requireCapability('advanced.factory');
            const gateway = this.requireAdvancedGateway();
            await this.requireExploitCapability(gateway, kind === 'ram' ? 'readRam' : 'readFirmware');
            if (kind === 'ram') return { ram: await gateway.readRam(onProgress) };
            return gateway.readFirmware(onProgress);
        });
    }

    exportAdvancedTracks(
        indexes: number[],
        useSlowerExploit: boolean,
        options: AdvancedTrackReadOptions,
        interactiveAuthorization: typeof INTERACTIVE_ADVANCED_AUTHORIZATION,
        onProgress: (index: number, progress: AdvancedTrackReadProgress) => void,
        onTrack: (index: number, data: AdvancedTrackData) => void | Promise<void>
    ): Promise<number> {
        return this.runAdvancedTrackDownloadSession(useSlowerExploit, interactiveAuthorization, async (readTrack) => {
            const disc = this.requireDisc();
            const knownIndexes = new Set(disc.groups.flatMap((group) => group.tracks.map((track) => track.index)));
            const selectedIndexes = this.validateUniqueIndexes(indexes, knownIndexes, 'track');
            let completed = 0;
            for (const index of selectedIndexes) {
                if (options.shouldCancel()) break;
                const data = await readTrack(index, options, (progress) => onProgress(index, progress));
                await onTrack(index, data);
                completed += 1;
                if (options.shouldCancel()) break;
            }
            return completed;
        });
    }

    runAdvancedTrackDownloadSession<T>(
        useSlowerExploit: boolean,
        interactiveAuthorization: typeof INTERACTIVE_ADVANCED_AUTHORIZATION,
        operation: (readTrack: AdvancedTrackReader) => Promise<T>
    ): Promise<T> {
        return this.serial(async () => {
            this.requireInteractiveAdvancedAuthorization(interactiveAuthorization);
            this.requireCapability('advanced.factory');
            this.requireDisc();
            const gateway = this.requireAdvancedGateway();
            await this.requireExploitCapability(gateway, 'downloadAtrac');
            await this.gateway.controlPlayback({ action: 'stop' }).catch(() => undefined);
            await gateway.prepareTrackDownload(useSlowerExploit);
            try {
                return await operation((index, options, onProgress) => gateway.readTrack(index, options, onProgress));
            } finally {
                await gateway.finalizeTrackDownload();
            }
        });
    }

    runDeviceUploadSession<T>(
        requiredExploitCapabilities: string[],
        interactiveAuthorization: typeof INTERACTIVE_ADVANCED_AUTHORIZATION | undefined,
        operation: (advancedUploadService?: AdvancedUploadService) => Promise<T>
    ): Promise<{ value: T; snapshot: DeviceSnapshot }> {
        return this.serial(async () => {
            this.requireCapability('track.upload');
            let advancedUploadService: AdvancedUploadService | undefined;
            if (requiredExploitCapabilities.length > 0) {
                this.requireInteractiveAdvancedAuthorization(interactiveAuthorization);
                this.requireCapability('advanced.factory');
                const gateway = this.requireAdvancedGateway();
                for (const capability of requiredExploitCapabilities) {
                    await this.requireExploitCapability(gateway, capability);
                }
                advancedUploadService = {
                    uploadSP: (title, fullWidthTitle, mono, data, onProgress) =>
                        gateway.uploadSP(title, fullWidthTitle, mono, data, onProgress),
                    enableMonoUpload: (enabled) => gateway.enableMonoUpload(enabled),
                };
            }

            let value: T | undefined;
            let primaryError: unknown;
            try {
                value = await operation(advancedUploadService);
            } catch (error) {
                primaryError = error;
            }
            let snapshot: DeviceSnapshot | undefined;
            try {
                this.revision += 1;
                const next = await this.gateway.readSnapshot(true);
                snapshot = this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
            } catch (error) {
                primaryError ??= error;
            }
            if (primaryError) throw primaryError;
            return { value: value as T, snapshot: snapshot! };
        });
    }

    applyMetadataImport(text: string, includedTrackIndexes: number[], expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            const plan = createMetadataImportPlan(text, disc);
            const allowedIndexes = new Set(plan.tracks.filter((track) => track.actual).map((track) => track.trackIndex));
            const selectedIndexes =
                includedTrackIndexes.length === 0
                    ? []
                    : this.validateUniqueIndexes(includedTrackIndexes, allowedIndexes, 'track');
            await this.gateway.renameDisc(plan.discTitle.title, plan.discTitle.fullWidthTitle);
            const usesHiMDMetadata = this.snapshot!.capabilities.includes('metadata.himd');
            for (const track of plan.tracks.filter((entry) => selectedIndexes.includes(entry.trackIndex))) {
                if (usesHiMDMetadata) {
                    await this.gateway.renameHiMDTrack({
                        index: track.trackIndex,
                        title: track.title,
                        album: track.album,
                        artist: track.artist,
                    });
                } else {
                    await this.gateway.renameTrack({
                        index: track.trackIndex,
                        title: track.title,
                        fullWidthTitle: track.fullWidthTitle,
                    });
                }
            }
            if (selectedIndexes.length > 0) {
                await this.gateway.rewriteGroups(buildImportedGroups(plan, new Set(selectedIndexes)));
            }
        });
    }

    renameDisc(title: string, fullWidthTitle?: string, expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async () => {
            await this.gateway.renameDisc(title, fullWidthTitle);
        });
    }

    renameTracks(updates: TrackMetadataUpdate[], expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            const knownIndexes = new Set(disc.groups.flatMap((group) => group.tracks.map((track) => track.index)));
            const requestedIndexes = new Set<number>();
            for (const update of updates) {
                if (!knownIndexes.has(update.index)) {
                    throw new ApplicationError('INVALID_INPUT', `Track ${update.index} does not exist.`, { index: update.index });
                }
                if (requestedIndexes.has(update.index)) {
                    throw new ApplicationError('INVALID_INPUT', `Track ${update.index} was supplied more than once.`, {
                        index: update.index,
                    });
                }
                requestedIndexes.add(update.index);
            }
            for (const update of updates) await this.gateway.renameTrack(update);
        });
    }

    renameHiMDTracks(updates: HiMDTrackMetadataUpdate[], expectedRevision?: number) {
        return this.mutate('metadata.himd', expectedRevision, async (disc) => {
            const knownIndexes = new Set(disc.groups.flatMap((group) => group.tracks.map((track) => track.index)));
            const requestedIndexes = new Set<number>();
            for (const update of updates) {
                if (!knownIndexes.has(update.index)) {
                    throw new ApplicationError('INVALID_INPUT', `Track ${update.index} does not exist.`, { index: update.index });
                }
                if (requestedIndexes.has(update.index)) {
                    throw new ApplicationError('INVALID_INPUT', `Track ${update.index} was supplied more than once.`, {
                        index: update.index,
                    });
                }
                if (![update.title, update.album, update.artist].some((value) => typeof value === 'string')) {
                    throw new ApplicationError('INVALID_INPUT', `Track ${update.index} has no metadata changes.`, {
                        index: update.index,
                    });
                }
                requestedIndexes.add(update.index);
            }
            for (const update of updates) await this.gateway.renameHiMDTrack(update);
        });
    }

    renameGroup(update: GroupMetadataUpdate, expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            if (!disc.groups.some((group) => group.index === update.index && group.index >= 0)) {
                throw new ApplicationError('INVALID_INPUT', `Group ${update.index} does not exist.`, { index: update.index });
            }
            await this.gateway.renameGroup(update);
        });
    }

    createGroup(firstTrack: number, trackCount: number, title = '', fullWidthTitle?: string, expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            const knownIndexes = new Set(disc.groups.flatMap((group) => group.tracks.map((track) => track.index)));
            if (!Number.isInteger(firstTrack) || !Number.isInteger(trackCount) || trackCount < 1) {
                throw new ApplicationError('INVALID_INPUT', 'A group needs a valid first track and at least one track.', {
                    firstTrack,
                    trackCount,
                });
            }
            const requestedIndexes = Array.from({ length: trackCount }, (_, offset) => firstTrack + offset);
            if (requestedIndexes.some((index) => !knownIndexes.has(index))) {
                throw new ApplicationError('INVALID_INPUT', 'The requested group range is outside the current disc.', {
                    firstTrack,
                    trackCount,
                });
            }
            await this.gateway.addGroup(firstTrack, trackCount, title, fullWidthTitle);
        });
    }

    deleteGroups(indexes: number[], expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            const knownIndexes = new Set(disc.groups.filter((group) => group.index >= 0).map((group) => group.index));
            const uniqueIndexes = this.validateUniqueIndexes(indexes, knownIndexes, 'group');
            for (const index of uniqueIndexes.sort((a, b) => b - a)) await this.gateway.deleteGroup(index);
        });
    }

    deleteTracks(indexes: number[], confirmation?: DestructiveConfirmation, expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            this.requireConfirmation(confirmation, 'Deleting tracks permanently removes audio from the disc.');
            const knownIndexes = new Set(disc.groups.flatMap((group) => group.tracks.map((track) => track.index)));
            const uniqueIndexes = this.validateUniqueIndexes(indexes, knownIndexes, 'track');
            await this.gateway.deleteTracks(uniqueIndexes.sort((a, b) => b - a));
        });
    }

    moveTrack(sourceIndex: number, destinationIndex: number, expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async (disc) => {
            const lastIndex = disc.trackCount - 1;
            if (sourceIndex < 0 || sourceIndex > lastIndex || destinationIndex < 0 || destinationIndex > lastIndex) {
                throw new ApplicationError('INVALID_INPUT', 'Track move indexes are outside the current disc.', {
                    sourceIndex,
                    destinationIndex,
                    lastIndex,
                });
            }
            await this.gateway.moveTrack(sourceIndex, destinationIndex);
        });
    }

    eraseDisc(confirmation?: DestructiveConfirmation, expectedRevision?: number) {
        return this.mutate('metadata.edit', expectedRevision, async () => {
            this.requireConfirmation(confirmation, 'Erasing a disc permanently removes every track and group.');
            await this.gateway.wipeDisc();
        });
    }

    formatToHiMD(confirmation?: DestructiveConfirmation, expectedRevision?: number) {
        return this.mutate('disc.formatHimd', expectedRevision, async () => {
            this.requireConfirmation(confirmation, 'Formatting a disc as HiMD permanently removes its current contents.');
            await this.gateway.formatToHiMD();
        });
    }

    flush(expectedRevision?: number) {
        return this.serial(async () => {
            this.assertRevision(expectedRevision);
            if (!this.snapshot?.status.canBeFlushed) {
                throw new ApplicationError('INVALID_INPUT', 'The connected device has no pending changes to flush.');
            }
            await this.gateway.flush();
            this.revision += 1;
            const next = await this.gateway.readSnapshot(true);
            return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
        });
    }

    ejectDisc(expectedRevision?: number) {
        return this.serial(async () => {
            this.assertRevision(expectedRevision);
            this.requireCapability('disc.eject');
            await this.gateway.ejectDisc();
            this.revision += 1;
            const current = this.snapshot!;
            return this.commitSnapshot({
                ...current,
                revision: this.revision,
                status: { ...current.status, discPresent: false },
                disc: null,
            });
        });
    }

    controlPlayback(command: PlaybackCommand) {
        return this.serial(async () => {
            this.requireCapability('playback.control');
            const disc = this.requireDisc();
            if ('index' in command && (command.index < 0 || command.index >= disc.trackCount)) {
                throw new ApplicationError('INVALID_INPUT', `Track ${command.index} does not exist.`, { index: command.index });
            }
            if (
                command.action === 'seek' &&
                [command.hour, command.minute, command.second, command.frame].some((value) => !Number.isInteger(value) || value < 0)
            ) {
                throw new ApplicationError('INVALID_INPUT', 'Seek positions must contain non-negative whole numbers.');
            }
            try {
                await this.gateway.controlPlayback(command);
            } catch (error) {
                if (command.action !== 'next' && command.action !== 'previous') throw error;
                const currentTrack = this.snapshot!.status.track;
                if (currentTrack === undefined || currentTrack === null) throw error;
                const destination = command.action === 'next' ? currentTrack + 1 : currentTrack - 1;
                if (destination >= 0 && destination < disc.trackCount) {
                    await this.gateway.controlPlayback({ action: 'stop' });
                    await this.gateway.controlPlayback({ action: 'gotoTrack', index: destination });
                    await this.gateway.controlPlayback({ action: 'play' });
                }
            }
            const next = await this.gateway.readSnapshot(false);
            return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
        });
    }

    runSelfTest(
        confirmation: DestructiveConfirmation | undefined,
        onProgress: (progress: DiagnosticProgress) => void = () => {},
        isCancelled: () => boolean = () => false,
        playbackDelayMs = 1000
    ): Promise<SelfTestResult> {
        return this.serial(async () => {
            this.requireConfirmation(confirmation, 'The device self-test renames content, deletes tracks, and erases the disc.');
            const disc = this.requireWritableDisc('metadata.edit');
            this.requireCapability('metadata.fullWidth');
            this.requireCapability('playback.control');
            if (disc.trackCount < 2) {
                throw new ApplicationError('INVALID_INPUT', 'The device self-test requires a disposable disc with at least two tracks.');
            }

            let completedSteps = 0;
            let latest = await this.gateway.readSnapshot(true);
            const tracks = () =>
                latest.disc?.groups
                    .flatMap((group) => group.tracks)
                    .sort((left, right) => left.index - right.index) ?? [];
            const expect = (actual: unknown, expected: unknown, label: string) => {
                if (actual !== expected) {
                    throw new ApplicationError('INVALID_INPUT', `${label} verification failed.`, { actual, expected });
                }
            };
            const read = async () => {
                latest = await this.gateway.readSnapshot(true);
            };
            const steps: { label: string; run: () => Promise<void> }[] = [
                { label: 'Reload TOC', run: read },
                {
                    label: 'Rename disc',
                    run: async () => {
                        await this.gateway.renameDisc('Self-Test Half-Width');
                        await read();
                        expect(latest.disc?.title, 'Self-Test Half-Width', 'Half-width disc title');
                    },
                },
                {
                    label: 'Rename disc with full-width title',
                    run: async () => {
                        const title = 'Ｓｅｌｆ－Ｔｅｓｔ　Ｆｕｌｌ－Ｗｉｄｔｈ';
                        await this.gateway.renameDisc('1', title);
                        await read();
                        expect(latest.disc?.fullWidthTitle, title, 'Full-width disc title');
                    },
                },
                {
                    label: 'Rename tracks 1 and 2',
                    run: async () => {
                        await this.gateway.renameTrack({ index: 0, title: '1' });
                        await this.gateway.renameTrack({ index: 1, title: '2' });
                        await read();
                        expect(tracks()[0]?.title, '1', 'Track 1 title');
                        expect(tracks()[1]?.title, '2', 'Track 2 title');
                    },
                },
                {
                    label: 'Rename track 2 with full-width title',
                    run: async () => {
                        const title = 'Ｓｅｌｆ－Ｔｅｓｔ　Ｔｒａｃｋ　Ｆｕｌｌ－Ｗｉｄｔｈ';
                        await this.gateway.renameTrack({ index: 1, title: '2', fullWidthTitle: title });
                        await read();
                        expect(tracks()[1]?.fullWidthTitle, title, 'Full-width track title');
                    },
                },
                {
                    label: 'Move track 1 to position 2',
                    run: async () => {
                        await this.gateway.moveTrack(0, 1);
                        await read();
                        expect(tracks()[0]?.title, '2', 'Moved track 1');
                        expect(tracks()[1]?.title, '1', 'Moved track 2');
                    },
                },
                { label: 'Play track 1', run: () => this.runPlaybackStep({ action: 'gotoTrack', index: 0 }, 'play', playbackDelayMs) },
                { label: 'Next track', run: () => this.runPlaybackStep({ action: 'next' }, undefined, playbackDelayMs) },
                { label: 'Previous track', run: () => this.runPlaybackStep({ action: 'previous' }, undefined, playbackDelayMs) },
                { label: 'Go to track 2', run: () => this.runPlaybackStep({ action: 'gotoTrack', index: 1 }, undefined, playbackDelayMs) },
                { label: 'Pause', run: () => this.runPlaybackStep({ action: 'pause' }, undefined, playbackDelayMs) },
                { label: 'Stop', run: () => this.runPlaybackStep({ action: 'stop' }, undefined, playbackDelayMs) },
                {
                    label: 'Delete track 1',
                    run: async () => {
                        const before = tracks().length;
                        await this.gateway.deleteTracks([0]);
                        await read();
                        expect(tracks().length, before - 1, 'Track deletion');
                    },
                },
                {
                    label: 'Erase disc',
                    run: async () => {
                        await this.gateway.wipeDisc();
                        await read();
                        expect(tracks().length, 0, 'Disc erase');
                    },
                },
            ];

            try {
                for (const step of steps) {
                    if (isCancelled()) break;
                    onProgress({ completed: completedSteps, total: steps.length, currentLabel: step.label });
                    await step.run();
                    completedSteps += 1;
                }
            } catch (error) {
                try {
                    await this.commitDiagnosticSnapshot();
                } catch {
                    // Preserve the step failure. A disconnected device may also
                    // make the best-effort recovery refresh fail.
                }
                throw error;
            }

            await this.commitDiagnosticSnapshot();
            return { completedSteps, totalSteps: steps.length, cancelled: completedSteps < steps.length };
        });
    }

    private mutate(
        capability: ApplicationCapability,
        expectedRevision: number | undefined,
        operation: (disc: NonNullable<DeviceSnapshot['disc']>) => Promise<void>
    ) {
        return this.serial(async () => {
            this.assertRevision(expectedRevision);
            const disc = this.requireWritableDisc(capability);
            await operation(disc);
            this.revision += 1;
            const next = await this.gateway.readSnapshot(true);
            return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
        });
    }

    private commitSnapshot(snapshot: DeviceSnapshot) {
        this.snapshot = snapshot;
        for (const listener of this.listeners) listener(structuredClone(snapshot));
        return structuredClone(snapshot);
    }

    private requireDisc() {
        if (!this.snapshot?.disc) throw new ApplicationError('NO_DISC', 'No disc is available in the active device session.');
        return this.snapshot.disc;
    }

    private requireCapability(capability: ApplicationCapability) {
        if (!this.snapshot?.capabilities.includes(capability)) {
            throw new ApplicationError('CAPABILITY_REQUIRED', `The active device session does not support ${capability}.`, {
                capability,
            });
        }
    }

    private requireWritableDisc(capability: ApplicationCapability) {
        this.requireCapability(capability);
        const disc = this.requireDisc();
        if (!disc.writable || disc.writeProtected) {
            throw new ApplicationError('DISC_READ_ONLY', 'The active disc is read-only or write-protected.');
        }
        return disc;
    }

    private requireAdvancedGateway() {
        if (!this.advancedGateway) {
            throw new ApplicationError('CAPABILITY_REQUIRED', 'Advanced device maintenance is unavailable in this session.', {
                capability: 'advanced.factory',
            });
        }
        return this.advancedGateway;
    }

    private advancedAction(
        capability: string,
        operation: (gateway: AdvancedDeviceGateway) => Promise<void>,
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION,
        confirmation?: DestructiveConfirmation,
        confirmationMessage?: string
    ) {
        return this.serial(async () => {
            this.requireInteractiveAdvancedAuthorization(interactiveAuthorization);
            if (confirmationMessage) this.requireConfirmation(confirmation, confirmationMessage);
            this.requireCapability('advanced.factory');
            const gateway = this.requireAdvancedGateway();
            await this.requireExploitCapability(gateway, capability);
            await operation(gateway);
        });
    }

    private async requireExploitCapability(gateway: AdvancedDeviceGateway, capability: string) {
        const info = await gateway.readInfo();
        if (!info.capabilities.includes(capability)) {
            throw new ApplicationError('CAPABILITY_REQUIRED', `The connected device does not support ${capability}.`, {
                capability,
            });
        }
    }

    private requireInteractiveAdvancedAuthorization(
        interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION
    ) {
        if (interactiveAuthorization !== INTERACTIVE_ADVANCED_AUTHORIZATION) {
            throw new ApplicationError(
                'INTERACTIVE_AUTHORIZATION_REQUIRED',
                'Advanced device maintenance is available only after confirmation in the local browser UI.'
            );
        }
    }

    private validateUniqueIndexes(indexes: number[], knownIndexes: Set<number>, kind: 'track' | 'group') {
        if (indexes.length === 0) throw new ApplicationError('INVALID_INPUT', `At least one ${kind} is required.`);
        const uniqueIndexes = [...new Set(indexes)];
        if (uniqueIndexes.length !== indexes.length) {
            throw new ApplicationError('INVALID_INPUT', `A ${kind} index was supplied more than once.`);
        }
        const missing = uniqueIndexes.find((index) => !knownIndexes.has(index));
        if (missing !== undefined) {
            throw new ApplicationError('INVALID_INPUT', `${kind === 'track' ? 'Track' : 'Group'} ${missing} does not exist.`, {
                index: missing,
            });
        }
        return uniqueIndexes;
    }

    private requireConfirmation(confirmation: DestructiveConfirmation | undefined, message: string) {
        if (!confirmation?.confirmed || confirmation.reason.trim().length === 0) {
            throw new ApplicationError('CONFIRMATION_REQUIRED', message);
        }
    }

    private async runPlaybackStep(command: PlaybackCommand, followedBy?: 'play', delayMs = 1000) {
        await this.gateway.controlPlayback(command);
        if (followedBy) await this.gateway.controlPlayback({ action: followedBy });
        await sleep(delayMs);
    }

    private async commitDiagnosticSnapshot() {
        this.revision += 1;
        const next = await this.gateway.readSnapshot(true);
        return this.commitSnapshot({ ...next, sessionId: this.sessionId, revision: this.revision });
    }

    private assertRevision(expectedRevision?: number) {
        if (expectedRevision !== undefined && expectedRevision !== this.revision) {
            throw new ApplicationError('STALE_REVISION', 'The disc changed after this command was prepared.', {
                expectedRevision,
                actualRevision: this.revision,
            });
        }
    }

    private serial<T>(operation: () => Promise<T>): Promise<T> {
        return this.operations.run(operation);
    }
}

function encodeBase64(data: Uint8Array) {
    let binary = '';
    for (let offset = 0; offset < data.byteLength; offset += 32_768) {
        binary += String.fromCharCode(...data.subarray(offset, Math.min(offset + 32_768, data.byteLength)));
    }
    return btoa(binary);
}

function decodeBase64(data: string) {
    try {
        const binary = atob(data);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
        throw new ApplicationError('INVALID_INPUT', 'The raw TOC is not valid Base64 data.');
    }
}
