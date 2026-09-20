import { CustomParameters } from '../../custom-parameters';
import { validateAndStripAtracEncoderOutput } from '../audio/atrac-encoder-output';
import { ExportParams, FfmpegPcmMp3Transcoder } from '../audio/audio-export';
import { retryRemoteRequest } from '../remote-request';
import { LibraryService, LocalDatabase } from './library';

const DATABASE_TIMEOUT_MS = 30_000;
const AUDIO_TIMEOUT_MS = 120_000;

export class RemoteLibraryService extends FfmpegPcmMp3Transcoder implements LibraryService {
    public address: string;
    public originalFileName: string = '';

    constructor(parameters: CustomParameters) {
        super();
        this.address = parameters.address as string;
    }

    async getDatabase(): Promise<LocalDatabase> {
        const dbPage = new URL(this.address);
        if (!dbPage.pathname.endsWith('/')) dbPage.pathname += '/';
        dbPage.pathname += 'database';
        dbPage.searchParams.append('cache', Math.random() + '');
        return retryRemoteRequest(
            'Library database request',
            async (signal) => {
                const response = await fetch(dbPage, { signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}.`);
                return (await response.json()) as LocalDatabase;
            },
            { timeoutMs: DATABASE_TIMEOUT_MS }
        );
    }

    async processLocalLibraryFile(filePath: string, params: ExportParams): Promise<ArrayBuffer> {
        if (params.format.codec === 'PCM' || params.format.codec === 'MP3') {
            // Fetch the file normally, then transcode to PCM / MP3
            const rawURL = new URL(this.address);
            if (!rawURL.pathname.endsWith('/')) rawURL.pathname += '/';
            rawURL.pathname += 'get_local';
            rawURL.searchParams.set('file_name', filePath);
            const audio = await retryRemoteRequest(
                'Library audio request',
                async (signal) => {
                    const response = await fetch(rawURL, { signal });
                    if (!response.ok) throw new Error(`HTTP ${response.status}.`);
                    return response.blob();
                },
                { timeoutMs: AUDIO_TIMEOUT_MS }
            );
            const fileTokens = filePath.split('/');
            const fileName = fileTokens[fileTokens.length - 1];
            const asFile = new File([audio], fileName);
            await this.prepare(asFile);
            return this.exportPcmOrMp3(params);
        } else {
            const { format, enableReplayGain } = params;
            const encodingURL = new URL(this.address);
            if (!encodingURL.pathname.endsWith('/')) encodingURL.pathname += '/';
            encodingURL.pathname += 'transcode_local';
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
            encodingURL.searchParams.set('file_name', filePath);
            if (enableReplayGain !== undefined) encodingURL.searchParams.set('applyReplaygain', enableReplayGain.toString());
            return retryRemoteRequest(
                'Library transcode request',
                async (signal) => {
                    const response = await fetch(encodingURL.href, { signal });
                    if (!response.ok) throw new Error(`HTTP ${response.status}.`);
                    const source = await response.arrayBuffer();
                    return validateAndStripAtracEncoderOutput(source, format, 'The remote library encoder');
                },
                { timeoutMs: AUDIO_TIMEOUT_MS }
            );
        }
    }
}
