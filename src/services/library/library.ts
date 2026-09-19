import { ExportParams } from "../audio/audio-export";

export interface LocalTrackMetadata {
    artist: string;
    album: string;
    title: string;
    duration: number;
    trackIndex?: number;
}

export type LocalDatabase = { [filename: string]: LocalDatabase | LocalTrackMetadata };

// TODO: For now getSupport() is assumed to return 'perfect' all the time
// FIX THIS
export interface LibraryService {
    getDatabase(): Promise<LocalDatabase>;
    processLocalLibraryFile(filePath: string, params: ExportParams): Promise<ArrayBuffer>;
}
