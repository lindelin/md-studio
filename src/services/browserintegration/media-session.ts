import { debounce, DisplayTrack, getSortedTracks, sleep, timeToSeekArgs } from '../../utils';
import { createEmptyWave } from '../../create-empty-wave';
import { Disc } from '../interfaces/netmd';
import type { ApplicationClient } from '../../application/application-client';
import type { PlaybackCommand } from '../../application/contracts';

export interface MediaSessionService {
    init(): Promise<void>;
}

export class BrowserMediaSessionService {
    private initialized = false;
    private audioEl?: HTMLAudioElement;

    constructor(private readonly application: Pick<ApplicationClient, 'execute' | 'getWorkspaceSnapshot' | 'subscribe'>) {}

    async init() {
        if (this.initialized || !navigator.mediaSession) {
            return;
        }
        this.initialized = true;

        // Audio el
        const audioEl = document.createElement('audio');
        audioEl.id = 'browser-media-session-helper';
        document.body.appendChild(audioEl);

        audioEl.setAttribute('loop', 'true');
        audioEl.src = URL.createObjectURL(createEmptyWave(6));
        audioEl.volume = 0;

        this.audioEl = audioEl;

        // Blocks media session events during initialization
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        navigator.mediaSession.metadata = null;

        audioEl.play();
        await sleep(5000); // CAVEAT: 5secs is the minimum playing time for media info to show up
        audioEl.pause();

        if (this.application.getWorkspaceSnapshot().device?.status.state === 'playing') {
            // restore current state
            audioEl.play();
        }

        console.log('MediaSession ready');

        // Set mediaSession event handlers
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            void this.control({ action: 'previous' });
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            void this.control({ action: 'next' });
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            audioEl.pause();
            void this.control({ action: 'pause' });
        });
        navigator.mediaSession.setActionHandler('play', () => {
            audioEl.play();
            void this.control({ action: 'play' });
        });

        const debouncedSeek = debounce((time: number, trackNumber: number) => {
            const [hour, minute, second, frame] = timeToSeekArgs(time);
            void this.control({ action: 'seek', index: trackNumber, hour, minute, second, frame });
            audioEl.currentTime = time;
        }, 100);

        navigator.mediaSession.setActionHandler('seekto', details => {
            const trackNumber = this.application.getWorkspaceSnapshot().device?.status.track ?? -1;
            if (trackNumber === -1 || details.seekTime === null || details.seekTime === undefined) {
                return; // can't seek without knowing the track number or the seek time
            }
            debouncedSeek(details.seekTime, trackNumber);
        });

        this.application.subscribe(() => {
            this.syncState();
        });
    }

    // This will save cpu cycles when just playing music. Might replace in the future with some memoization library
    private sortedTracks: DisplayTrack[] = [];
    private sortedTracksDisc: Disc | null = null;
    getSortedTracksWithCache(disc: Disc | null) {
        if (disc !== this.sortedTracksDisc) {
            this.sortedTracks = getSortedTracks(disc);
            this.sortedTracksDisc = disc;
        }
        return this.sortedTracks;
    }

    syncState() {
        if (!this.initialized) {
            return;
        }

        const audioEl = this.audioEl!;
        const device = this.application.getWorkspaceSnapshot().device;
        const deviceStatus = device?.status;
        const disc = device?.disc ?? null;

        const isPlaying = deviceStatus?.state === 'playing';
        const currentDiscTitle = disc?.title;
        const currentTrackIndex = deviceStatus?.track ?? -1;
        const allTracks = this.getSortedTracksWithCache(disc);
        const currentTrack: DisplayTrack | undefined = allTracks[currentTrackIndex];
        const currentTrackTitle = currentTrack ? currentTrack.fullWidthTitle || currentTrack?.title : '';
        const currentTrackDurationInSecs = Math.round(currentTrack?.duration ?? -1);

        const oldTrackTitle = navigator.mediaSession.metadata?.title;
        const oldDiscTitle = navigator.mediaSession.metadata?.album;

        // Sync MmediaSession
        if (isPlaying && navigator.mediaSession.playbackState !== 'playing') {
            navigator.mediaSession.playbackState = 'playing';
        } else if (!isPlaying && navigator.mediaSession.playbackState !== 'paused') {
            navigator.mediaSession.playbackState = 'paused';
        }

        // Sync MediaMetadata
        if (oldTrackTitle !== currentTrackTitle || oldDiscTitle !== currentDiscTitle) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrackTitle,
                album: currentDiscTitle,
                artwork: [
                    { src: window.location.pathname + 'MiniDisc192.png', sizes: '192x192', type: 'image/png' },
                    { src: window.location.pathname + 'MiniDisc512.png', sizes: '512x512', type: 'image/png' },
                ],
            });
        }

        // Sync audio duration.
        // CAVEAT: replacing the src may change the audioEl paused state.
        if (audioEl && audioEl.duration !== currentTrackDurationInSecs && isPlaying) {
            URL.revokeObjectURL(audioEl.src ?? '');
            audioEl.src = URL.createObjectURL(createEmptyWave(Math.max(currentTrackDurationInSecs, 1)));
        }

        // Sync <audio> state
        if (isPlaying && audioEl.paused) {
            audioEl.play();
        } else if (!isPlaying && !audioEl.paused) {
            audioEl.pause();
        }
    }

    private async control(command: PlaybackCommand) {
        try {
            const result = await this.application.execute({ type: 'playback.control', command });
            if (!result.ok) console.error(`MediaSession playback failed: ${result.error.message}`);
        } catch (error) {
            console.error('MediaSession playback failed:', error);
        }
    }
}
