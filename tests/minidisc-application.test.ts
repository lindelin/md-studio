import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApplicationError, type DeviceGateway, type TrackMetadataUpdate } from '../src/application/contracts.ts';
import { MiniDiscApplication } from '../src/application/minidisc-application.ts';

function makeGateway() {
    const calls: string[] = [];
    const status = { discPresent: true, canBeFlushed: true, state: 'stopped', track: 0 } as any;
    const disc = {
        title: 'Test Disc',
        fullWidthTitle: '',
        writable: true,
        writeProtected: false,
        used: 10,
        left: 90,
        total: 100,
        trackCount: 2,
        groups: [
            {
                index: -1,
                title: null,
                fullWidthTitle: null,
                tracks: [
                    { index: 0, title: 'A', fullWidthTitle: '', duration: 1, channel: 2, encoding: { codec: 'SPS', bitrate: 292 } },
                    { index: 1, title: 'B', fullWidthTitle: '', duration: 1, channel: 2, encoding: { codec: 'SPS', bitrate: 292 } },
                ],
            },
        ],
    } as any;
    const gateway: DeviceGateway = {
        async readSnapshot() {
            calls.push('read');
            return {
                deviceName: 'MockMD',
                status: structuredClone(status),
                capabilities: ['content.read', 'metadata.edit', 'metadata.himd', 'playback.control', 'disc.eject', 'disc.formatHimd'],
                disc: structuredClone(disc),
            };
        },
        async renameDisc(title) {
            calls.push(`renameDisc:${title}`);
            disc.title = title;
        },
        async renameTrack(update: TrackMetadataUpdate) {
            calls.push(`renameTrack:${update.index}:${update.title}`);
            disc.groups[0].tracks[update.index].title = update.title;
        },
        async renameHiMDTrack(update) {
            calls.push(`renameHiMDTrack:${update.index}:${update.title ?? ''}:${update.album ?? ''}:${update.artist ?? ''}`);
            if (update.title !== undefined) disc.groups[0].tracks[update.index].title = update.title;
        },
        async renameGroup(update) {
            calls.push(`renameGroup:${update.index}:${update.title}`);
        },
        async addGroup(firstTrack, trackCount, title) {
            calls.push(`addGroup:${firstTrack}:${trackCount}:${title}`);
        },
        async deleteGroup(index) {
            calls.push(`deleteGroup:${index}`);
        },
        async deleteTracks(indexes) {
            calls.push(`deleteTracks:${indexes.join(',')}`);
            disc.groups[0].tracks = disc.groups[0].tracks.filter((track: any) => !indexes.includes(track.index));
            disc.trackCount = disc.groups[0].tracks.length;
        },
        async moveTrack(sourceIndex, destinationIndex) {
            calls.push(`move:${sourceIndex}:${destinationIndex}`);
            const [track] = disc.groups[0].tracks.splice(sourceIndex, 1);
            disc.groups[0].tracks.splice(destinationIndex, 0, track);
            disc.groups[0].tracks.forEach((entry: any, index: number) => (entry.index = index));
        },
        async wipeDisc() {
            calls.push('wipeDisc');
            disc.groups[0].tracks = [];
            disc.trackCount = 0;
        },
        async formatToHiMD() {
            calls.push('formatToHiMD');
            disc.groups[0].tracks = [];
            disc.trackCount = 0;
        },
        async flush() {
            calls.push('flush');
        },
        async ejectDisc() {
            calls.push('ejectDisc');
        },
        async controlPlayback(command) {
            calls.push(`playback:${command.action}`);
            if (command.action === 'play') status.state = 'playing';
            if (command.action === 'pause') status.state = 'paused';
            if (command.action === 'stop') status.state = 'stopped';
            if (command.action === 'gotoTrack' || command.action === 'seek') status.track = command.index;
        },
    };
    return { gateway, calls };
}

