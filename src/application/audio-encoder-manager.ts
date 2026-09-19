import type { CustomParameters } from '../custom-parameters';
import type { AudioExportService } from '../services/audio/audio-export';
import type { CodecFamily } from '../services/interfaces/netmd';
import { ApplicationError } from './contracts';

export interface AudioEncoderSupport {
    state: 'perfect' | 'mediocre' | 'unsupported';
    gapless: boolean;
}

export interface AudioEncoderConfiguration {
    index: number;
    parameters: CustomParameters;
}

export interface AudioEncoderDescriptor {
    index: number;
    id: string;
    name: string;
    service: AudioExportService;
}

export interface AudioEncoderSnapshot {
    revision: number;
    status: 'idle' | 'loading' | 'ready' | 'error';
    index: number | null;
    id: string | null;
    name: string | null;
    error: string | null;
    support: Partial<Record<CodecFamily, AudioEncoderSupport>>;
}

const codecFamilies: CodecFamily[] = ['SPS', 'SPM', 'AT3', 'A3+', 'PCM', 'MP3'];

type AudioEncoderListener = (snapshot: AudioEncoderSnapshot) => void;

export class AudioEncoderManager {
    private snapshot: AudioEncoderSnapshot = {
        revision: 0,
        status: 'idle',
        index: null,
        id: null,
        name: null,
        error: null,
        support: {},
    };
    private readonly listeners = new Set<AudioEncoderListener>();
    private active?: AudioEncoderDescriptor;
    private activeSignature?: string;
    private pending?: { signature: string; promise: Promise<AudioExportService> };

    constructor(
        private readonly resolveConfiguration: () => AudioEncoderConfiguration,
        private readonly createEncoder: (
            configuration: AudioEncoderConfiguration
        ) => AudioEncoderDescriptor | Promise<AudioEncoderDescriptor>
    ) {}

    getSnapshot = () => structuredClone(this.snapshot);

    subscribe = (listener: AudioEncoderListener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    async getService(): Promise<AudioExportService> {
        const configuration = this.resolveConfiguration();
        const signature = JSON.stringify([configuration.index, configuration.parameters]);
        if (this.active && this.activeSignature === signature) return this.active.service;
        if (this.pending?.signature === signature) return this.pending.promise;
        if (this.pending) {
            try {
                await this.pending.promise;
            } catch {
                // A newer configuration still gets its own initialization attempt.
            }
            return this.getService();
        }

        const promise = this.initialize(configuration, signature);
        this.pending = { signature, promise };
        try {
            return await promise;
        } finally {
            if (this.pending?.promise === promise) this.pending = undefined;
        }
    }

    getActiveService(): AudioExportService {
        if (!this.active) {
            throw new ApplicationError('INVALID_INPUT', 'Initialize an audio encoder before converting audio.');
        }
        return this.active.service;
    }

    private async initialize(configuration: AudioEncoderConfiguration, signature: string) {
        this.publish({ status: 'loading', error: null });
        try {
            const descriptor = await this.createEncoder(configuration);
            await descriptor.service.init();
            this.active = descriptor;
            this.activeSignature = signature;
            this.publish(
                {
                    status: 'ready',
                    index: descriptor.index,
                    id: descriptor.id,
                    name: descriptor.name,
                    error: null,
                    support: Object.fromEntries(
                        codecFamilies.map((codec) => [codec, descriptor.service.getSupport(codec)])
                    ),
                    revision: this.snapshot.revision + 1,
                }
            );
            return descriptor.service;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.publish({ status: 'error', error: message });
            throw error;
        }
    }

    private publish(changes: Partial<AudioEncoderSnapshot>) {
        this.snapshot = { ...this.snapshot, ...changes };
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) listener(snapshot);
    }
}
