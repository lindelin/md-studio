import React, { useCallback } from 'react';
import { makeStyles } from 'tss-react/mui';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';

import DragIndicator from '@mui/icons-material/DragIndicator';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import IconButton from '@mui/material/IconButton';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteIcon from '@mui/icons-material/Delete';

import { DraggableProvided } from 'react-beautiful-dnd';
import { Track, Group } from '../services/interfaces/netmd';
import { formatTimeFromSeconds, secondsToHumanReadable } from '../utils';

import { alpha, lighten } from '@mui/material';
import { useApplicationWorkspace } from './use-application-client';
import { getDefaultRecordingFormat } from '../application/device-profile';
import type { DeviceRecordingProfile } from '../application/contracts';

const useStyles = makeStyles<
    void,
    'indexCell' | 'titleCell' | 'playButtonInTrackList' | 'trackIndex' | 'deleteGroupButton' | 'groupFolderIcon'
>()((theme, _params, classes) => ({
    currentTrackRow: {
        color: theme.palette.primary.main,
        '& > td': {
            color: 'inherit',
        },
    },
    inGroupTrackRow: {
        [`& > .${classes.indexCell}`]: {
            transform: `translateX(${theme.spacing(3)})`,
        },
        [`& > .${classes.titleCell}`]: {
            transform: `translateX(${theme.spacing(3)})`,
        },
    },
    playButtonInTrackList: {
        display: 'none',
    },
    trackRow: {
        userSelect: 'none',
        '&:hover': {
            [`& .${classes.playButtonInTrackList}`]: {
                display: 'inline-flex',
            },
            [`& .${classes.trackIndex}`]: {
                display: 'none',
            },
        },
    },
    controlButtonInTrackCommon: {
        width: theme.spacing(2),
        height: theme.spacing(2),
        verticalAlign: 'middle',
        marginLeft: theme.spacing(-0.5),
    },
    formatBadge: {
        color: 'white',
        height: theme.spacing(2.5),
        zIndex: 1,
        flexWrap: 'wrap',
        fontSize: '0.75rem',
        minWidth: theme.spacing(2.5),
        boxSizing: 'border-box',
        alignItems: 'center',
        fontWeight: 500,
        alignContent: 'center',
        borderRadius: '10px',
        flexDirection: 'row',
        justifyContent: 'center',
        backgroundColor: theme.palette.primary.main,
        position: 'static',
        display: 'inline-flex',
        border: `2px solid ${theme.palette.background.paper}`,
        padding: '0 4px',
        verticalAlign: 'middle',
        width: theme.spacing(4.5),
        marginRight: theme.spacing(0.5),
        lineHeight: 'normal',
    },
    channelBadge: {
        position: 'static',
        display: 'inline-flex',
        padding: '0 4px',
        verticalAlign: 'middle',
        userSelect: 'none',
        marginRight: theme.spacing(0.5),
        color: theme.palette.text.secondary,
    },
    durationCell: {
        whiteSpace: 'nowrap',
    },
    durationCellSecondary: {
        whiteSpace: 'nowrap',
        color: theme.palette.text.secondary,
    },
    durationCellTime: {
        verticalAlign: 'middle',
    },
    titleCell: {
        overflow: 'hidden',
        maxWidth: '40ch',
        textOverflow: 'ellipsis',
        // whiteSpace: 'nowrap',
    },
    deleteGroupButton: {
        display: 'none',
    },
    indexCell: {
        whiteSpace: 'nowrap',
        paddingRight: 0,
        width: theme.spacing(4),
    },
    trackIndex: {
        display: 'inline-block',
        height: '16px',
        width: '16px',
    },
    dragHandle: {
        width: 20,
        padding: `${theme.spacing(0.5)} 0 0 0`,
    },
    dragHandleEmpty: {
        width: 20,
        padding: `${theme.spacing(0.5)} 0 0 0`,
    },
    groupFolderIcon: {},
    groupHeadRow: {
        userSelect: 'none',
        '&:hover': {
            [`& .${classes.deleteGroupButton}`]: {
                display: 'inline-flex',
            },
            [`& .${classes.groupFolderIcon}`]: {
                display: 'none',
            },
        },
    },
    rowClass: {
        '&.Mui-selected':
            theme.palette.mode === 'light'
                ? {
                      backgroundColor: lighten(theme.palette.secondary.main, 0.85),
                      '&:hover': {
                          backgroundColor: lighten(theme.palette.secondary.main, 0.85),
                      },
                  }
                : {
                      backgroundColor: alpha(theme.palette.secondary.main, 0.16),
                      '&:hover': {
                          backgroundColor: alpha(theme.palette.secondary.main, 0.16),
                      },
                  },
        '&:hover': {
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))',
        },
    },
    mockRow: {
        '& *': {
            margin: '0px !important',
            lineHeight: '0px',
            padding: '0px !important',
        },
        borderSpacing: '0px',
        visibility: 'collapse',
    },
}));