describe('MiniDiscApplication', () => {
    it('publishes device snapshots only after successful reads and mutations', async () => {
        const { gateway } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        const revisions: number[] = [];
        const unsubscribe = application.subscribe((snapshot) => revisions.push(snapshot.revision));

        assert.equal(application.readSnapshot(), null);
        await application.refresh();
        await application.renameDisc('Published');
        await assert.rejects(() => application.renameTracks([{ index: 99, title: 'Missing' }]));
        unsubscribe();
        await application.renameDisc('Not observed');

        assert.deepEqual(revisions, [0, 1]);
        assert.equal(application.readSnapshot()?.disc?.title, 'Not observed');
    });

    it('returns a stable session and increments the revision only after a successful mutation', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        const initial = await application.refresh();
        const renamed = await application.renameDisc('Renamed', undefined, initial.revision);
        assert.equal(renamed.sessionId, initial.sessionId);
        assert.equal(renamed.revision, 1);
        assert.equal(renamed.disc?.title, 'Renamed');
        assert.deepEqual(calls, ['read', 'renameDisc:Renamed', 'read']);
    });

    it('rejects stale commands before writing to the device', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        await application.renameDisc('First', undefined, 0);
        await assert.rejects(
            () => application.renameDisc('Stale', undefined, 0),
            (error: unknown) => {
                assert.equal((error as ApplicationError).code, 'STALE_REVISION');
                return true;
            }
        );
        assert.equal(calls.filter((call) => call.startsWith('renameDisc')).length, 1);
    });

    it('validates an entire batch before renaming any track', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        await assert.rejects(
            () =>
                application.renameTracks([
                    { index: 0, title: 'Valid' },
                    { index: 4, title: 'Missing' },
                ]),
            (error: unknown) => {
                assert.equal((error as ApplicationError).code, 'INVALID_INPUT');
                return true;
            }
        );
        assert.equal(
            calls.some((call) => call.startsWith('renameTrack')),
            false
        );
    });

    it('serializes commands that are submitted at the same time', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        await Promise.all([application.moveTrack(0, 1), application.renameDisc('After Move')]);
        assert.deepEqual(calls.slice(1), ['move:0:1', 'read', 'renameDisc:After Move', 'read']);
    });

    it('requires explicit confirmation before deleting audio', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        await assert.rejects(
            () => application.deleteTracks([0]),
            (error: unknown) => {
                assert.equal((error as ApplicationError).code, 'CONFIRMATION_REQUIRED');
                return true;
            }
        );
        assert.equal(
            calls.some((call) => call.startsWith('deleteTracks')),
            false
        );
    });

    it('validates and sorts destructive track deletion before calling the device', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        const snapshot = await application.deleteTracks([0, 1], { confirmed: true, reason: 'Disposable test disc' });
        assert.equal(snapshot.disc?.trackCount, 0);
        assert.equal(calls.includes('deleteTracks:1,0'), true);
    });

    it('returns an ejected snapshot without reading from an unavailable disc', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        const snapshot = await application.ejectDisc();
        assert.equal(snapshot.disc, null);
        assert.equal(snapshot.status.discPresent, false);
        assert.deepEqual(calls, ['read', 'ejectDisc']);
    });

    it('updates HiMD metadata through the shared application layer', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();

        const snapshot = await application.renameHiMDTracks([{ index: 0, title: 'Updated', album: 'Album', artist: 'Artist' }]);

        assert.equal(snapshot.disc?.groups[0].tracks[0].title, 'Updated');
        assert.equal(calls.includes('renameHiMDTrack:0:Updated:Album:Artist'), true);
    });

    it('requires confirmation before formatting a disc as HiMD', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();

        await assert.rejects(
            () => application.formatToHiMD(),
            (error: unknown) => {
                assert.equal((error as ApplicationError).code, 'CONFIRMATION_REQUIRED');
                return true;
            }
        );
        assert.equal(calls.includes('formatToHiMD'), false);
    });

    it('flushes pending device changes and refreshes the snapshot', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();

        const snapshot = await application.flush(0);

        assert.equal(snapshot.revision, 1);
        assert.deepEqual(calls, ['read', 'flush', 'read']);
    });

    it('returns device-confirmed playback state without changing the disc revision', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();

        const snapshot = await application.controlPlayback({ action: 'play' });

        assert.equal(snapshot.status.state, 'playing');
        assert.equal(snapshot.revision, 0);
        assert.deepEqual(calls, ['read', 'playback:play', 'read']);
    });
});
