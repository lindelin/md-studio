import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';
import { applicationSettings, type UserSettings } from '../application/settings-store';

export type RecognitionTitleFormatType = 'title' | 'album-title' | 'artist-title' | 'artist-album-title' | 'title-artist';
export type ImportMethod = 'exploits' | 'line-in';

export interface TitleEntry {
    originalTitle: string;
    originalFullWidthTitle: string;

    songTitle: string;
    songAlbum: string;
    songArtist: string;

    selectedToRecognize: boolean;
    alreadyRecognized: boolean;
    recognizeFail: boolean;

    index: number;

    newTitle: string;
    newFullWidthTitle: string;

    manualOverrideNewTitle: string;
    manualOverrideNewFullWidthTitle: string;

    unsanitizedTitle: string | null;
}

export interface SongRecognitionDialogFeature {
    visible: boolean;
    titleFormat: RecognitionTitleFormatType;
    titles: TitleEntry[];
    importMethod: ImportMethod;
}

const sharedSettings = applicationSettings.getSnapshot().values;
const initialState: SongRecognitionDialogFeature = {
    visible: false,
    titleFormat: sharedSettings.recognitionTrackTitleFormat,
    titles: [],
    importMethod: sharedSettings.recognitionImportMethod,
};

const slice = createSlice({
    name: 'songRecognitionDialog',
    initialState,
    reducers: {
        setVisible: (state, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
        setTitles: (state, action: PayloadAction<TitleEntry[]>) => {
            state.titles = action.payload;
        },
        setTitleFormat: (state, action: PayloadAction<RecognitionTitleFormatType>) => {
            state.titleFormat = action.payload;
        },
        setImportMethod: (state, action: PayloadAction<ImportMethod>) => {
            state.importMethod = action.payload;
        },
        applySharedSettings: (state, action: PayloadAction<UserSettings>) => {
            state.titleFormat = action.payload.recognitionTrackTitleFormat;
            state.importMethod = action.payload.recognitionImportMethod;
        },
    },
});

export const { actions, reducer } = slice;
export default enableBatching(reducer);
