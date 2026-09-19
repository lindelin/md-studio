import { ApplicationError, type DeviceGateway, type DeviceSnapshot, type TrackMetadataUpdate } from './contracts';

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

    renameDisc(title: string, fullWidthTitle?: string, expectedRevision?: number) {
        return this.mutate(expectedRevision, async () => {
            await this.gateway.renameDisc(title, fullWidthTitle);
        });
    }

    renameTracks(updates: TrackMetadataUpdate[], expectedRevision?: number) {
        return this.mutate(expectedRevision, async () => {
            const disc = this.requireEditableDisc();
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

    moveTrack(sourceIndex: number, destinationIndex: number, expectedRevision?: number) {
        return this.mutate(expectedRevision, async () => {
            const disc = this.requireEditableDisc();
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

    private mutate(expectedRevision: number | undefined, operation: () => Promise<void>) {
        return this.serial(async () => {
            this.assertRevision(expectedRevision);
            this.requireEditableDisc();
            await operation();
            this.revision += 1;
            const next = await this.gateway.readSnapshot(true);
            this.snapshot = { ...next, sessionId: this.sessionId, revision: this.revision };
            return this.snapshot;
        });
    }

    private requireEditableDisc() {
        if (!this.snapshot?.disc) throw new ApplicationError('NO_DISC', 'No disc is available in the active device session.');
        if (!this.snapshot.capabilities.includes('metadata.edit')) {
            throw new ApplicationError('CAPABILITY_REQUIRED', 'The active device session cannot edit disc metadata.', {
                capability: 'metadata.edit',
            });
        }
        return this.snapshot.disc;
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
