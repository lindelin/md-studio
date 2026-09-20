import { CustomParameters } from '../../custom-parameters';
import { getATRACWAVEncoding } from '../../utils';
import { CodecFamily } from '../interfaces/netmd';
import { DefaultFfmpegAudioExportService, ExportParams } from '../audio/audio-export';
import { LibraryService, LocalDatabase } from './library';

const MAX_TRIES = 3;
const DATABASE_TIMEOUT_MS = 30_000;
const AUDIO_TIMEOUT_MS = 120_000;

export async function retryRemoteLibraryRequest<T>(
    label: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: { attempts?: number; timeoutMs?: number } = {}
): Promise<T> {
    const attempts = options.attempts ?? MAX_TRIES;
    const timeoutMs = options.timeoutMs ?? DATABASE_TIMEOUT_MS;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
        throw new Error('Remote library attempts must be a whole number from 1 to 10.');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
        throw new Error('Remote library timeout must be a positive number of milliseconds.');
    }

    let lastMessage = 'Unknown error.';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await operation(controller.signal);
        } catch (error) {
            lastMessage = controller.signal.aborted
                ? `Timed out after ${timeoutMs} ms.`
                : error instanceof Error
                  ? error.message
                  : String(error);
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new Error(`${label} failed after ${attempts} attempts. ${lastMessage}`);
}

export class RemoteLibraryService extends DefaultFfmpegAudioExportService implements LibraryService {
    // These methods are required by the DefaultFFMPEGAudioExport service, but since
    // this is a library, they won't be used
    encodeATRAC3(parameters: ExportParams): Promise<ArrayBuffer> {
        void parameters;
        throw new Error('Method not implemented.');
    }
    encodeATRAC3Plus(parameters: ExportParams): Promise<ArrayBuffer> {
        void parameters;
        throw new Error('Method not implemented.');
    }

    public address: string;
    public originalFileName: string = '';

    constructor(parameters: CustomParameters) {
        super();
        this.address = parameters.address as string;
    }

    getSupport(codec: CodecFamily) {
        void codec;
        return { state: 'perfect' as const, gapless: false };
    }

    async getDatabase(): Promise<LocalDatabase> {
        const dbPage = new URL(this.address);
        if (!dbPage.pathname.endsWith('/')) dbPage.pathname += '/';
        dbPage.pathname += 'database';
        dbPage.searchParams.append('cache', Math.random() + '');
        return retryRemoteLibraryRequest(
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
            const audio = await retryRemoteLibraryRequest(
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
            return this.export(params);
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
            return retryRemoteLibraryRequest(
                'Library transcode request',
                async (signal) => {
                    const response = await fetch(encodingURL.href, { signal });
                    if (!response.ok) throw new Error(`HTTP ${response.status}.`);
                    const source = await response.arrayBuffer();
                    const content = new Uint8Array(source);
                    const file = new File([content], 'test.at3');
                    const encoding = await getATRACWAVEncoding(file);
                    if (!encoding) throw new Error('The remote encoder returned an invalid ATRAC WAV file.');
                    const headerLength = encoding.headerLength;
                    return source.slice(headerLength);
                },
                { timeoutMs: AUDIO_TIMEOUT_MS }
            );
        }
    }
}
