import type { DeviceSnapshot, TrackMetadataUpdate } from './contracts';
import type { MiniDiscApplication } from './minidisc-application';

export type ApplicationCommand =
    | { type: 'disc.refresh'; dropCache?: boolean }
    | { type: 'disc.rename'; title: string; fullWidthTitle?: string; expectedRevision?: number }
    | { type: 'track.renameMany'; updates: TrackMetadataUpdate[]; expectedRevision?: number }
    | { type: 'track.move'; sourceIndex: number; destinationIndex: number; expectedRevision?: number };

export interface CommandSuccess {
    ok: true;
    snapshot: DeviceSnapshot;
}

export interface CommandFailure {
    ok: false;
    error: { code: string; message: string; details?: Record<string, unknown> };
}

export type CommandResult = CommandSuccess | CommandFailure;

export class ApplicationCommandBus {
    constructor(private readonly application: MiniDiscApplication) {}

    async execute(command: ApplicationCommand): Promise<CommandResult> {
        try {
            let snapshot: DeviceSnapshot;
            switch (command.type) {
                case 'disc.refresh':
                    snapshot = await this.application.refresh(command.dropCache);
                    break;
                case 'disc.rename':
                    snapshot = await this.application.renameDisc(command.title, command.fullWidthTitle, command.expectedRevision);
                    break;
                case 'track.renameMany':
                    snapshot = await this.application.renameTracks(command.updates, command.expectedRevision);
                    break;
                case 'track.move':
                    snapshot = await this.application.moveTrack(command.sourceIndex, command.destinationIndex, command.expectedRevision);
                    break;
            }
            return { ok: true, snapshot };
        } catch (error) {
            const typed = error as Error & { code?: string; details?: Record<string, unknown> };
            return {
                ok: false,
                error: {
                    code: typed.code ?? 'UNEXPECTED_ERROR',
                    message: typed.message || String(error),
                    details: typed.details,
                },
            };
        }
    }
}
