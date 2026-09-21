import type { CodecFamily } from '../interfaces/netmd';
import { getPublicPathFor } from '../../utils';

type FfmpegWorker = ReturnType<(typeof import('@ffmpeg/ffmpeg'))['createWorker']>;

export interface LogPayload {
    message: string;
    action: string;
}

export type ExportParams = {
    format: { bitrate: number; codec: 'AT3' | 'A3+' | 'PCM' | 'MP3' };
    enableReplayGain?: boolean;
    writeGapless: boolean;
};

export interface AudioExportService {
    init(): Promise<void>;
    export(params: ExportParams, callback: (obj: { state: number; total: number }) => void): Promise<ArrayBuffer>;
    info(): Promise<{ format: string | null; input: string | null }>;
    prepare(file: File): Promise<void>;

    getSupport(codec: CodecFamily): { state: 'perfect' | 'mediocre' | 'unsupported'; gapless: boolean };
}

export function getFfmpegInputExtension(fileName: string) {
    const match = fileName.trim().match(/\.([a-z0-9]{1,16})$/i);
    return match?.[1].toLowerCase() ?? 'bin';
}

/**
 * Shared browser-side FFmpeg lifecycle and PCM/MP3 conversion.
 *
 * Audio encoders extend DefaultFfmpegAudioExportService for local conversion.
 */
export class FfmpegPcmMp3Transcoder {
    public ffmpegProcess?: FfmpegWorker;
    public loglines: { action: string; message: string }[] = [];
    public inFileName: string = ``;
    public outFileNameNoExt: string = ``;

    async init() {
        const { setLogging } = await import('@ffmpeg/ffmpeg');
        setLogging(true);
    }

    async prepare(file: File) {
        this.loglines = [];
        try {
            this.inFileName = `inAudioFile.${getFfmpegInputExtension(file.name)}`;
            this.outFileNameNoExt = `outAudioFile`;

            await this.loadFfmpeg();
            await this.ffmpegProcess.write(this.inFileName, file);
        } catch (error) {
            this.releaseFfmpegProcess();
            throw error;
        }
    }

    async loadFfmpeg() {
        const { createWorker } = await import('@ffmpeg/ffmpeg');
        this.releaseFfmpegProcess();
        const process = createWorker({
            logger: (payload: LogPayload) => {
                this.loglines.push(payload);
                console.log(payload.action, payload.message);
            },
            corePath: getPublicPathFor('ffmpeg-core.js'),
            workerPath: getPublicPathFor('runtime/ffmpeg-worker.min.js'),
        });
        this.ffmpegProcess = process;
        try {
            await process.load();
        } catch (error) {
            if (this.ffmpegProcess === process) this.releaseFfmpegProcess();
            throw error;
        }
    }

    async volumeDetect() {
        await this.ffmpegProcess.transcode(this.inFileName, 'null', `-af volumedetect -f null`);

        const maxVolumeRegex = /max_volume: ((-)?[\d]*\.[\d]*) dB/;
        let maxVolume;

        for (const line of this.loglines) {
            const match = line.message.match(maxVolumeRegex);
            if (match !== null) {
                maxVolume = parseFloat(match[1]);
            }
        }
        this.loglines = [];
        return maxVolume ?? 0;
    }

    async info() {
        await this.ffmpegProcess.transcode(this.inFileName, `${this.outFileNameNoExt}.metadata`, `-f ffmetadata`);

        const audioFormatRegex = /Audio:\s(.*?),/; // Actual content
        const inputFormatRegex = /Input #0,\s(.*?),/; // Container
        let format: string | null = null;
        let input: string | null = null;

        for (const line of this.loglines) {
            let match = line.message.match(audioFormatRegex);
            if (match !== null) {
                format = match[1];
                continue;
            }
            match = line.message.match(inputFormatRegex);
            if (match !== null) {
                input = match[1];
                continue;
            }
            if (format !== null && input !== null) {
                break;
            }
        }

        return { format, input };
    }

    async createFfmpegParams(parameters: ExportParams, outputFormat: string, moreParams?: string) {
        const { enableReplayGain } = parameters;
        let additionalCommands = '';
        const commonFormatting = `-ac 2 -ar 44100`;
        if (enableReplayGain) {
            additionalCommands += `-af volume=replaygain=track`;
        }
        return `${additionalCommands} ${commonFormatting} ${moreParams ?? ''} -f ${outputFormat}`;
    }

    async exportPcmOrMp3(parameters: ExportParams): Promise<ArrayBuffer> {
        try {
            const { format } = parameters;
            if (format.codec === `PCM`) return await this.encodePCM(parameters);
            if (format.codec === 'MP3') return await this.encodeMP3(parameters);
            throw new Error(`Browser FFmpeg conversion does not support ${format.codec}.`);
        } finally {
            this.releaseFfmpegProcess();
        }
    }

    protected releaseFfmpegProcess() {
        const process = this.ffmpegProcess;
        this.ffmpegProcess = undefined;
        try {
            process?.worker.terminate();
        } catch {
            // Cleanup must not replace the conversion or preparation result.
        }
    }

    async encodePCM(parameters: ExportParams): Promise<ArrayBuffer> {
        const ffmpegCommand = await this.createFfmpegParams(parameters, 's16be');
        const outFileName = `${this.outFileNameNoExt}.raw`;
        await this.ffmpegProcess.transcode(this.inFileName, outFileName, ffmpegCommand);
        const { data } = await this.ffmpegProcess.read(outFileName);
        return data.buffer;
    }

    async encodeMP3(parameters: ExportParams): Promise<ArrayBuffer> {
        const ffmpegCommand = await this.createFfmpegParams(
            parameters,
            'mp3',
            `-map 0:a:0 -c:a libmp3lame -b:a ${parameters.format.bitrate!}k`
        );
        const outFileName = `${this.outFileNameNoExt}.mp3`;
        await this.ffmpegProcess.transcode(this.inFileName, outFileName, ffmpegCommand);
        const { data } = await this.ffmpegProcess.read(outFileName);
        return data.buffer;
    }
}

export abstract class DefaultFfmpegAudioExportService extends FfmpegPcmMp3Transcoder implements AudioExportService {
    async export(parameters: ExportParams, callback?: (obj: { state: number; total: number }) => void) {
        const { format } = parameters;
        if (format.codec === `PCM` || format.codec === 'MP3') return this.exportPcmOrMp3(parameters);
        try {
            if (format.codec === 'AT3') return await this.encodeATRAC3(parameters, callback);
            if (format.codec === 'A3+') return await this.encodeATRAC3Plus(parameters, callback);
            throw new Error('Invalid format');
        } finally {
            this.releaseFfmpegProcess();
        }
    }

    abstract encodeATRAC3(parameters: ExportParams, callback?: (obj: { state: number; total: number }) => void): Promise<ArrayBuffer>;
    abstract encodeATRAC3Plus(parameters: ExportParams, callback?: (obj: { state: number; total: number }) => void): Promise<ArrayBuffer>;
    abstract getSupport(codec: CodecFamily): { state: 'perfect' | 'mediocre' | 'unsupported'; gapless: boolean };
}
