import { CustomParameters } from '../../custom-parameters';
import { CodecFamily } from '../interfaces/netmd';
import { DefaultFfmpegAudioExportService, ExportParams } from './audio-export';
import { validateAndStripAtracEncoderOutput } from './atrac-encoder-output';

export class LocalAtracExportService extends DefaultFfmpegAudioExportService {
    public exe: string;
    public ffmpeg: string;
    public originalFileName: string = '';

    constructor(parameters: CustomParameters) {
        super();
        this.ffmpeg = parameters.ffmpeg as string;
        this.exe = parameters.exe as string;
    }

    async prepare(file: File): Promise<void> {
        await super.prepare(file);
        this.originalFileName = file.name;
    }

    async encodeATRAC3(params: ExportParams): Promise<ArrayBuffer> {
        const { data } = await this.ffmpegProcess.read(this.inFileName);
        const arrayBuffer = data.buffer as ArrayBuffer;

        const response = await window.native!.invokeLocalEncoder!(this.ffmpeg, this.exe, arrayBuffer, this.inFileName, params);
        if (!response) throw new Error("Couldn't invoke the local encoder!");

        return validateAndStripAtracEncoderOutput(response, params.format, 'The local encoder');
    }
    async encodeATRAC3Plus(parameters: ExportParams): Promise<ArrayBuffer> {
        return await this.encodeATRAC3(parameters);
    }

    getSupport(_codec: CodecFamily) {
        return { state: 'perfect' as const, gapless: false };
    }
}
