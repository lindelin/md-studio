import { getCellsForTitle, getRemainingCharactersForTitles, MDTrack } from 'netmd-js';
import { Logger } from 'netmd-js/dist/logger';
import { concatUint8Arrays } from 'netmd-js/dist/utils';
import { asyncMutex } from '../../utils';
import { Capability, NetMDService, Group, Disc, Track, convertDiscToNJS, convertTrackToNJS, Codec, WireformatDict } from './netmd';
import { makeNetMDEncryptPacketIterator } from './netmd-encrypt-worker';

export class NetMDRemoteService extends NetMDService {
    private logger?: Logger;
    private server: string;
    private capabilities: Capability[] | null = null;
    private friendlyName: string;
    private useChunkedTransfersForLP: boolean;

    constructor({
        debug = false,
        serverAddress,
        friendlyName,
        useChunkedTransfersForLP = false,
    }: {
        debug: boolean;
        serverAddress: string;
        friendlyName: string;
        useChunkedTransfersForLP: boolean;
    }) {
        super();
        if (debug) {
            // Logging a few methods that have been causing issues with some units
            const _fn = (...args: any) => {
                if (args && args[0] && args[0].method) {
                    console.log(...args);
                }
            };
            this.logger = {
                debug: _fn,
                info: _fn,
                warn: _fn,
                error: _fn,
                child: () => this.logger!,
            };
        }
        this.server = serverAddress.endsWith('/') ? serverAddress.substring(0, serverAddress.length - 1) : serverAddress;
        this.friendlyName = friendlyName;
        this.useChunkedTransfersForLP = useChunkedTransfersForLP;
    }

    getRemainingCharactersForTitles(disc: Disc) {
        return getRemainingCharactersForTitles(convertDiscToNJS(disc));
    }

    getCharactersForTitle(track: Track) {
        const { halfWidth, fullWidth } = getCellsForTitle(convertTrackToNJS(track));
        return {
            halfWidth: halfWidth * 7,
            fullWidth: fullWidth * 7,
        };
    }

    isDeviceConnected() {
        return false;
    }

    private async fetchServerCapabilities() {
        const serverInfo = await this.getFromServer('');
        if (!serverInfo) throw new Error('Not ready.');
        if (serverInfo.version !== '1.0') {
            this.logger?.error({
                method: 'fetchServerCapabilities',
                info: `Server is on a different version than the service. (1.0 != ${serverInfo.version})`,
            });
            return;
        }
        this.capabilities = serverInfo.capabilities.map((n: any) => Capability[n]);
    }

    async getServiceCapabilities() {
        if (this.capabilities === null) {
            await this.fetchServerCapabilities();
        }
        return this.capabilities!;
    }

    async pair() {
        await this.fetchServerCapabilities();
        return true;
    }

    async connect() {
        return false;
    }

    private async getFromServer(path: string, parameters?: { [key: string]: any }, method: string = 'GET') {
        try {
            const url = new URL(`${this.server}/${path}`);
            let body = undefined;
            let headers = {};
            const definedParameters = Object.fromEntries(
                Object.entries(parameters ?? {}).filter(([, value]) => value !== undefined)
            );
            if (method === 'GET') {
                url.search = new URLSearchParams(definedParameters).toString();
            } else {
                body = JSON.stringify(definedParameters);
                headers = {
                    'Content-Type': 'application/json',
                };
            }
            const response = await fetch(url.toString(), { method, body, headers, signal: AbortSignal.timeout(30_000) });
            if (!response.ok) throw new Error(`Remote NetMD request ${path || '/'} failed with HTTP ${response.status}.`);
            const jsonData = await response.json();
            if (jsonData.ok) {
                return jsonData.value;
            } else {
                this.logger?.error({ method: path, jsonData });
                throw new Error(jsonData.error?.message ?? `Remote NetMD request ${path || '/'} was rejected.`);
            }
        } catch (ex) {
            this.logger?.error({ method: 'GENERIC', ex });
            throw ex;
        }
    }

    @asyncMutex
    async listContent(flushCache?: boolean) {
        if (!flushCache) flushCache = false;
        return await this.getFromServer('listContent', { flushCache });
    }

    @asyncMutex
    async getDeviceStatus() {
        return await this.getFromServer('deviceStatus');
    }

    @asyncMutex
    async getDeviceName() {
        return (await this.getFromServer('deviceName')) + (this.friendlyName && ` (${this.friendlyName})`);
    }

    @asyncMutex
    async finalize() {}

    @asyncMutex
    async rewriteGroups(groups: Group[]) {
        return await this.getFromServer('rewriteGroups', { groups }, 'POST');
    }

    @asyncMutex
    async renameTrack(index: number, title: string, fullWidthTitle?: string) {
        return await this.getFromServer('renameTrack', { index, title, fullWidthTitle });
    }

    @asyncMutex
    async renameGroup(groupIndex: number, title: string, fullWidthTitle?: string) {
        return await this.getFromServer('renameGroup', { groupIndex, title, fullWidthTitle });
    }

    @asyncMutex
    async addGroup(groupBegin: number, groupLength: number, title: string, fullWidthTitle: string = '') {
        return await this.getFromServer('addGroup', { groupBegin, groupLength, title, fullWidthTitle });
    }

