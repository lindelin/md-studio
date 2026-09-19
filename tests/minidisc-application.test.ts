import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { ApplicationError, type DeviceGateway, type TrackMetadataUpdate } from '../src/application/contracts.ts';
import { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from '../src/application/interactive-authorization.ts';
import { calculateImportPreview } from '../src/application/import-preview.ts';
import { DefaultMinidiscSpec } from '../src/services/interfaces/netmd.ts';

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
                capabilities: [
                    'content.read',
                    'metadata.edit',
                    'metadata.himd',
                    'metadata.fullWidth',
                    'playback.control',
                    'track.download',
                    'track.upload',
                    'disc.eject',
                    'disc.formatHimd',
                    'advanced.factory',
                ],
                recording: {
                    specName: 'MD',
                    measurementUnits: 'frames',
                    titleStorage: 'netmd-toc',
                    defaultFormat: [0, 0],
                    availableFormats: [
                        { codec: 'SPS', defaultBitrate: 292, availableBitrates: [292], secondsPerDefaultUnit: 1 },
                    ],
                },
                disc: status.discPresent ? structuredClone(disc) : null,
            };
        },
        async readStatus() {
            calls.push('readStatus');
            return structuredClone(status);
        },
        async renameDisc(title, fullWidthTitle) {
            calls.push(`renameDisc:${title}`);
            disc.title = title;
            if (fullWidthTitle !== undefined) disc.fullWidthTitle = fullWidthTitle;
        },
        async renameTrack(update: TrackMetadataUpdate) {
            calls.push(`renameTrack:${update.index}:${update.title}`);
            disc.groups[0].tracks[update.index].title = update.title;
            if (update.fullWidthTitle !== undefined) disc.groups[0].tracks[update.index].fullWidthTitle = update.fullWidthTitle;
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
        async rewriteGroups(groups) {
            calls.push('rewriteGroups');
            disc.groups = structuredClone(groups);
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
        async downloadTrack(index, onProgress) {
            calls.push(`download:${index}`);
            onProgress({ read: 3, total: 3 });
            return { extension: 'oma', data: Uint8Array.from([1, 2, 3]) };
        },
        previewImports(currentDisc, tracks, format) {
            return calculateImportPreview(new DefaultMinidiscSpec(), currentDisc, tracks, format);
        },
    };
    return { gateway, calls, disc, status };
}

