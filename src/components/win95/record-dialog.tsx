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
    onCancel?: () => void;
}) => {
    if (!props.visible) {
        return null;
    }
    return (
        <DialogOverlay>
            <DialogWindow>
                <WindowHeader>
                    <span>Recording...</span>
                </WindowHeader>
                <DialogWindowContent>
                    <p style={{ marginBottom: 16, width: '100%' }}>{`Recording track ${props.trackDone + 1} of ${props.trackTotal}: ${
                        props.titleCurrent
                    }`}</p>
                    <Progress value={props.progressValue} hideValue={props.progressValue < 0} />
                    {props.onCancel ? (
                        <DialogFooter>
                            <Button onClick={props.onCancel}>Cancel after current step</Button>
                        </DialogFooter>
                    ) : null}
                </DialogWindowContent>
            </DialogWindow>
        </DialogOverlay>
    );
};
