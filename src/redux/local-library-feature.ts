import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';

export interface LocalLibraryState {
    visible: boolean;
}

const initialState: LocalLibraryState = {
    visible: false,
};

const slice = createSlice({
    name: 'localLibraryState',
    initialState,
    reducers: {
        setVisible: (state, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
    },
});

export const { actions, reducer } = slice;
export default enableBatching(reducer);
