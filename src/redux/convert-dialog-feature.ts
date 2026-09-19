import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { HiMDCodecName } from 'himd-js';
import { enableBatching } from 'redux-batched-actions';
import type { ImportTitleFormat } from '../application/import-title';

export type TitleFormatType = ImportTitleFormat;
export type ForcedEncodingFormat = { codec: 'SPM' | 'SPS' | HiMDCodecName; bitrate: number } | null;

export interface ConvertDialogFeature {
    visible: boolean;
}

const initialState: ConvertDialogFeature = {
    visible: false,
};

const slice = createSlice({
    name: 'convertDialog',
    initialState,
    reducers: {
        setVisible: (state, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
    },
});

export const { actions, reducer } = slice;
export default enableBatching(reducer);