describe('MiniDiscApplication', () => {
    it('previews queued imports against the current device and disc revisions', async () => {
        const { gateway } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        const initial = await application.refresh();

        const preview = await application.previewImports(
            [{ id: 'queued', title: 'Queued track', duration: 30 }],
            4,
            undefined,
            initial.revision
        );

        assert.equal(preview.deviceSessionId, initial.sessionId);
        assert.equal(preview.deviceRevision, initial.revision);
        assert.equal(preview.importRevision, 4);
        assert.deepEqual(preview.selectedFormat, { codec: 'SPS', bitrate: 292 });
        assert.equal(preview.capacity.remaining, 60);
        await assert.rejects(
            () => application.previewImports([{ id: 'queued', title: 'Queued track', duration: 30 }], 4, undefined, 99),
            (error: unknown) => error instanceof ApplicationError && error.code === 'STALE_REVISION'
        );
    });

    it('plans, exports, and applies CSV metadata through the shared application layer', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        const initial = await application.refresh();
        const exported = await application.exportMetadataCsv();
        assert.equal(exported.fileName, 'Test Disc.csv');
        assert.match(exported.text, /INDEX,GROUP RANGE/);

        const text = [
            'INDEX,GROUP RANGE,GROUP NAME,GROUP FULL WIDTH NAME,NAME,FULL WIDTH NAME,HIMD ALBUM,HIMD ARTIST,DURATION,ENCODING,BITRATE',
            '0,0-0,,,Imported,,,,10,,',
            '1,0-1,Side A,,First,,Album,Artist,1,SPS,292',
            '2,0-1,Side A,,Second,,Album,Artist,1,SPS,292',
        ].join('\n');
        const plan = await application.planMetadataImport(text);
        assert.equal(plan.trackCountMatches, true);
        const applied = await application.applyMetadataImport(text, [0, 1], initial.revision);

        assert.equal(applied.disc?.title, 'Imported');
        assert.deepEqual(
            applied.disc?.groups.map((group) => ({ title: group.title, tracks: group.tracks.map((track) => track.index) })),
            [{ title: 'Side A', tracks: [0, 1] }]
        );
        assert.deepEqual(calls.slice(-5), [
            'renameDisc:Imported',
            'renameHiMDTrack:0:First:Album:Artist',
            'renameHiMDTrack:1:Second:Album:Artist',
            'rewriteGroups',
            'read',
        ]);
    });

    it('can apply only a CSV disc title without erasing current group layout', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        const text = [
            'INDEX,GROUP RANGE,GROUP NAME,GROUP FULL WIDTH NAME,NAME,FULL WIDTH NAME,HIMD ALBUM,HIMD ARTIST,DURATION,ENCODING,BITRATE',
            '0,0-0,,,Title Only,,,,10,,',
        ].join('\n');

        const applied = await application.applyMetadataImport(text, []);

        assert.equal(applied.disc?.title, 'Title Only');
        assert.equal(applied.disc?.trackCount, 2);
        assert.equal(calls.includes('rewriteGroups'), false);
    });

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

    it('polls playback state without rereading content until disc presence changes', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();

        const playing = await application.pollDeviceStatus();
        assert.equal(playing.disc?.trackCount, 2);
        assert.deepEqual(calls.slice(-1), ['readStatus']);

        const originalReadStatus = gateway.readStatus;
        const originalReadSnapshot = gateway.readSnapshot;
        gateway.readStatus = async () => ({ discPresent: false, canBeFlushed: false, state: 'stopped', track: 0 } as any);
        gateway.readSnapshot = async () => {
            calls.push('read');
            return {
                deviceName: 'MockMD',
                status: { discPresent: false, canBeFlushed: false, state: 'stopped', track: 0 } as any,
                capabilities: ['content.read'] as any,
                recording: {
                    specName: 'MD',
                    measurementUnits: 'frames',
                    titleStorage: 'netmd-toc',
                    defaultFormat: [0, 0],
                    availableFormats: [
                        { codec: 'SPS', defaultBitrate: 292, availableBitrates: [292], secondsPerDefaultUnit: 1 },
                    ],
                },
                disc: null,
            };
        };
        const removed = await application.pollDeviceStatus();
        gateway.readStatus = originalReadStatus;
        gateway.readSnapshot = originalReadSnapshot;

        assert.equal(removed.disc, null);
        assert.equal(removed.revision, 1);
        assert.deepEqual(calls.slice(-1), ['read']);
    });

    it('invalidates prepared commands when a refresh discovers external disc changes', async () => {
        const { gateway, disc } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        const initial = await application.refresh();

        disc.title = 'Changed outside the application';
        const refreshed = await application.refresh(true);

        assert.equal(initial.revision, 0);
        assert.equal(refreshed.revision, 1);
        assert.equal(refreshed.disc?.title, 'Changed outside the application');
        await assert.rejects(
            () => application.renameDisc('Stale edit', undefined, initial.revision),
            (error: any) => error.code === 'STALE_REVISION'
        );
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

    it('reads advanced device information and a checksummed six-sector TOC without mutating the disc', async () => {
        const { gateway, calls } = makeGateway();
        const sectorsRead: number[] = [];
        const application = new MiniDiscApplication(gateway, undefined, {
            async readInfo() {
                return { firmwareVersion: 'S1.600', capabilities: ['downloadAtrac', 'readRam'] };
            },
            async readTocSector(index) {
                sectorsRead.push(index);
                return new Uint8Array(2352).fill(index);
            },
            async writeTocSector() {},
            async flushToc() {},
            async runTetris() {},
            async setSpUploadSpeedup() {},
            async setDiscSwapDetectionDisabled() {},
            async enableHimdFullMode() {},
            async enterServiceMode() {},
            async readRam() {
                return new Uint8Array();
            },
            async readFirmware() {
                return { ram: new Uint8Array(), rom: new Uint8Array() };
            },
        });
        await application.refresh();

        const info = await application.inspectAdvancedDevice();
        const toc = await application.readRawToc();
        const decoded = Buffer.from(toc.dataBase64, 'base64');

        assert.deepEqual(info, { firmwareVersion: 'S1.600', capabilities: ['downloadAtrac', 'readRam'] });
        assert.deepEqual(sectorsRead, [0, 1, 2, 3, 4, 5]);
        assert.equal(toc.sectorSize, 2352);
        assert.equal(toc.sectorCount, 6);
        assert.equal(toc.byteLength, 2352 * 6);
        assert.equal(decoded.length, toc.byteLength);
        assert.equal(toc.sha256, createHash('sha256').update(decoded).digest('hex'));
        assert.equal(application.readSnapshot()?.revision, 0);
        assert.deepEqual(calls, ['read']);
    });

    it('validates and serializes destructive raw TOC writes before refreshing the disc', async () => {
        const { gateway, calls } = makeGateway();
        const written: { index: number; firstByte: number }[] = [];
        let flushed = 0;
        const application = new MiniDiscApplication(gateway, undefined, {
            async readInfo() {
                return { firmwareVersion: 'S1.600', capabilities: ['flushUTOC'] };
            },
            async readTocSector() {
                return new Uint8Array(2352);
            },
            async writeTocSector(index, data) {
                written.push({ index, firstByte: data[0] });
            },
            async flushToc() {
                flushed += 1;
            },
            async runTetris() {},
            async setSpUploadSpeedup() {},
            async setDiscSwapDetectionDisabled() {},
            async enableHimdFullMode() {},
            async enterServiceMode() {},
            async readRam() {
                return new Uint8Array();
            },
            async readFirmware() {
                return { ram: new Uint8Array(), rom: new Uint8Array() };
            },
        });
        await application.refresh();
        const data = new Uint8Array(2352 * 6);
        for (let index = 0; index < 6; index += 1) data.fill(index + 1, index * 2352, (index + 1) * 2352);

        await assert.rejects(() => application.writeRawToc(Buffer.from(data).toString('base64')), {
            code: 'INTERACTIVE_AUTHORIZATION_REQUIRED',
        });
        await assert.rejects(
            () =>
                application.writeRawToc(
                    Buffer.from(data).toString('base64'),
                    undefined,
                    undefined,
                    INTERACTIVE_ADVANCED_AUTHORIZATION
                ),
            {
            code: 'CONFIRMATION_REQUIRED',
            }
        );
        const snapshot = await application.writeRawToc(
            Buffer.from(data).toString('base64'),
            { confirmed: true, reason: 'Confirmed in the advanced maintenance UI.' },
            0,
            INTERACTIVE_ADVANCED_AUTHORIZATION
        );

        assert.deepEqual(written, [
            { index: 0, firstByte: 1 },
            { index: 1, firstByte: 2 },
            { index: 2, firstByte: 3 },
            { index: 3, firstByte: 4 },
        ]);
        assert.equal(flushed, 1);
        assert.equal(snapshot.revision, 1);
        assert.deepEqual(calls, ['read', 'read']);
    });

    it('checks exploit capabilities and confirmation before advanced device actions', async () => {
        const { gateway } = makeGateway();
        const actions: string[] = [];
        const application = new MiniDiscApplication(gateway, undefined, {
            async readInfo() {
                return {
                    firmwareVersion: 'S1.600',
                    capabilities: [
                        'runTetris',
                        'spUploadSpeedup',
                        'disableDiscSwapDetection',
                        'himdFullMode',
                        'enterServiceMode',
                    ],
                };
            },
            async readTocSector() {
                return new Uint8Array(2352);
            },
            async writeTocSector() {},
            async flushToc() {},
            async runTetris() {
                actions.push('tetris');
            },
            async setSpUploadSpeedup(enabled) {
                actions.push(`speedup:${enabled}`);
            },
            async setDiscSwapDetectionDisabled(disabled) {
                actions.push(`disc-swap-disabled:${disabled}`);
            },
            async enableHimdFullMode() {
                actions.push('himd-full');
            },
            async enterServiceMode() {
                actions.push('service-mode');
            },
            async readRam() {
                return new Uint8Array();
            },
            async readFirmware() {
                return { ram: new Uint8Array(), rom: new Uint8Array() };
            },
        });
        await application.refresh();

        await assert.rejects(() => application.runTetris(), { code: 'INTERACTIVE_AUTHORIZATION_REQUIRED' });
        await assert.rejects(() => application.runTetris(undefined, INTERACTIVE_ADVANCED_AUTHORIZATION), {
            code: 'CONFIRMATION_REQUIRED',
        });
        await application.runTetris({ confirmed: true, reason: 'Confirmed in test.' }, INTERACTIVE_ADVANCED_AUTHORIZATION);
        await application.setSpUploadSpeedup(true, INTERACTIVE_ADVANCED_AUTHORIZATION);
        await application.setDiscSwapDetectionDisabled(true, INTERACTIVE_ADVANCED_AUTHORIZATION);
        await application.enableHimdFullMode(
            { confirmed: true, reason: 'Confirmed in test.' },
            INTERACTIVE_ADVANCED_AUTHORIZATION
        );
        await application.enterServiceMode(
            { confirmed: true, reason: 'Confirmed in test.' },
            INTERACTIVE_ADVANCED_AUTHORIZATION
        );

        assert.deepEqual(actions, ['tetris', 'speedup:true', 'disc-swap-disabled:true', 'himd-full', 'service-mode']);
    });

    it('exports advanced memory through the serialized browser-authorized application path', async () => {
        const { gateway } = makeGateway();
        const progress: string[] = [];
        const application = new MiniDiscApplication(gateway, undefined, {
            async readInfo() {
                return { firmwareVersion: 'S1.600', capabilities: ['readRam', 'readFirmware'] };
            },
            async readTocSector() {
                return new Uint8Array(2352);
            },
            async writeTocSector() {},
            async flushToc() {},
            async runTetris() {},
            async setSpUploadSpeedup() {},
            async setDiscSwapDetectionDisabled() {},
            async enableHimdFullMode() {},
            async enterServiceMode() {},
            async readRam(onProgress) {
                onProgress({ region: 'RAM', readBytes: 2, totalBytes: 2 });
                return new Uint8Array([1, 2]);
            },
            async readFirmware(onProgress) {
                onProgress({ region: 'ROM', readBytes: 1, totalBytes: 1 });
                return { ram: new Uint8Array([3]), rom: new Uint8Array([4]) };
            },
        });
        await application.refresh();

        await assert.rejects(
            () =>
                application.readAdvancedMemory(
                    'ram',
                    undefined as unknown as typeof INTERACTIVE_ADVANCED_AUTHORIZATION,
                    () => {}
                ),
            { code: 'INTERACTIVE_AUTHORIZATION_REQUIRED' }
        );
        const ram = await application.readAdvancedMemory('ram', INTERACTIVE_ADVANCED_AUTHORIZATION, (value) =>
            progress.push(`${value.region}:${value.readBytes}/${value.totalBytes}`)
        );
        const firmware = await application.readAdvancedMemory(
            'firmware',
            INTERACTIVE_ADVANCED_AUTHORIZATION,
            (value) => progress.push(`${value.region}:${value.readBytes}/${value.totalBytes}`)
        );

        assert.deepEqual([...ram.ram], [1, 2]);
        assert.deepEqual([...(firmware.rom ?? [])], [4]);
        assert.deepEqual(progress, ['RAM:2/2', 'ROM:1/1']);
    });

    it('validates and finalizes browser-authorized recovery track exports', async () => {
        const { gateway, calls } = makeGateway();
        const actions: string[] = [];
        const application = new MiniDiscApplication(gateway, undefined, {
            async readInfo() {
                return { firmwareVersion: 'S1.600', capabilities: ['downloadAtrac'] };
            },
            async readTocSector() { return new Uint8Array(2352); },
            async writeTocSector() {},
            async flushToc() {},
            async runTetris() {},
            async setSpUploadSpeedup() {},
            async setDiscSwapDetectionDisabled() {},
            async enableHimdFullMode() {},
            async enterServiceMode() {},
            async readRam() { return new Uint8Array(); },
            async readFirmware() { return { ram: new Uint8Array(), rom: new Uint8Array() }; },
            async prepareTrackDownload(slower) { actions.push(`prepare:${slower}`); },
            async readTrack(index, options, onProgress) {
                actions.push(`read:${index}:${options.nerawDownload}`);
                onProgress({ read: 2, total: 2, action: 'READ', sector: '10' });
                return { data: new Uint8Array([index]), extension: 'aea' };
            },
            async finalizeTrackDownload() { actions.push('finalize'); },
        });
        await application.refresh();
        const files: number[] = [];

        const completed = await application.exportAdvancedTracks(
            [1, 0],
            true,
            { nerawDownload: false, shouldCancel: () => false, handleBadSector: async () => 'skip' },
            INTERACTIVE_ADVANCED_AUTHORIZATION,
            (_index, progress) => actions.push(`progress:${progress.read}`),
            (_index, data) => files.push(data.data[0])
        );

        assert.equal(completed, 2);
        assert.deepEqual(files, [1, 0]);
        assert.equal(calls.includes('playback:stop'), true);
        assert.deepEqual(actions, [
            'prepare:true',
            'read:1:false',
            'progress:2',
            'read:0:false',
            'progress:2',
            'finalize',
        ]);
        await assert.rejects(
            () =>
                application.runAdvancedTrackDownloadSession(
                    false,
                    INTERACTIVE_ADVANCED_AUTHORIZATION,
                    async () => { throw new Error('recognition failed'); }
                ),
            /recognition failed/
        );
        assert.deepEqual(actions.slice(-2), ['prepare:false', 'finalize']);
    });

    it('runs browser uploads inside one revisioned application transaction', async () => {
        const { gateway } = makeGateway();
        const actions: string[] = [];
        const application = new MiniDiscApplication(gateway, undefined, {
            async readInfo() { return { firmwareVersion: 'S1.600', capabilities: ['uploadAtrac1', 'uploadMonoSP'] }; },
            async readTocSector() { return new Uint8Array(2352); },
            async writeTocSector() {},
            async flushToc() {},
            async runTetris() {},
            async setSpUploadSpeedup() {},
            async setDiscSwapDetectionDisabled() {},
            async enableHimdFullMode() {},
            async enterServiceMode() {},
            async readRam() { return new Uint8Array(); },
            async readFirmware() { return { ram: new Uint8Array(), rom: new Uint8Array() }; },
            async prepareTrackDownload() {},
            async readTrack() { return { data: new Uint8Array(), extension: 'aea' }; },
            async finalizeTrackDownload() {},
            async uploadSP(title, _fullWidthTitle, mono, _data, onProgress) {
                actions.push(`upload:${title}:${mono}`);
                onProgress({ written: 4, encrypted: 4, total: 4 });
                return 0;
            },
            async enableMonoUpload(enabled) { actions.push(`mono:${enabled}`); },
        });
        await application.refresh();

        await assert.rejects(
            () => application.runDeviceUploadSession([], undefined, async () => 'unexpected', { sessionId: 'other', revision: 0 }),
            (error: any) => error.code === 'STALE_REVISION'
        );
        await assert.rejects(
            () =>
                application.runDeviceUploadSession([], undefined, async () => 'unexpected', {
                    sessionId: application.sessionId,
                    revision: 1,
                }),
            (error: any) => error.code === 'STALE_REVISION'
        );

        const result = await application.runDeviceUploadSession(
            ['uploadAtrac1', 'uploadMonoSP'],
            INTERACTIVE_ADVANCED_AUTHORIZATION,
            async (service) => {
                await service!.enableMonoUpload(true);
                await service!.uploadSP('Track', '', true, new ArrayBuffer(1), () => {});
                await service!.enableMonoUpload(false);
                return 'written';
            },
            { sessionId: application.sessionId, revision: 0 }
        );

        assert.equal(result.value, 'written');
        assert.equal(result.snapshot.revision, 1);
        assert.deepEqual(actions, ['mono:true', 'upload:Track:true', 'mono:false']);
        await assert.rejects(
            () =>
                application.runDeviceUploadSession([], undefined, async () => {
                    throw new Error('encoder failed');
                }),
            /encoder failed/
        );
        assert.equal(application.readSnapshot()?.revision, 2);
    });

    it('runs ordinary track downloads inside the application transaction', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        const initial = await application.refresh();
        const progress: number[] = [];

        const result = await application.runTrackDownloadSession(
            { sessionId: initial.sessionId, revision: initial.revision },
            (downloadTrack) => downloadTrack(1, ({ read }) => progress.push(read))
        );

        assert.deepEqual([...result!.data], [1, 2, 3]);
        assert.deepEqual(progress, [3]);
        assert.equal(calls.at(-1), 'download:1');
        await assert.rejects(
            () =>
                application.runTrackDownloadSession(
                    { sessionId: initial.sessionId, revision: initial.revision + 1 },
                    async () => null
                ),
            (error: any) => error.code === 'STALE_REVISION'
        );
    });

    it('runs the destructive self-test as one revisioned transaction and leaves a verified empty disc', async () => {
        const { gateway, calls } = makeGateway();
        const application = new MiniDiscApplication(gateway);
        await application.refresh();
        const progress: string[] = [];

        const result = await application.runSelfTest(
            { confirmed: true, reason: 'Disposable test disc' },
            (entry) => progress.push(entry.currentLabel),
            () => false,
            0
        );

        assert.equal(result.cancelled, false);
        assert.equal(result.completedSteps, 14);
        assert.equal(application.readSnapshot()?.revision, 1);
        assert.equal(application.readSnapshot()?.disc?.trackCount, 0);
        assert.equal(progress.length, 14);
        assert.equal(calls.includes('deleteTracks:0'), true);
        assert.equal(calls.includes('wipeDisc'), true);
    });
});
