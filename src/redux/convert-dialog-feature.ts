import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { HiMDCodecName } from 'himd-js';
import { enableBatching } from 'redux-batched-actions';
import type { ImportTitleFormat } from '../application/import-title';

export type TitleFormatType = ImportTitleFormat;
export type ForcedEncodingFormat = { codec: 'SPM' | 'SPS' | HiMDCodecName; bitrate: number } | null;

export interface ConvertDialogFeature {
    visible: boolean;
    titles: {
        title: string;
        fullWidthTitle: string;
        duration: number;
        forcedEncoding: ForcedEncodingFormat;
        bytesToSkip: number;
        artist?: string;
        album?: string;
    }[];
}

const initialState: ConvertDialogFeature = {
    visible: false,
    titles: [],
};

const slice = createSlice({
    name: 'convertDialog',
    initialState,
    reducers: {
        setVisible: (state, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
        setTitles: (
            state,
            action: PayloadAction<
                {
                    title: string;
                    fullWidthTitle: string;
                    duration: number;
                    forcedEncoding: ForcedEncodingFormat;
                    bytesToSkip: number;
                    artist?: string;
                    album?: string;
                }[]
            >
        ) => {
            state.titles = action.payload;
        },
    },
});

export const { actions, reducer } = slice;
export default enableBatching(reducer);