interface TrackRowProps {
    track: Track;
    inGroup: boolean;
    isSelected: boolean;
    trackStatus: 'playing' | 'paused' | 'none';
    isHimdTrack: boolean;
    draggableProvided: DraggableProvided;
    onSelect: (event: React.MouseEvent, trackIdx: number) => void;
    onRename: (event: React.MouseEvent, trackIdx: number) => void;
    onTogglePlayPause: (event: React.MouseEvent, trackIdx: number) => void;
    onOpenContextMenu: (event: React.MouseEvent) => void;
}

export function MockTrackRow({ isHimdTrack }: { isHimdTrack: boolean }) {
    const { classes } = useStyles();
    return (
        <TableRow hover color="inherit" className={classes.mockRow} style={{ maxHeight: '0px !important', height: '0px !important' }}>
            <TableCell className={classes.dragHandle} onClick={(event) => event.stopPropagation()}></TableCell>
            <TableCell className={classes.indexCell}></TableCell>
            <TableCell className={classes.titleCell} title={''}></TableCell>
            {isHimdTrack && (
                <>
                    <TableCell className={classes.titleCell} title={''}></TableCell>
                    <TableCell className={classes.titleCell} title={''}></TableCell>
                </>
            )}
            <TableCell align="right" className={classes.durationCell}></TableCell>
        </TableRow>
    );
}

export function TrackRow({
    track,
    inGroup,
    isSelected,
    draggableProvided,
    trackStatus,
    isHimdTrack,
    onSelect,
    onRename,
    onTogglePlayPause,
    onOpenContextMenu,
}: TrackRowProps) {
    const device = useApplicationWorkspace().device;
    const recordingProfile = device?.recording;
    const canEditMetadata = device?.capabilities.includes('metadata.edit') ?? false;
    const canControlPlayback = device?.capabilities.includes('playback.control') ?? false;
    const formatInfo = recordingProfile?.availableFormats.find(
        (e) => e.codec === track.encoding.codec && e.availableBitrates.includes(track.encoding.bitrate)
    );
    const { classes, cx } = useStyles();

    const handleRename = useCallback(
        (event: React.MouseEvent) => canEditMetadata && onRename(event, track.index),
        [canEditMetadata, onRename, track.index]
    );
    const handleSelect = useCallback((event: React.MouseEvent) => onSelect(event, track.index), [track.index, onSelect]);

    const handlePlayPause: React.MouseEventHandler = useCallback(
        (event) => {
            event.stopPropagation();
            onTogglePlayPause(event, track.index);
        },
        [track.index, onTogglePlayPause]
    );
    const handleDoubleClickOnPlayButton: React.MouseEventHandler = useCallback((event) => event.stopPropagation(), []);
    const isPlayingOrPaused = trackStatus === 'playing' || trackStatus === 'paused';

    return (
        <TableRow
            {...draggableProvided.draggableProps}
            ref={draggableProvided.innerRef}
            hover
            selected={isSelected}
            onDoubleClick={handleRename}
            onClick={handleSelect}
            onContextMenu={onOpenContextMenu}
            color="inherit"
            className={cx({
                [classes.rowClass]: true,
                [classes.trackRow]: canControlPlayback,
                [classes.inGroupTrackRow]: inGroup,
                [classes.currentTrackRow]: isPlayingOrPaused,
            })}
        >
            <TableCell
                className={classes.dragHandle}
                {...draggableProvided.dragHandleProps}
                aria-label={`Move track ${track.index + 1}: ${track.title || 'Untitled'}`}
                onClick={(event) => event.stopPropagation()}
            >
                <DragIndicator fontSize="small" color="disabled" />
            </TableCell>
            <TableCell className={classes.indexCell}>
                <span className={classes.trackIndex}>{track.index + 1}</span>
                <IconButton
                    aria-label={`${trackStatus === 'playing' ? 'Pause' : 'Play'} track ${track.index + 1}: ${track.title || 'Untitled'}`}
                    classes={{ root: cx(classes.controlButtonInTrackCommon, classes.playButtonInTrackList) }}
                    size="small"
                    onClick={handlePlayPause}
                    onDoubleClick={handleDoubleClickOnPlayButton}
                >
                    {trackStatus === 'paused' || trackStatus === 'none' ? (
                        <PlayArrowIcon fontSize="inherit" />
                    ) : (
                        <PauseIcon fontSize="inherit" />
                    )}
                </IconButton>
            </TableCell>
            <TableCell className={classes.titleCell} title={track.title ?? ''}>
                {track.fullWidthTitle ? `${track.fullWidthTitle} / ` : ``}
                {track.title || `No Title`}
            </TableCell>
            {isHimdTrack && (
                <>
                    <TableCell className={classes.titleCell} title={track.album ?? ''}>
                        {track.album || `No Album`}
                    </TableCell>
                    <TableCell className={classes.titleCell} title={track.artist ?? ''}>
                        {track.artist || `No Artist`}
                    </TableCell>
                </>
            )}
            <TableCell align="right" className={classes.durationCell}>
                {track.channel === 1 && <span className={classes.channelBadge}>MONO</span>}
                {!formatInfo || formatInfo.availableBitrates.length > 1 ? (
                    <Tooltip title={`${track.encoding.bitrate!} kbps`}>
                        <span className={classes.formatBadge}>{track.encoding.codec}</span>
                    </Tooltip>
                ) : (
                    <span className={classes.formatBadge}>
                        {formatInfo.displayBadgeFriendlyName ?? formatInfo.userFriendlyName ?? formatInfo.codec}
                    </span>
                )}
                <span className={classes.durationCellTime}>{formatTimeFromSeconds(track.duration)}</span>
            </TableCell>
        </TableRow>
    );
}

