import {
    ApplicationError,
    type ApplicationCapability,
    type DestructiveConfirmation,
    type DeviceGateway,
    type DeviceSnapshot,
    type GroupMetadataUpdate,
    type PlaybackCommand,
    type TrackMetadataUpdate,
} from './contracts';

function createSessionId() {
    return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class MiniDiscApplication {
    readonly sessionId = createSessionId();
    private revision = 0;
    private snapshot?: DeviceSnapshot;
    private taskQueue: Promise<void> = Promise.resolve();
    private readonly gateway: DeviceGateway;

    constructor(gateway: DeviceGateway) {
        this.gateway = gateway;
    }

    refresh(dropCache = false) {
        return this.serial(async () => {
            const next = await this.gateway.readSnapshot(dropCache);
            this.snapshot = { ...next, sessionId: this.sessionId, revision: this.revision };
            return this.snapshot;
        });
    }

    synchronizeAfterExternalMutation(dropCache = true) {
        return this.serial(async () => {
            this.revision += 1;
            const next = await this.gateway.readSnapshot(dropCache);
            this.snapshot = { ...next, sessionId: this.sessionId, revision: this.revision };
            return this.snapshot;
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

    ejectDisc(expectedRevision?: number) {
        return this.serial(async () => {
            this.assertRevision(expectedRevision);
            this.requireCapability('disc.eject');
            await this.gateway.ejectDisc();
            this.revision += 1;
            const current = this.snapshot!;
            this.snapshot = {
                ...current,
                revision: this.revision,
                status: { ...current.status, discPresent: false },
                disc: null,
            };
            return this.snapshot;
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
                if (destination < 0 || destination >= disc.trackCount) return this.snapshot!;
                await this.gateway.controlPlayback({ action: 'stop' });
                await this.gateway.controlPlayback({ action: 'gotoTrack', index: destination });
                await this.gateway.controlPlayback({ action: 'play' });
            }
            return this.snapshot!;
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
            this.snapshot = { ...next, sessionId: this.sessionId, revision: this.revision };
            return this.snapshot;
        });
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

    private assertRevision(expectedRevision?: number) {
        if (expectedRevision !== undefined && expectedRevision !== this.revision) {
            throw new ApplicationError('STALE_REVISION', 'The disc changed after this command was prepared.', {
                expectedRevision,
                actualRevision: this.revision,
            });
        }
    }

    private serial<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.taskQueue.then(operation, operation);
        this.taskQueue = result.then(
            () => undefined,
            () => undefined
        );
        return result;
    }
}
