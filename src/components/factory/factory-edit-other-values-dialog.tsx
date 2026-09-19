import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallowEqualSelector, useDispatch, batchActions } from "../../frontend-utils";

import { makeStyles } from 'tss-react/mui';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { actions as factoryEditOtherValuesDialogActions } from '../../redux/factory/factory-edit-other-values-dialog-feature';
import { actions as factoryActions } from '../../redux/factory/factory-feature';
import { ToC } from 'netmd-tocmanip';
import { Tooltip, Typography } from '@mui/material';
import { getDeviceNameFromTOCSignature } from '../../utils';

const Transition = React.forwardRef(function Transition(
    props: SlideProps,
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const useStyles = makeStyles()(theme => ({
    marginUpDown: {
        marginTop: theme.spacing(1),
        marginBottom: theme.spacing(1),
    },
}));

function asByte(e: any, callback: (e: number) => void) {
    const asNumber = parseInt(e.target.value);
    if (asNumber >= 0 && asNumber < 256) callback(asNumber);
    if(isNaN(asNumber)) callback(0);
}

function asWord(e: any, callback: (e: number) => void) {
    const asNumber = parseInt(e.target.value);
    if (asNumber >= 0 && asNumber < 65536) callback(asNumber);
    if(isNaN(asNumber)) callback(0);
}

function ellipsisIfTooLong(str: string, maxLength: number){
    if(str.length > maxLength) {
        return str.substring(0, maxLength - 3) + "...";
    }
    return str;
}

const AnnotatedTextField = ({ label, className, value, onChange, annotation }: {
    label: string;
    className: string;
    value?: number,
    onChange: (e: any) => void,
    annotation?: string
}) => {
    const shortened = useMemo(() => annotation ? ellipsisIfTooLong(annotation, 40) : undefined, [annotation]);
    return <div style={{display: 'flex', alignItems: 'center'}}>
        <TextField
            label={label}
            className={className}
            fullWidth
            value={value}
            onChange={onChange}
            style={{flexGrow: 1}}
        />
        {shortened === annotation ? (
            <Typography style={{textWrap: 'nowrap'}}>{annotation}</Typography>
        ) : (
            <Tooltip title={annotation}>
                <Typography style={{textWrap: 'nowrap'}}>{shortened}</Typography>
            </Tooltip>
        )}
    </div>
}

export const FactoryModeEditOtherValuesDialog = () => {
    const dispatch = useDispatch();
    const { classes } = useStyles();

    const { visible } = useShallowEqualSelector(state => state.factoryEditOtherValuesDialog);
    const { toc: globalToc } = useShallowEqualSelector(state => state.factory);

    const [tocWorkingCopy, setTocWorkingCopy] = useState<ToC | undefined>(globalToc);

    // When the dialog becomes visible
    useEffect(() => {
        if (visible) {
            setTocWorkingCopy({ ...globalToc! });
        }
    }, [visible, setTocWorkingCopy, globalToc]);

    const handleClose = useCallback(() => {
        dispatch(factoryEditOtherValuesDialogActions.setVisible(false));
    }, [dispatch]);

    const handleUpdate = useCallback(() => {
        dispatch(batchActions([factoryActions.setToc(tocWorkingCopy!), factoryActions.setModified(true)]));
        handleClose();
    }, [dispatch, tocWorkingCopy, handleClose]);

    return (
        <Dialog
            open={visible}
            onClose={handleClose}
            maxWidth={'sm'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="factory-fragment-mode-dialog-title"
        >
            <DialogTitle id="factory-fragment-mode-dialog-title">Edit Other ToC Values</DialogTitle>
            <DialogContent>
                <TextField
                    label="Number of Tracks"
                    className={classes.marginUpDown}
                    fullWidth
                    value={tocWorkingCopy?.nTracks}
                    onChange={e => asByte(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, nTracks: e }))}
                />
                <AnnotatedTextField
                    label="The last ToC writer's signature"
                    className={classes.marginUpDown}
                    annotation={`Device Name: ${getDeviceNameFromTOCSignature(tocWorkingCopy?.deviceSignature ?? -1)}`}
                    value={tocWorkingCopy?.deviceSignature}
                    onChange={e => asWord(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, deviceSignature: e }))}
                    />
                <TextField
                    label="Disc nonempty flag"
                    className={classes.marginUpDown}
                    fullWidth
                    value={tocWorkingCopy?.discNonEmpty}
                    onChange={e => asByte(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, discNonEmpty: e }))}
                />
                <TextField
                    label="Next Free Track Slot"
                    className={classes.marginUpDown}
                    fullWidth
                    value={tocWorkingCopy?.nextFreeTrackSlot}
                    onChange={e => asByte(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, nextFreeTrackSlot: e }))}
                />
                <TextField
                    label="Next Free Title Slot"
                    className={classes.marginUpDown}
                    fullWidth
                    value={tocWorkingCopy?.nextFreeTitleSlot}
                    onChange={e => asByte(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, nextFreeTitleSlot: e }))}
                />
                <TextField
                    label="Next Free Timestamp Slot"
                    className={classes.marginUpDown}
                    fullWidth
                    value={tocWorkingCopy?.nextFreeTimestampSlot}
                    onChange={e => asByte(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, nextFreeTimestampSlot: e }))}
                />
                <TextField
                    label="Next Free Full Width Title Slot"
                    className={classes.marginUpDown}
                    fullWidth
                    value={tocWorkingCopy?.nextFreeFullWidthTitleSlot}
                    onChange={e => asByte(e, e => setTocWorkingCopy({ ...tocWorkingCopy!, nextFreeFullWidthTitleSlot: e }))}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button color={'primary'} onClick={handleUpdate}>
                    Update
                </Button>
            </DialogActions>
        </Dialog>
    );
};
