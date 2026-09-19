import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';

export interface RecordingDialogState {
    visible: boolean;
    taskId: string | null;
}

const initialState: RecordingDialogState = {
    visible: false,
    taskId: null,
};

export const slice = createSlice({
    name: 'recordDialog',
    initialState,
    reducers: {
        setVisible: (state, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
        setTaskId: (state, action: PayloadAction<string | null>) => {
            state.taskId = action.payload;
        },
    },
});

export const { reducer, actions } = slice;
export default enableBatching(reducer);
