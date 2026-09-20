import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';
import { ExploitCapability } from '../../services/interfaces/capabilities';

export interface FactoryState {
    firmwareVersion: string;
    exploitCapabilities: ExploitCapability[];
    spUploadSpeedupActive: boolean;
    deviceDiscSwapDetectionDisabled: boolean;
}

const initialState: FactoryState = {
    firmwareVersion: '',
    exploitCapabilities: [],
    spUploadSpeedupActive: false,
    deviceDiscSwapDetectionDisabled: false,
};

export const slice = createSlice({
    name: 'factory',
    initialState,
    reducers: {
        setFirmwareVersion: (state, action: PayloadAction<string>) => {
            state.firmwareVersion = action.payload;
        },
        setExploitCapabilities: (state, action: PayloadAction<ExploitCapability[]>) => {
            state.exploitCapabilities = action.payload;
        },
        setSPUploadSpedUp: (state, action: PayloadAction<boolean>) => {
            state.spUploadSpeedupActive = action.payload;
        },
        setDiscSwapDetectionDisabled: (state, action: PayloadAction<boolean>) => {
            state.deviceDiscSwapDetectionDisabled = action.payload;
        }
    },
});

export const { reducer, actions } = slice;
export default enableBatching(reducer);
