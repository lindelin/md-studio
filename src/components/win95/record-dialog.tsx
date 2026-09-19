import React from 'react';
import { WindowHeader, Progress, Button } from 'react95';
import { DialogFooter, DialogOverlay, DialogWindow, DialogWindowContent } from './common';

export const W95RecordDialog = (props: {
    visible: boolean;
    trackTotal: number;
    trackDone: number;
    trackCurrent: number;
    titleCurrent: string;
    progressValue: number;
    dialogTitle: string;
    statusText: string;
    cancelled: boolean;
    onCancel?: () => void;
}) => {
    if (!props.visible) {
        return null;
    }
    return (
        <DialogOverlay>
            <DialogWindow>
                <WindowHeader>
                    <span>{props.dialogTitle}</span>
                </WindowHeader>
                <DialogWindowContent>
                    <p style={{ marginBottom: 16, width: '100%' }}>{props.statusText}</p>
                    <Progress value={props.progressValue} hideValue={props.progressValue < 0} />
                    {props.onCancel ? (
                        <DialogFooter>
                            <Button disabled={props.cancelled} onClick={props.onCancel}>
                                {props.cancelled ? 'Stopping after current step...' : 'Cancel after current step'}
                            </Button>
                        </DialogFooter>
                    ) : null}
                </DialogWindowContent>
            </DialogWindow>
        </DialogOverlay>
    );
};