interface GroupRowProps {
    group: Group;
    usesHimdTracks?: boolean;
    onRename: (event: React.MouseEvent, groupIdx: number) => void;
    onDelete: (event: React.MouseEvent, groupIdx: number) => void;
    onSelect: (event: React.MouseEvent, groupIdx: number) => void;
    isSelected: boolean;
}

export function GroupRow({ group, usesHimdTracks, onRename, onDelete, onSelect, isSelected }: GroupRowProps) {
    const { classes, cx } = useStyles();
    const canEditMetadata = useApplicationWorkspace().device?.capabilities.includes('metadata.edit') ?? false;

    const handleDelete = useCallback(
        (event: React.MouseEvent) => canEditMetadata && onDelete(event, group.index),
        [canEditMetadata, onDelete, group.index]
    );
    const handleRename = useCallback(
        (event: React.MouseEvent) => canEditMetadata && onRename(event, group.index),
        [canEditMetadata, onRename, group.index]
    );
    const handleSelect = useCallback((event: React.MouseEvent) => onSelect(event, group.index), [onSelect, group]);
    return (
        <TableRow
            hover
            selected={isSelected}
            className={cx({ [classes.groupHeadRow]: canEditMetadata, [classes.rowClass]: true })}
            onDoubleClick={handleRename}
            onClick={handleSelect}
        >
            <TableCell className={classes.dragHandleEmpty}></TableCell>
            <TableCell className={classes.indexCell}>
                <FolderIcon className={cx(classes.controlButtonInTrackCommon, classes.groupFolderIcon)} fontSize="inherit" />
                <IconButton
                    aria-label={`Ungroup ${group.title || `group ${group.index + 1}`}`}
                    className={cx(classes.controlButtonInTrackCommon, classes.deleteGroupButton)}
                    size="small"
                    onClick={handleDelete}
                >
                    <DeleteIcon fontSize="inherit" />
                </IconButton>
            </TableCell>
            <TableCell className={classes.titleCell} title={group.title!}>
                {group.fullWidthTitle ? `${group.fullWidthTitle} / ` : ``}
                {group.title || `No Name`}
            </TableCell>
            {usesHimdTracks && (
                <>
                    <TableCell />
                    <TableCell />
                </>
            )}
            <TableCell align="right" className={classes.durationCellSecondary}>
                <span className={classes.durationCellTime}>
                    {formatTimeFromSeconds(group.tracks.map((n) => n.duration).reduce((a, b) => a + b))}
                </span>
            </TableCell>
        </TableRow>
    );
}

export function LeftInNondefaultCodecs(timeLeft: number, recordingProfile?: DeviceRecordingProfile) {
    if (!recordingProfile) {
        return <></>;
    }
    const defaultFormat = getDefaultRecordingFormat(recordingProfile);
    return (
        <React.Fragment>
            {recordingProfile.availableFormats.map((format, index) =>
                format.codec === defaultFormat?.codec || format.secondsPerDefaultUnit === undefined ? null : (
                    <React.Fragment key={`total-${format.codec}-${index}`}>
                        <span>{`${secondsToHumanReadable(
                            format.secondsPerDefaultUnit * timeLeft
                        )} in ${format.userFriendlyName ?? format.codec} Mode`}</span>
                        <br />
                    </React.Fragment>
                )
            )}
        </React.Fragment>
    );
}
