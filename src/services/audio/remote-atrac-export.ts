import { CustomParameters } from '../../custom-parameters';
import { getATRACWAVEncoding } from '../../utils';
import { CodecFamily } from '../interfaces/netmd';
import { retryRemoteRequest } from '../remote-request';
import { DefaultFfmpegAudioExportService, ExportParams } from './audio-export';

const TRANSCODE_TIMEOUT_MS = 120_000;

export class RemoteAtracExportService extends DefaultFfmpegAudioExportService {
    public address: string;
    public originalFileName: string = '';

    constructor(parameters: CustomParameters) {
        super();
        this.address = parameters.address as string;
    }

    async prepare(file: File): Promise<void> {
        await super.prepare(file);
        this.originalFileName = file.name;
    }

    async encodeATRAC3({ format, enableReplayGain }: ExportParams): Promise<ArrayBuffer> {
        const { data } = await this.ffmpegProcess.read(this.inFileName);

        const payload = new FormData();
        payload.append('file', new Blob([data.buffer]), this.originalFileName);
        const encodingURL = new URL(this.address);
        if (!encodingURL.pathname.endsWith('/')) encodingURL.pathname += '/';
        encodingURL.pathname += 'transcode';
        let encoderFormat: string;
        switch (format.codec) {
            case 'A3+':
                if (![48, 64, 96, 128, 160, 192, 256, 320, 352].includes(format.bitrate ?? 0)) {
                    throw new Error('Invalid bitrate given to encoder');
                }
                encoderFormat = `PLUS${format.bitrate!}`;
                break;
            case 'AT3':
                // AT3@105kbps
                if (format.bitrate === 105) {
                    encoderFormat = 'LP105';
                    break;
                } else if (format.bitrate === 132) {
                    encoderFormat = 'LP2';
                    break;
                } else if (format.bitrate === 66) {
                    encoderFormat = 'LP4';
                    break;
                } // else fall through
            default:
                throw new Error('Invalid format given to encoder');
        }
        encodingURL.searchParams.set('type', encoderFormat);
        if (enableReplayGain !== undefined) encodingURL.searchParams.set('applyReplaygain', enableReplayGain.toString());
        return retryRemoteRequest(
            'Remote ATRAC transcode',
            async (signal) => {
                const response = await fetch(encodingURL.href, {
                    method: 'POST',
                    body: payload,
                    signal,
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}.`);
                const source = await response.arrayBuffer();
                const content = new Uint8Array(source);
                const file = new File([content], 'test.at3');
                const encoding = await getATRACWAVEncoding(file);
                if (!encoding) throw new Error('The remote encoder returned an invalid ATRAC WAV file.');
                const headerLength = encoding.headerLength;
                return source.slice(headerLength);
            },
            { timeoutMs: TRANSCODE_TIMEOUT_MS }
        );
    }

    async encodeATRAC3Plus(parameters: ExportParams): Promise<ArrayBuffer> {
        return await this.encodeATRAC3(parameters);
    }

    getSupport(_codec: CodecFamily) {
        return { state: 'perfect' as const, gapless: false };
    }
}
