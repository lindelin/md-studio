import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';

export interface FactoryModeEditDialogState {
    address: string;
    seconds: number;
    count: number;
    visible: boolean;
    rememberForRestOfSession: boolean;
}

const initialState: FactoryModeEditDialogState = {
    address: '',
    count: 0,
    seconds: 0,
    visible: false,
    rememberForRestOfSession: false,
};

export const slice = createSlice({
    name: 'factoryBadSectorDialog',
    initialState,
    reducers: {
        setVisible: (state: FactoryModeEditDialogState, action: PayloadAction<boolean>) => {
            state.visible = action.payload;
        },
        setCount: (state: FactoryModeEditDialogState, action: PayloadAction<number>) => {
            state.count = action.payload;
        },
        setSeconds: (state: FactoryModeEditDialogState, action: PayloadAction<number>) => {
            state.seconds = action.payload;
        },
        setAddress: (state: FactoryModeEditDialogState, action: PayloadAction<string>) => {
            state.address = action.payload;
        },
        setRememberChoiceForRestOfSession: (state: FactoryModeEditDialogState, action: PayloadAction<boolean>) => {
            state.rememberForRestOfSession = action.payload;
        },
    },
});

export const { reducer, actions } = slice;
export default enableBatching(reducer);
