import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetMDMockService } from '../src/services/interfaces/netmd-mock.ts';

function createService() {
    return new NetMDMockService(
        {
            capabilityContentList: true,
            capabilityPlaybackControl: true,
            capabilityMetadataEdit: true,
            capabilityTrackUpload: true,
            capabilityTrackDownload: true,
            capabilityDiscEject: true,
            capabilityFactoryMode: true,
        },
        false
    );
}

function orderedTracks(service: NetMDMockService) {
    return service
        ._getDisc()
        .groups.flatMap((group) => group.tracks)
        .sort((a, b) => a.index - b.index);
}

describe('NetMDMockService destructive operations', () => {
    it('keeps every surviving track visible and grouped after deleting the first grouped track', async () => {
        const service = createService();

        await service.deleteTracks([0]);

        const disc = service._getDisc();
        assert.equal(disc.trackCount, 4);
        assert.deepEqual(
            orderedTracks(service).map((track) => [track.index, track.title]),
            [
                [0, 'Mock Track 2 (mono)'],
                [1, 'Mock Track 3'],
                [2, 'Mock Track 4'],
                [3, 'Mock Track 5'],
            ]
        );
        assert.deepEqual(disc.groups.find((group) => group.title === 'Test')?.tracks.map((track) => track.index), [0]);
    });

    it('renumbers groups after each item in a multi-track deletion', async () => {
        const service = createService();

        await service.deleteTracks([0, 2]);

        const disc = service._getDisc();
        assert.equal(disc.trackCount, 3);
        assert.deepEqual(
            orderedTracks(service).map((track) => [track.index, track.title]),
            [
                [0, 'Mock Track 2 (mono)'],
                [1, 'Mock Track 4'],
                [2, 'Mock Track 5'],
            ]
        );
        assert.deepEqual(disc.groups.find((group) => group.title === 'Test')?.tracks.map((track) => track.index), [0]);
    });

    it('clears the in-memory disc without leaving title or group metadata behind', async () => {
        const service = createService();

        await service.wipeDisc();

        const disc = service._getDisc();
        assert.equal(disc.trackCount, 0);
        assert.equal(disc.title, '');
        assert.equal(disc.fullWidthTitle, '');
        assert.deepEqual(disc.groups, [
            {
                title: null,
                fullWidthTitle: null,
                index: 0,
                tracks: [],
            },
        ]);
    });

    it('keeps reporting no disc after eject so polling cannot reinsert it', async () => {
        const service = createService();

        await service.ejectDisc();

        assert.equal((await service.getDeviceStatus()).discPresent, false);
    });
});