    @asyncMutex
    async deleteGroup(index: number) {
        return await this.getFromServer('deleteGroup', { index });
    }

    @asyncMutex
    async renameDisc(title: string, fullWidthTitle?: string) {
        return await this.getFromServer('renameDisc', { title, fullWidthTitle });
    }

    @asyncMutex
    async deleteTracks(indexes: number[]) {
        return await this.getFromServer('deleteTracks', { indexes }, 'POST');
    }

    @asyncMutex
    async wipeDisc() {
        return await this.getFromServer('wipeDisc');
    }

    @asyncMutex
    async ejectDisc() {
        await this.getFromServer('eject');
    }

    @asyncMutex
    async wipeDiscTitleInfo() {
        window.alert('Not complete yet');
    }

    @asyncMutex
    async moveTrack(src: number, dst: number, updateGroups?: boolean) {
        void updateGroups;
        return await this.getFromServer('moveTrack', { src, dst });
    }

    async prepareUpload() {
        await this.getFromServer('prepareUpload');
    }
    async finalizeUpload() {
        await this.getFromServer('finalizeUpload');
    }

    @asyncMutex
    upload(
        title: string,
        fullWidthTitle: string,
        data: ArrayBuffer,
        _format: Codec,
        progressCallback: (progress: { written: number; encrypted: number; total: number }) => void,
        signal?: AbortSignal
    ) {
        return new Promise<void>((resolve, reject) => {
            const format = _format.codec === 'AT3' ? { codec: _format.bitrate === 66 ? 'LP4' : 'LP2' } : _format;
            const servURL = new URL(this.server);
            const wsURL = new URL(`${servURL.protocol === 'https:' ? 'wss:' : 'ws:'}//${servURL.host}/upload`);
            //Send file

            const total = data.byteLength;
            let encrypted = 0;
            let written = 0;

            const updateProgress = () =>
                progressCallback({
                    written,
                    total,
                    encrypted,
                });

            const w = new Worker(new URL('./netmd-encrypt-worker-runtime.ts', import.meta.url), { type: 'module' });

            const webWorkerAsyncPacketIterator = makeNetMDEncryptPacketIterator(
                w,
                ({ encryptedBytes }) => {
                    encrypted = encryptedBytes;
                    updateProgress();
                },
                undefined,
                signal
            );

            // A dud track used for the encryption
            const track = new MDTrack('', WireformatDict[format.codec], data, 0x400, '', webWorkerAsyncPacketIterator);
            const codec = format.codec.toString();
            wsURL.search = new URLSearchParams({
                title,
                fullWidthTitle,
                format: codec,
                totalLength: total.toString(),
                chunked: (this.useChunkedTransfersForLP && format.codec !== 'SP').toString(),
            }).toString();
            const ws = new WebSocket(wsURL.toString());
            let settled = false;
            let serverConfirmedCompletion = false;

            const succeed = () => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener('abort', abort);
                w.terminate();
                resolve();
            };

            const fail = (reason: unknown) => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener('abort', abort);
                w.terminate();
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            };

            const abort = () => {
                fail(signal?.reason ?? new DOMException('The upload was cancelled.', 'AbortError'));
                ws.close();
            };
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();

            ws.addEventListener('message', async (event) => {
                try {
                    const json = JSON.parse(event.data);
                    if (json.init) {
                        // Read and encrypt the file
                        // Send the results of the encryption iterator to the server
                        for await (const piece of track.getPacketWorkerIterator()) {
                            // Serialize the piece
                            const combined = concatUint8Arrays(new Uint8Array([0]), piece.iv, piece.key, piece.data);
                            ws.send(combined);
                        }
                        ws.send(new Uint8Array([1]));
                    } else if (json.terminate) {
                        serverConfirmedCompletion = true;
                        ws.close();
                        succeed();
                    } else {
                        written = json.written;
                        updateProgress();
                    }
                } catch (error) {
                    fail(error);
                    ws.close();
                }
            });

            ws.addEventListener('error', () => fail(new Error('The Remote NetMD upload connection failed.')));
            ws.addEventListener('close', () => {
                if (serverConfirmedCompletion) succeed();
                else fail(new Error('The Remote NetMD connection closed before the server confirmed the upload.'));
            });
        });
    }

    @asyncMutex
    async download(index: number, progressCallback: (progress: { read: number; total: number }) => void) {
        void index;
        void progressCallback;
        return null;
    }

    @asyncMutex
    async play() {
        return await this.getFromServer('play');
    }
    @asyncMutex
    async pause() {
        return await this.getFromServer('pause');
    }
    @asyncMutex
    async stop() {
        return await this.getFromServer('stop');
    }
    @asyncMutex
    async next() {
        return await this.getFromServer('next');
    }
    @asyncMutex
    async prev() {
        return await this.getFromServer('prev');
    }

    @asyncMutex
    async gotoTrack(index: number) {
        return await this.getFromServer('goto', { index });
    }

    @asyncMutex
    async gotoTime(index: number, h: number, m: number, s: number, f: number) {
        return await this.getFromServer('gotoTime', { index, hour: h, minute: m, second: s, frame: f });
    }

    @asyncMutex
    async getPosition() {
        return await this.getFromServer('getPosition');
    }

    async factory() {
        return null;
    }
}
