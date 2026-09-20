import { downloadBlob, getPublicPathFor } from '../../utils';
import Recorder from 'recorderjs';

export class MediaRecorderService {
    public recorder: any;
    public stream?: MediaStream;
    public audioContext?: AudioContext;
    public analyserNode?: AnalyserNode;
    public gainNode?: GainNode;

    async playTestInput(deviceId: string) {
        await this.stopTestInput();
        const audioContext = new AudioContext();
        this.audioContext = audioContext;
        this.gainNode = audioContext.createGain();
        this.analyserNode = audioContext.createAnalyser();

        try {
            await this.initStream(deviceId);
            if (this.audioContext !== audioContext) return;
            const source = audioContext.createMediaStreamSource(this.stream!);
            source.connect(this.gainNode);
            this.gainNode.connect(this.analyserNode);
            this.analyserNode.connect(audioContext.destination);
        } catch (error) {
            if (this.audioContext === audioContext) await this.stopTestInput();
            throw error;
        }
    }

    async stopTestInput() {
        const audioContext = this.audioContext;
        delete this.audioContext;
        if (audioContext && audioContext.state !== 'closed') await audioContext.close();
        await this.closeStream();
    }

    async initStream(deviceId: string) {
        const recordConstraints = {
            // Try to set the best recording params for ripping the audio tracks
            autoGainControl: false,
            channelCount: 2,
            deviceId: deviceId,
            echoCancellation: false,
            noiseSuppression: false,
            sampleRate: { min: 44100, max: 44100, ideal: 44100 }, // CAVEAT: it looks like this is the only way to get 44100Hz as sampling rate for some devices in chrome
            highpassFilter: false,
        };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: recordConstraints });
        } catch (err) {
            if (err instanceof OverconstrainedError && err.constraint === 'sampleRate') {
                console.log('Cannot obtain a sampleRate of 44100Hz. Falling back to default value...');
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ...recordConstraints, sampleRate: undefined } }); // fallback to default sampleRate
            } else {
                throw err;
            }
        }

        // Dump recording settings
        const audioTracks = this.stream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('Record Setings:', audioTracks[0].getSettings());
        }
    }

    async startRecording() {
        this.audioContext = new AudioContext();
        const input = this.audioContext.createMediaStreamSource(this.stream!);
        this.recorder = new Recorder(input, { workerPath: getPublicPathFor(`runtime/recorder-worker.js`) });
        this.recorder.record();
    }

    async stopRecording() {
        this.recorder.stop();
        this.audioContext?.close();
        delete this.audioContext;
    }

    async closeStream() {
        this.stream?.getTracks().forEach((track) => track.stop());
        delete this.stream;
    }

    async exportRecorded() {
        const buffer = await new Promise<Blob>((resolve) => this.recorder.exportWAV(resolve));
        return new Uint8Array(await buffer.arrayBuffer());
    }

    async downloadRecorded(title: string) {
        const data = await this.exportRecorded();
        downloadBlob(new Blob([data]), `${title}.wav`);
    }
}
