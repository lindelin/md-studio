import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { HiMDCodecName } from 'himd-js';
import { enableBatching } from 'redux-batched-actions';
import type { ImportTitleFormat } from '../application/import-title';
import { applicationSettings, type UserSettings } from '../application/settings-store';

export type TitleFormatType = ImportTitleFormat;
export type ForcedEncodingFormat = { codec: 'SPM' | 'SPS' | HiMDCodecName; bitrate: number } | null;

export interface ConvertDialogFeature {
    visible: boolean;
    format: { [mdSpecName: string]: [number, number] };
    titleFormat: TitleFormatType;
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

const sharedSettings = applicationSettings.getSnapshot().values;
const initialState: ConvertDialogFeature = {
    visible: false,
    format: sharedSettings.uploadFormat,
    titleFormat: sharedSettings.trackTitleFormat,
    titles: [],
};

const slice = createSlice({
    name: 'convertDialog',
    initialState,
    reducers: {
        setVisible: (state, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
        setFormat: (state, action: PayloadAction<ConvertDialogFeature['format']>) => {
            state.format = action.payload;
        },
        setTitleFormat: (state, action: PayloadAction<TitleFormatType>) => {
            state.titleFormat = action.payload;
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
        updateFormatForSpec: (state, action: PayloadAction<{ spec: string; codec: [number, number]; unlessUnset?: boolean }>) => {
            if (action.payload.unlessUnset && state.format[action.payload.spec] !== undefined) return;
            state.format = {
                ...state.format,
                [action.payload.spec]: action.payload.codec,
            };
        },
        applySharedSettings: (state, action: PayloadAction<UserSettings>) => {
            state.format = action.payload.uploadFormat;
            state.titleFormat = action.payload.trackTitleFormat;
        },
    },
});

export const { actions, reducer } = slice;
export default enableBatching(reducer);
