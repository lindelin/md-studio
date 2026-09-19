import React, { useCallback } from 'react';
import { useShallowEqualSelector } from "../../frontend-utils";

import { actions as factoryBadSectorDialogActions } from '../../redux/factory/factory-bad-sector-dialog-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useDispatch } from '../../frontend-utils';
import { BadSectorResponse, reportBadSectorReponse } from '../../redux/factory/factory-actions';
import { formatTimeFromSeconds } from '../../utils';

const Transition = React.forwardRef(function Transition(
    props: SlideProps,
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const FactoryModeBadSectorDialog = () => {
    const dispatch = useDispatch();

    const { visible, address, count, remember, rememberForRestOfSession, seconds } = useShallowEqualSelector(state => state.factoryBadSectorDialog);

    const handleReturnValue = useCallback(
        (data: BadSectorResponse) => {
            dispatch(reportBadSectorReponse(data, remember, rememberForRestOfSession));
        },
        [dispatch, remember, rememberForRestOfSession]
    );

    const handleRememberChoiceChange = useCallback(
        (e: any) => {
            dispatch(factoryBadSectorDialogActions.setRememberChoice(e.target.checked));
            if(!e.target.checked){
                dispatch(factoryBadSectorDialogActions.setRememberChoiceForRestOfSession(false));
            }
        },
        [dispatch]
    );

    const handleRememberChoiceRestOfSessionChange = useCallback(
        (e: any) => {
            dispatch(factoryBadSectorDialogActions.setRememberChoiceForRestOfSession(e.target.checked));
        },
        [dispatch]
    );

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="factory-bad-sector-dialog-slide-title"
            aria-describedby="factory-bad-sector-dialog-slide-description"
        >
            <DialogTitle id="factory-bad-sector-dialog-slide-title">Bad Sector Encountered!</DialogTitle>
            <DialogContent>
                <DialogContentText id="factory-bad-sector-dialog-slide-description">
                    A bad sector was encountered on address {address}
                </DialogContentText>
                <DialogContentText id="factory-bad-sector-dialog-slide-extended-description">
                    That address is the {count}. sector of this block, around {formatTimeFromSeconds(seconds, false)}
                </DialogContentText>
                <Box>
                    <FormControl>
                    <FormControlLabel
                            control={<Checkbox checked={remember} onChange={handleRememberChoiceChange} />}
                            label="Remember my choice"
                        />
                        <FormControlLabel
                            control={<Checkbox checked={rememberForRestOfSession} onChange={handleRememberChoiceRestOfSessionChange} />}
                            disabled={!remember}
                            label="Remember my choice for the rest of this session"
                        />
                    </FormControl>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => handleReturnValue('abort')}>Stop reading</Button>
                <Button onClick={() => handleReturnValue('reload')}>Reload current block</Button>
                <Button onClick={() => handleReturnValue('skip')}>Skip this sector</Button>
                <Button onClick={() => handleReturnValue('yieldanyway')}>Ignore</Button>
            </DialogActions>
        </Dialog>
    );
};
