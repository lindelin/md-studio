import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodecFamily } from '../src/services/interfaces/netmd.ts';
import {
    DefaultFfmpegAudioExportService,
    type ExportParams,
} from '../src/services/audio/audio-export.ts';

type FfmpegProcess = NonNullable<DefaultFfmpegAudioExportService['ffmpegProcess']>;

class TestAudioExportService extends DefaultFfmpegAudioExportService {
    constructor(private readonly process: FfmpegProcess, private readonly encode: () => Promise<ArrayBuffer>) {
        super();
    }

    async loadFfmpeg() {
        this.ffmpegProcess = this.process;
    }

    encodeATRAC3(): Promise<ArrayBuffer> {
        return this.encode();
    }

    encodeATRAC3Plus(): Promise<ArrayBuffer> {
        return this.encode();
    }

    getSupport(_codec: CodecFamily) {
        return { state: 'perfect' as const, gapless: false };
    }
}

const params: ExportParams = {
    format: { codec: 'AT3', bitrate: 132 },
    writeGapless: false,
};

describe('DefaultFfmpegAudioExportService cleanup', () => {
    it('terminates and forgets the worker when input preparation fails', async () => {
        let terminated = 0;
        const process = {
            write: async () => {
                throw new Error('input write failed');
            },
            worker: { terminate: () => { terminated += 1; } },
        } as unknown as FfmpegProcess;
        const service = new TestAudioExportService(process, async () => new ArrayBuffer(0));

        await assert.rejects(service.prepare(new File([], 'track.wav')), /input write failed/);
        assert.equal(terminated, 1);
        assert.equal(service.ffmpegProcess, undefined);
    });

    it('does not replace a successful export when worker termination throws', async () => {
        const expected = Uint8Array.of(1, 2, 3).buffer;
        const process = {
            worker: { terminate: () => { throw new Error('terminate failed'); } },
        } as unknown as FfmpegProcess;
        const service = new TestAudioExportService(process, async () => expected);
        service.ffmpegProcess = process;

        assert.equal(await service.export(params), expected);
        assert.equal(service.ffmpegProcess, undefined);
    });
});
