import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';

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
    titles: TitleEntry[];
}

const initialState: SongRecognitionDialogFeature = {
    visible: false,
    titles: [],
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
    },
});

export const { actions, reducer } = slice;
export default enableBatching(reducer);
