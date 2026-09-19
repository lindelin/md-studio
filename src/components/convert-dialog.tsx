import React, { SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from '../frontend-utils';
import {
    secondsToHumanReadable,
    acceptedTypes,
    AdaptiveFile,
    bytesToHumanReadable,
} from '../utils';
import { belowDesktop, useShallowEqualSelector, batchActions } from '../frontend-utils';

import { actions as convertDialogActions, ForcedEncodingFormat, TitleFormatType } from '../redux/convert-dialog-feature';
import { actions as renameDialogActions, RenameType } from '../redux/rename-dialog-feature';
import { actions as appActions } from '../redux/app-feature';
import { actions as errorDialogActions } from '../redux/error-dialog-feature';
import { openLocalLibrary } from '../redux/actions';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import { makeStyles } from 'tss-react/mui';
import FormControl from '@mui/material/FormControl';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import Input from '@mui/material/Input';
import MenuItem from '@mui/material/MenuItem';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import CloudDownload from '@mui/icons-material/CloudDownload';
import RemoveIcon from '@mui/icons-material/Remove';
import EditIcon from '@mui/icons-material/Edit';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import { lighten } from '@mui/material/styles';
import ListItemIcon from '@mui/material/ListItemIcon';
import Radio from '@mui/material/Radio';
import { useDropzone } from 'react-dropzone';
import Backdrop from '@mui/material/Backdrop';
import { W95ConvertDialog } from './win95/convert-dialog';
import {
    Capability,
    Codec,
} from '../services/interfaces/netmd';
import serviceRegistry from '../services/registry';
import { INTERACTIVE_HOMEBREW_AUTHORIZATION } from '../application/interactive-authorization';
import { getApplicationClient } from '../application/runtime';
import { useApplicationWorkspace } from './use-application-client';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { LeftInNondefaultCodecs } from './main-rows';
import { formatImportTitle } from '../application/import-title';
import { inspectImportFiles, type InspectedImportFile } from '../application/audio-import-inspector';
import type { ApplicationCommand } from '../application/command-bus';
import type { ImportQueueSnapshot } from '../application/import-queue';
import type { ImportPreview } from '../application/import-preview';
import {
    createDeviceRecordingProfile,
    getDefaultRecordingFormat,
    getRecordingCodec,
    sanitizeDeviceFullWidthTitle,
    sanitizeDeviceHalfWidthTitle,
} from '../application/device-profile';

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

function TooltipOrDefault(params: { children: any; title: any; arrow: boolean; tooltipEnabled: boolean }) {
    if (!params.tooltipEnabled) {
        return params.children;
    } else {
        return (
            <Tooltip title={params.title} arrow={params.arrow}>
                {params.children}
            </Tooltip>
        );
    }
}

// TODO jss-to-tss-react codemod: Unable to handle style definition reliably. Unsupported arrow function syntax.
//Unexpected value type of ConditionalExpression.
const useStyles = makeStyles()((theme) => ({
    container: {
        display: 'flex',
        flexDirection: 'row',
    },
    formControl: {
        minWidth: 60,
    },
    toggleButton: {
        minWidth: 40,
    },
    dialogContent: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'stretch',
    },
    himdDialog: {
        maxWidth: 800,
    },
    formatAndTitle: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    rightBlock: {
        display: 'flex',
        flexDirection: 'column',
    },
    titleFormControl: {
        minWidth: 170,
        marginTop: 4,
        [belowDesktop(theme)]: {
            width: 114,
            minWidth: 0,
        },
    },
    spacer: {
        display: 'flex',
        flex: '1 1 auto',
    },
    showTracksOrderBtn: {
        marginLeft: theme.spacing(1),
    },
    tracksOrderAccordion: {
        '&:before': {
            opacity: 0,
        },
    },
    tracksOrderAccordionDetail: {
        maxHeight: '40vh',
        overflow: 'auto',
    },
    toolbarHighlight:
        theme.palette.mode === 'light'
            ? {
                  color: theme.palette.secondary.main,
                  backgroundColor: lighten(theme.palette.secondary.light, 0.85),
              }
            : {
                  color: theme.palette.text.primary,
                  backgroundColor: theme.palette.secondary.dark,
              },
    trackList: {
        flex: '1 1 auto',
    },
    backdrop: {
        zIndex: theme.zIndex.drawer + 1,
        color: '#fff',
    },
    nameNotFit: {
        color: theme.palette.warning.main,
    },
    warningMediocreEncoder: {
        color: theme.palette.warning.main,
    },
    durationNotFit: {
        color: theme.palette.error.main,
    },
    invalidEncoder: {
        color: theme.palette.error.main,
    },
    timeTooltip: {
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '3px',
    },
    durationsSpan: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: theme.spacing(2),
    },
    advancedOptionsAccordion: {
        boxShadow: 'none',
        marginTop: theme.spacing(2),
        '&:before': {
            opacity: 0,
        },
    },
    advancedOptionsAccordionContents: {
        flexDirection: 'column',
    },
    advancedOptionsAccordionSummary: {
        boxShadow: 'none',
        minHeight: '32px !important',
        height: '32px',
        padding: 0,
    },
    advancedOption: {
        width: '100%',
    },
    fixedTable: {
        tableLayout: 'fixed',
    },
    selectCheckboxTableCell: {
        width: 20,
    },
    toggleButtonWarning: {
        color: `${theme.palette.warning.main} !important`,
    },
    forcedEncodingLabel: {
        color: theme.palette.warning.main,
    },
    iconButton: {
        marginRight: theme.spacing(1),
    },
}));

function createBrowserFileReference() {
    return `browser-file:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

async function executeImportQueueCommand(command: ApplicationCommand): Promise<ImportQueueSnapshot> {
    const result = await getApplicationClient().execute(command);
    if (!result.ok) throw new Error(result.error.message);
    if (!result.importQueue) throw new Error(`Command ${command.type} did not return the import queue.`);
    return result.importQueue;
}

function createForcedEncodingText(selectedCodec: Codec, file: { forcedEncoding: ForcedEncodingFormat }) {
    const remapTable: { [name: string]: string } = {
        SPS: 'Stereo SP - Homebrew!',
        SPM: 'Mono SP - Homebrew!',
        // MP3 is not a forced encoding for minidisc specs that do not support it natively.
        'AT3@66kbps': 'LP4',
        'AT3@105kbps': 'LP2',
        'AT3@132kbps': 'LP2',
    };
    if (!file.forcedEncoding) return '';
    const fullCodecName =
        file.forcedEncoding.codec + (file.forcedEncoding?.bitrate ? `@${Math.round(file.forcedEncoding.bitrate!)}kbps` : '');
    if (file.forcedEncoding.codec === 'MP3' && selectedCodec.codec !== 'MP3') {
        return '';
    }
    return remapTable[fullCodecName] ?? fullCodecName;
}

// `files` always appends to the list
export const ConvertDialog = (props: { files: (File | AdaptiveFile)[] }) => {
    const dispatch = useDispatch();
    const { classes, cx } = useStyles();

    const { visible, format, titleFormat, titles } = useShallowEqualSelector((state) => state.convertDialog);
    const { fullWidthSupport } = useShallowEqualSelector((state) => state.appState);
    const { disc, deviceCapabilities } = useShallowEqualSelector((state) => state.main);
    const minidiscSpec = serviceRegistry.netmdSpec!;
    const workspace = useApplicationWorkspace();
    const recordingProfile = useMemo(
        () => workspace.device?.recording ?? createDeviceRecordingProfile(minidiscSpec),
        [minidiscSpec, workspace.device?.recording]
    );
    const queueSnapshot = workspace.imports;
    const files = queueSnapshot.items;
    const [selectedTrackIndex, setSelectedTrack] = useState(-1);
    const [availableCharacters, setAvailableCharacters] = useState<{ halfWidth: number; fullWidth: number }>({
        fullWidth: 0,
        halfWidth: 0,
    });
    const [beforeConversionAvailableCharacters, setBeforeConversionAvailableCharacters] = useState<{
        halfWidth: number;
        fullWidth: number;
    }>({ fullWidth: 0, halfWidth: 0 });
    const [beforeConversionAvailableDurationUnits, setBeforeConversionAvailableDurationUnits] = useState(0);
    const [availableDurationUnits, setAvailableDurationUnits] = useState(0);
    const [availableSPSeconds, setAvailableSPSeconds] = useState(0);
    const [previewIssues, setPreviewIssues] = useState<ImportPreview['issues']>([]);
    const [previewPending, setPreviewPending] = useState(false);
    const [loadingMetadata, setLoadingMetadata] = useState(false);
    const reportApplicationError = useCallback(
        (error: unknown) => {
            dispatch(
                batchActions([
                    errorDialogActions.setVisible(true),
                    errorDialogActions.setErrorMessage(error instanceof Error ? error.message : String(error)),
                ])
            );
        },
        [dispatch]
    );

    useEffect(() => {
        dispatch(
            convertDialogActions.setTitles(
                files.map((file) => ({
                    title: file.title,
                    fullWidthTitle: file.fullWidthTitle ?? '',
                    duration: file.duration ?? 0,
                    forcedEncoding: (file.forcedEncoding as ForcedEncodingFormat) ?? null,
                    bytesToSkip: file.bytesToSkip ?? 0,
                    album: file.album,
                    artist: file.artist,
                }))
            )
        );
    }, [dispatch, files]);

    const fullWidthCharactersUsed = useMemo(() => {
        return (
            files
                .map(
                    (e) =>
                        (e.title + e.album + e.artist)
                            .split('')
                            .map((n) => n.charCodeAt(0))
                            .filter(
                                (n) =>
                                    (n >= 0x3040 && n <= 0x309f) || // Hiragana
                                    (n >= 0x4e00 && n <= 0x9faf) || // Kanji
                                    (n >= 0x3400 && n <= 0x4dbf) // Rare kanji
                            ).length
                )
                .filter((e) => e > 0).length > 0
        );
    }, [files]);

    const usesHimdTitles = useMemo(() => deviceCapabilities.includes(Capability.himdTitles), [deviceCapabilities]);
    const deviceSupportsFullWidth = useMemo(() => deviceCapabilities.includes(Capability.fullWidthSupport), [deviceCapabilities]);

    const currentlySelectedCodecIndex = useMemo(
        () => format[recordingProfile.specName] ?? recordingProfile.defaultFormat,
        [format, recordingProfile]
    );
    const currentlySelectedCodec = useMemo(
        () => getRecordingCodec(recordingProfile, currentlySelectedCodecIndex)!,
        [currentlySelectedCodecIndex, recordingProfile]
    );
    const currentlySelectedCodecFamily = useMemo(
        () => recordingProfile.availableFormats[currentlySelectedCodecIndex[0]],
        [currentlySelectedCodecIndex, recordingProfile]
    );
    const thisSpecDefaultCodecName = useMemo(() => {
        const defaultFormat = getDefaultRecordingFormat(recordingProfile);
        return defaultFormat?.userFriendlyName ?? defaultFormat?.codec ?? '';
    }, [recordingProfile]);
    const isUsingFrames = recordingProfile.measurementUnits === 'frames';
    const titleSanitizer = useMemo(
        () => ({
            sanitizeHalfWidthTitle: (title: string) => sanitizeDeviceHalfWidthTitle(recordingProfile, title),
            sanitizeFullWidthTitle: (title: string) => sanitizeDeviceFullWidthTitle(recordingProfile, title),
        }),
        [recordingProfile]
    );

    const loadMetadataFromFiles = useMemo(
        () =>
            async (files: (File | AdaptiveFile)[]): Promise<InspectedImportFile[]> => {
                setLoadingMetadata(true);
                const result = await inspectImportFiles(
                    files,
                    recordingProfile.availableFormats.map((format) => format.codec)
                );
                for (const failure of result.failures) window.alert(`Cannot transfer file ${failure.name}: ${failure.reason}`);
                return result.files;
            },
        [recordingProfile.availableFormats]
    );

    const resetDialog = useCallback(() => {
        setSelectedTrack(-1);
        setTracksOrderVisible(false);
        setAvailableCharacters({ halfWidth: 1785, fullWidth: 1785 });
        setAvailableDurationUnits(1);
        setBeforeConversionAvailableCharacters({ halfWidth: 1, fullWidth: 1 });
        setBeforeConversionAvailableDurationUnits(1);
        dispatch(
            convertDialogActions.updateFormatForSpec({
                spec: recordingProfile.specName,
                codec: [...recordingProfile.defaultFormat],
                unlessUnset: true,
            })
        );
    }, [dispatch, recordingProfile]);

    const refreshTitledFiles = useCallback(
        async (
            queuedFiles: typeof files,
            selectedFormat: TitleFormatType,
            allowFullWidth = fullWidthSupport,
            expectedRevision = getApplicationClient().getWorkspaceSnapshot().imports.revision
        ) => {
            if (queuedFiles.length === 0) return;
            await executeImportQueueCommand({
                type: 'import.updateMany',
                updates: queuedFiles.map((file) => {
                    return {
                        id: file.id,
                        changes: formatImportTitle(
                            file,
                            selectedFormat,
                            titleSanitizer,
                            allowFullWidth && deviceSupportsFullWidth
                        ),
                    };
                }),
                expectedRevision,
            });
        },
        [deviceSupportsFullWidth, fullWidthSupport, titleSanitizer]
    );

    const addInspectedFiles = useCallback(
        async (inspectedFiles: InspectedImportFile[]) => {
            if (inspectedFiles.length === 0) return;
            const selectedTitleFormat = usesHimdTitles ? 'title' : titleFormat;
            const client = getApplicationClient();
            const added = client.addLocalImports(
                inspectedFiles.map((inspected) => ({
                    source: {
                        kind: 'browser-file' as const,
                        name: inspected.file.name,
                        reference: createBrowserFileReference(),
                        size: inspected.file instanceof File ? inspected.file.size : undefined,
                        mimeType: inspected.file instanceof File ? inspected.file.type : undefined,
                    },
                    metadata: {
                        title: inspected.title,
                        sourceTitle: inspected.title,
                        fullWidthTitle: '',
                        artist: inspected.artist,
                        sourceArtist: inspected.artist,
                        album: inspected.album,
                        sourceAlbum: inspected.album,
                        duration: inspected.duration,
                        forcedEncoding: inspected.forcedEncoding,
                        bytesToSkip: inspected.bytesToSkip,
                    },
                    payload: inspected.file,
                }))
            );
            const addedIds = new Set(added.items.slice(-inspectedFiles.length).map((item) => item.id));
            await refreshTitledFiles(
                added.items.filter((item) => addedIds.has(item.id)),
                selectedTitleFormat,
                fullWidthSupport,
                added.revision
            );
        },
        [fullWidthSupport, refreshTitledFiles, titleFormat, usesHimdTitles]
    );

    useEffect(() => {
        const newFiles = Array.from(props.files);
        if (newFiles.length === 0) return;
        resetDialog();
        loadMetadataFromFiles(newFiles)
            .then(addInspectedFiles)
            .catch(reportApplicationError)
            .finally(() => setLoadingMetadata(false));
    }, [props.files, loadMetadataFromFiles, resetDialog, addInspectedFiles, reportApplicationError]);

    const renameTrackManually = useCallback(
        (index: number) => {
            const track = titles[index];
            dispatch(
                batchActions([
                    renameDialogActions.setVisible(true),
                    renameDialogActions.setCurrentName(track.title),
                    renameDialogActions.setCurrentFullWidthName(track.fullWidthTitle),
                    renameDialogActions.setIndex(index),
                    renameDialogActions.setRenameType(
                        usesHimdTitles ? RenameType.TRACK_CONVERT_DIALOG_HIMD : RenameType.TRACK_CONVERT_DIALOG
                    ),

                    renameDialogActions.setHimdAlbum(track.album ?? ''),
                    renameDialogActions.setHimdArtist(track.artist ?? ''),
                    renameDialogActions.setHimdTitle(track.title ?? ''),
                ])
            );
        },
        [titles, dispatch, usesHimdTitles]
    );

    // Track reordering
    const moveFile = useCallback(
        (offset: number) => {
            const targetIndex = selectedTrackIndex + offset;
            if (targetIndex >= files.length || targetIndex < 0) {
                return; // This should not be allowed by the UI
            }

            void executeImportQueueCommand({
                type: 'import.move',
                id: files[selectedTrackIndex].id,
                destinationIndex: targetIndex,
                expectedRevision: queueSnapshot.revision,
            })
                .then(() => setSelectedTrack(targetIndex))
                .catch(reportApplicationError);
        },
        [files, queueSnapshot.revision, reportApplicationError, selectedTrackIndex]
    );

    const moveFileUp = useCallback(() => {
        moveFile(-1);
    }, [moveFile]);

    const moveFileDown = useCallback(() => {
        moveFile(1);
    }, [moveFile]);

    const handleClose = useCallback(() => {
        const snapshot = getApplicationClient().getWorkspaceSnapshot().imports;
        if (snapshot.items.length > 0) {
            void executeImportQueueCommand({ type: 'import.clear', expectedRevision: snapshot.revision }).catch(
                reportApplicationError
            );
        }
        resetDialog();
        dispatch(convertDialogActions.setVisible(false));
    }, [dispatch, reportApplicationError, resetDialog]);

    const hideDialog = useCallback(() => {
        setSelectedTrack(-1);
        setTracksOrderVisible(false);
        dispatch(convertDialogActions.setVisible(false));
    }, [dispatch]);

    const handleChangeFormat = useCallback(
        (_ev: SyntheticEvent, newFormatIndex?: number) => {
            if (newFormatIndex === undefined) return;
            const defaultBitrateIndex = recordingProfile.availableFormats[newFormatIndex].availableBitrates.indexOf(
                recordingProfile.availableFormats[newFormatIndex].defaultBitrate
            );
            dispatch(
                convertDialogActions.updateFormatForSpec({
                    spec: recordingProfile.specName,
                    codec: [newFormatIndex, defaultBitrateIndex] as [number, number],
                })
            );
        },
        [dispatch, recordingProfile]
    );

    const handleChangeBitrate = useCallback(
        (ev: any) => {
            dispatch(
                convertDialogActions.updateFormatForSpec({
                    spec: recordingProfile.specName,
                    codec: [currentlySelectedCodecIndex[0], currentlySelectedCodecFamily.availableBitrates.indexOf(ev.target.value)],
                })
            );
        },
        [dispatch, currentlySelectedCodecIndex, recordingProfile.specName, currentlySelectedCodecFamily]
    );

    const handleChangeTitleFormat = useCallback(
        (event: any) => {
            const selectedFormat = event.target.value as TitleFormatType;
            dispatch(convertDialogActions.setTitleFormat(selectedFormat));
            void refreshTitledFiles(files, usesHimdTitles ? 'title' : selectedFormat).catch(reportApplicationError);
        },
        [dispatch, files, refreshTitledFiles, reportApplicationError, usesHimdTitles]
    );

    const [tracksOrderVisible, setTracksOrderVisible] = useState(false);
    const handleToggleTracksOrder = useCallback(() => {
        setTracksOrderVisible((tracksOrderVisible) => !tracksOrderVisible);
    }, [setTracksOrderVisible]);

    const [enableReplayGain, setEnableReplayGain] = useState(false);
    const [enableGapless, setEnableGapless] = useState(false);

    const handleToggleReplayGain = useCallback(() => {
        setEnableReplayGain((enableReplayGain) => !enableReplayGain);
    }, [setEnableReplayGain]);

    const handleToggleGapless = useCallback(() => {
        setEnableGapless((enableGapless) => !enableGapless);
    }, [setEnableGapless]);

    const handleToggleFullWidthSupport = useCallback(() => {
        const enabled = !fullWidthSupport;
        dispatch(appActions.setFullWidthSupport(enabled));
        void refreshTitledFiles(files, usesHimdTitles ? 'title' : titleFormat, enabled).catch(reportApplicationError);
    }, [dispatch, files, fullWidthSupport, refreshTitledFiles, reportApplicationError, titleFormat, usesHimdTitles]);

    useEffect(() => {
        const device = workspace.device;
        if (!disc || !device || files.length === 0) {
            setPreviewIssues([]);
            setPreviewPending(false);
            return;
        }
        let active = true;
        setPreviewPending(true);
        setPreviewIssues([]);
        void getApplicationClient()
            .execute({
                type: 'import.preview',
                ids: files.map((file) => file.id),
                format: currentlySelectedCodec,
                expectedImportRevision: queueSnapshot.revision,
                expectedDeviceRevision: device.revision,
            })
            .then((result) => {
                if (!active) return;
                setPreviewPending(false);
                if (!result.ok) {
                    if (result.error.code !== 'STALE_REVISION') reportApplicationError(new Error(result.error.message));
                    return;
                }
                const preview = result.importPreview;
                if (!preview) return;
                setAvailableCharacters({
                    halfWidth: preview.titles.halfWidthRemaining,
                    fullWidth: preview.titles.fullWidthRemaining,
                });
                setBeforeConversionAvailableCharacters({
                    halfWidth: preview.titles.halfWidthBefore,
                    fullWidth: preview.titles.fullWidthBefore,
                });
                setBeforeConversionAvailableDurationUnits(preview.capacity.availableBeforeInSelectedFormat);
                setAvailableDurationUnits(preview.capacity.remainingInSelectedFormat);
                setAvailableSPSeconds(preview.capacity.remaining);
                setPreviewIssues(preview.issues);
            });
        return () => {
            active = false;
        };
    }, [currentlySelectedCodec, disc, files, queueSnapshot.revision, reportApplicationError, workspace.device]);

    const handleRenameSelectedTrack = useCallback(() => {
        renameTrackManually(selectedTrackIndex);
    }, [selectedTrackIndex, renameTrackManually]);

    // scroll selected track into view
    const selectedTrackRef = useRef<any | null>(null);
    useEffect(() => {
        selectedTrackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedTrackRef, selectedTrackIndex]);

    const renderTracks = useCallback(() => {
        let current = beforeConversionAvailableDurationUnits;
        let { halfWidth: currentHalfWidthTextLeft, fullWidth: currentFullWidthTextLeft } = beforeConversionAvailableCharacters;
        const fileLengthPresentationFunction = isUsingFrames ? secondsToHumanReadable : bytesToHumanReadable;
        return titles.map((file, i) => {
            const isSelected = selectedTrackIndex === i;
            const ref = isSelected ? selectedTrackRef : null;
            let fileLength;
            if (isUsingFrames) {
                fileLength = file.duration;
            } else {
                fileLength = minidiscSpec.translateToDefaultMeasuringModeFrom(file.forcedEncoding ?? currentlySelectedCodec, file.duration);
            }
            current -= fileLength;
            const { halfWidth, fullWidth } = minidiscSpec.getCharactersForTitle({
                ...file,
                channel: 0,
                encoding: { codec: 'SPS', bitrate: 0 },
                index: 0,
                protected: null as any,
            });
            currentHalfWidthTextLeft -= halfWidth;
            currentFullWidthTextLeft -= fullWidth;
            return (
                <ListItem
                    key={`${i}`}
                    disableGutters={true}
                    onDoubleClick={() => renameTrackManually(i)}
                    onClick={() => setSelectedTrack(i)}
                    ref={ref}
                    button
                >
                    <ListItemIcon>
                        <Radio checked={isSelected} value={`track-${i}`} size="small" />
                    </ListItemIcon>
                    <ListItemText
                        className={
                            current <= 0
                                ? classes.durationNotFit
                                : currentHalfWidthTextLeft < 0 || currentFullWidthTextLeft < 0
                                  ? classes.nameNotFit
                                  : undefined
                        }
                        primary={`${file.fullWidthTitle && file.fullWidthTitle + ' / '}${file.title}`}
                        secondary={
                            <span>
                                {fileLengthPresentationFunction(fileLength)}
                                {file.forcedEncoding && (
                                    <Tooltip title="Forced format - this file will be uploaded as-is. Recording mode will be disregarded for it">
                                        <span className={classes.forcedEncodingLabel}>
                                            &nbsp;{createForcedEncodingText(currentlySelectedCodec, file)}
                                        </span>
                                    </Tooltip>
                                )}
                            </span>
                        }
                    />
                </ListItem>
            );
        });
    }, [
        titles,
        selectedTrackIndex,
        setSelectedTrack,
        selectedTrackRef,
        renameTrackManually,
        beforeConversionAvailableCharacters,
        beforeConversionAvailableDurationUnits,
        classes.durationNotFit,
        classes.nameNotFit,
        classes.forcedEncodingLabel,
        currentlySelectedCodec,
        minidiscSpec,
        isUsingFrames,
    ]);

    const renderHiMDTracks = useCallback(() => {
        let currentSeconds = beforeConversionAvailableDurationUnits;
        let { halfWidth: currentHalfWidthTextLeft, fullWidth: currentFullWidthTextLeft } = beforeConversionAvailableCharacters;
        return titles.map((file, i) => {
            const isSelected = selectedTrackIndex === i;
            const ref = isSelected ? selectedTrackRef : null;
            currentSeconds -= file.duration;
            const { halfWidth, fullWidth } = minidiscSpec.getCharactersForTitle(file as any);
            currentHalfWidthTextLeft -= halfWidth;
            currentFullWidthTextLeft -= fullWidth;
            return (
                <TableRow
                    key={`${i}`}
                    onDoubleClick={() => renameTrackManually(i)}
                    onClick={() => setSelectedTrack(i)}
                    ref={ref}
                    className={
                        currentSeconds <= 0
                            ? classes.durationNotFit
                            : currentHalfWidthTextLeft < 0 || currentFullWidthTextLeft < 0
                              ? classes.nameNotFit
                              : undefined
                    }
                >
                    <TableCell className={classes.selectCheckboxTableCell}>
                        <Radio checked={isSelected} value={`track-${i}`} size="small" />
                    </TableCell>
                    <TableCell>{file.title}</TableCell>
                    <TableCell>{file.album}</TableCell>
                    <TableCell>{file.artist}</TableCell>
                    <TableCell>
                        {secondsToHumanReadable(file.duration)}
                        {file.forcedEncoding && (
                            <Tooltip title="Forced format - this file will be uploaded as-is. Recording mode will be disregarded for it">
                                <span className={classes.forcedEncodingLabel}>
                                    &nbsp;{createForcedEncodingText(currentlySelectedCodec, file)}
                                </span>
                            </Tooltip>
                        )}
                    </TableCell>
                </TableRow>
            );
        });
    }, [
        titles,
        selectedTrackIndex,
        setSelectedTrack,
        selectedTrackRef,
        renameTrackManually,
        beforeConversionAvailableCharacters,
        beforeConversionAvailableDurationUnits,
        classes.durationNotFit,
        classes.nameNotFit,
        classes.selectCheckboxTableCell,
        classes.forcedEncodingLabel,
        minidiscSpec,
        currentlySelectedCodec,
    ]);

    // Add/Remove tracks
    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const bannedTypes = ['audio/mpegurl', 'audio/x-mpegurl'];
            const accepted = acceptedFiles.filter((n) => !bannedTypes.includes(n.type));
            if (accepted.length > 0) {
                loadMetadataFromFiles(accepted)
                    .then(addInspectedFiles)
                    .catch(reportApplicationError)
                    .finally(() => setLoadingMetadata(false));
            }
        },
        [addInspectedFiles, loadMetadataFromFiles, reportApplicationError]
    );
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: acceptedTypes,
        noClick: true,
    });
    const handleOpenLocalLibrary = useCallback(() => dispatch(openLocalLibrary()), [dispatch]);
    const disableRemove = selectedTrackIndex < 0 || selectedTrackIndex >= files.length;
    const handleRemoveSelectedTrack = useCallback(() => {
        const selected = files[selectedTrackIndex];
        if (!selected) return;
        void executeImportQueueCommand({
            type: 'import.remove',
            ids: [selected.id],
            expectedRevision: queueSnapshot.revision,
        })
            .then(() => {
                const remainingCount = files.length - 1;
                if (selectedTrackIndex >= remainingCount) {
                    setSelectedTrack(remainingCount - 1);
                }
                if (remainingCount === 0) handleClose();
            })
            .catch(reportApplicationError);
    }, [selectedTrackIndex, files, queueSnapshot.revision, handleClose, reportApplicationError]);

    const dialogVisible = useShallowEqualSelector((state) => state.convertDialog.visible);

    const handleConvert = useCallback(async () => {
        const initial = getApplicationClient().getWorkspaceSnapshot().imports;
        const mp3Updates = initial.items
            .filter((item) => item.forcedEncoding?.codec === 'MP3' && currentlySelectedCodec.codec !== 'MP3')
            .map((item) => ({ id: item.id, changes: { forcedEncoding: null } }));
        let prepared = initial;
        try {
            if (mp3Updates.length > 0) {
                prepared = await executeImportQueueCommand({
                    type: 'import.updateMany',
                    updates: mp3Updates,
                    expectedRevision: initial.revision,
                });
            }
        } catch (error) {
            reportApplicationError(error);
            return;
        }
        hideDialog();
        setEnableReplayGain(false);
        const result = await getApplicationClient().execute({
            type: 'import.write',
            format: currentlySelectedCodec,
            enableReplayGain,
            enableGapless,
            removeOnSuccess: true,
            expectedRevision: prepared.revision,
            interactiveHomebrewAuthorization: INTERACTIVE_HOMEBREW_AUTHORIZATION,
        });
        if (!result.ok) {
            dispatch(
                batchActions([
                    convertDialogActions.setVisible(true),
                    errorDialogActions.setVisible(true),
                    errorDialogActions.setErrorMessage(result.error.message),
                ])
            );
        }
    }, [currentlySelectedCodec, dispatch, enableGapless, enableReplayGain, hideDialog, reportApplicationError]);

    const encoderSupportState = useMemo(
        () => serviceRegistry.audioEncoderManager.getActiveService().getSupport(currentlySelectedCodec.codec),
        [currentlySelectedCodec]
    );
    useEffect(() => {
        if (!encoderSupportState.gapless) setEnableGapless(false);
    }, [setEnableGapless, encoderSupportState]);
    const isSelectedMediocre = encoderSupportState.state === 'mediocre';
    const isSelectedUnsupported = encoderSupportState.state === 'unsupported';
    const formatsSupport = recordingProfile.availableFormats.map((e) =>
        serviceRegistry.audioEncoderManager.getActiveService().getSupport(e.codec)
    );

    const { vintageMode, libraryService } = useShallowEqualSelector((state) => state.appState);

    if (vintageMode) {
        const p = {
            visible,
            codecFamilyIndex: currentlySelectedCodecIndex[0],
            titleFormat,
            minidiscSpec,

            titles,
            selectedTrackIndex,
            setSelectedTrack,

            availableCharacters,
            availableSeconds: availableDurationUnits,
            loadingMetadata,

            renameTrackManually,

            moveFileUp,
            moveFileDown,

            handleClose,
            handleChangeFormat,
            handleChangeTitleFormat,
            handleConvert,

            tracksOrderVisible,
            setTracksOrderVisible,
            handleToggleTracksOrder,
            selectedTrackRef,

            getRootProps,
            getInputProps,
            isDragActive,
            open,

            disableRemove,
            handleRemoveSelectedTrack,
            handleRenameSelectedTrack,
            dialogVisible,
        };
        return <W95ConvertDialog {...p} />;
    }

    return (
        <Dialog
            open={visible}
            maxWidth={'xs'}
            fullWidth={true}
            TransitionComponent={Transition as any}
            aria-labelledby="convert-dialog-slide-title"
            aria-describedby="convert-dialog-slide-description"
            classes={{ paper: cx({ [classes.himdDialog]: usesHimdTitles }) }}
        >
            <DialogTitle id="convert-dialog-slide-title">Upload Settings</DialogTitle>
            <DialogContent className={classes.dialogContent}>
                <div className={classes.formatAndTitle}>
                    <FormControl>
                        <Typography component="label" variant="caption" color="textSecondary">
                            Recording Mode
                        </Typography>
                        <ToggleButtonGroup value={currentlySelectedCodecIndex[0]} exclusive onChange={handleChangeFormat} size="small">
                            {recordingProfile.availableFormats.map((e, idx) => (
                                <ToggleButton
                                    disabled={formatsSupport[idx].state === 'unsupported'}
                                    classes={{
                                        root: cx(classes.toggleButton, {
                                            [classes.toggleButtonWarning]: formatsSupport[idx].state === 'mediocre',
                                        }),
                                    }}
                                    key={`k-uploadformat-${e.codec}`}
                                    value={idx}
                                >
                                    {e.userFriendlyName ?? e.codec}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </FormControl>

                    <div className={classes.rightBlock}>
                        {!usesHimdTitles && (
                            <FormControl className={classes.formControl}>
                                <Typography component="label" variant="caption" color="textSecondary">
                                    Track title
                                </Typography>
                                <FormControl className={classes.titleFormControl}>
                                    <Select value={titleFormat} color="secondary" input={<Input />} onChange={handleChangeTitleFormat}>
                                        <MenuItem value={`filename`}>Filename</MenuItem>
                                        <MenuItem value={`title`}>Title</MenuItem>
                                        <MenuItem value={`album-title`}>Album - Title</MenuItem>
                                        <MenuItem value={`artist-title`}>Artist - Title</MenuItem>
                                        <MenuItem value={`title-artist`}>Title - Artist</MenuItem>
                                        <MenuItem value={`artist-album-title`}>Artist - Album - Title</MenuItem>
                                    </Select>
                                </FormControl>
                            </FormControl>
                        )}
                        {(currentlySelectedCodecFamily?.availableBitrates.length ?? 0) > 1 && (
                            <FormControl className={classes.formControl}>
                                <Typography component="label" variant="caption" color="textSecondary">
                                    Bitrate
                                </Typography>
                                <FormControl className={classes.titleFormControl}>
                                    <Select
                                        value={currentlySelectedCodec.bitrate}
                                        color="secondary"
                                        input={<Input />}
                                        onChange={handleChangeBitrate}
                                    >
                                        {recordingProfile.availableFormats
                                            .find((e) => e.codec === currentlySelectedCodec.codec)!
                                            .availableBitrates!.map((e) => (
                                                <MenuItem value={e} key={`bitratesel-${e}`}>
                                                    {e} Kbps
                                                </MenuItem>
                                            ))}
                                    </Select>
                                </FormControl>
                            </FormControl>
                        )}
                    </div>
                </div>
                <div></div>
                <Typography
                    component="h3"
                    className={classes.nameNotFit}
                    hidden={availableCharacters.halfWidth > 0 && availableCharacters.fullWidth > 0}
                    style={{ marginTop: '1em' }}
                    align="center"
                >
                    Warning: You have used up all the available{' '}
                    {[availableCharacters.halfWidth > 0 ? 'half' : null, availableCharacters.fullWidth > 0 ? 'full' : null]
                        .filter((n) => n !== null)
                        .join(' and ')}{' '}
                    width characters. Some titles might get cut off.
                </Typography>
                <Typography
                    component="h3"
                    className={classes.durationNotFit}
                    hidden={availableDurationUnits >= 0}
                    style={{ marginTop: '1em' }}
                    align="center"
                >
                    Warning: You have used up all the available space on the disc.
                </Typography>
                <Typography
                    component="h3"
                    className={classes.durationNotFit}
                    hidden={previewIssues.length === 0}
                    style={{ marginTop: '1em' }}
                    align="center"
                >
                    {previewIssues[0]?.message}
                </Typography>
                <Typography
                    component="h3"
                    className={classes.warningMediocreEncoder}
                    hidden={!isSelectedMediocre}
                    style={{ marginTop: '1em' }}
                    align="center"
                >
                    Warning: You are using a mediocre encoder. The resulting audio is not going to be perfect. Alternative encoders are
                    available in the settings.
                </Typography>
                <Typography
                    component="h3"
                    className={classes.invalidEncoder}
                    hidden={!isSelectedUnsupported}
                    style={{ marginTop: '1em' }}
                    align="center"
                >
                    Error: The selected encoder backend does not support this codec! Please choose a different codec, or change the encoder
                    in settings!
                </Typography>
                <span className={classes.durationsSpan}>
                    <Typography component="h3" align="center" hidden={loadingMetadata}>
                        Total:{' '}
                        {isUsingFrames ? (
                            <TooltipOrDefault
                                tooltipEnabled={recordingProfile.availableFormats.length > 1}
                                title={LeftInNondefaultCodecs((disc?.left ?? 0) - availableSPSeconds, recordingProfile)}
                                arrow
                            >
                                <span className={cx({ [classes.timeTooltip]: recordingProfile.availableFormats.length > 1 })}>
                                    {secondsToHumanReadable((disc?.left ?? 0) - availableSPSeconds)} {thisSpecDefaultCodecName} time{' '}
                                </span>
                            </TooltipOrDefault>
                        ) : (
                            <span>{bytesToHumanReadable((disc?.left ?? 0) - availableDurationUnits)} </span>
                        )}
                    </Typography>
                    <Typography
                        component="h3"
                        align="center"
                        hidden={loadingMetadata}
                        className={cx({ [classes.durationNotFit]: availableSPSeconds <= 0 })}
                    >
                        Remaining:{' '}
                        {isUsingFrames ? (
                            <TooltipOrDefault
                                tooltipEnabled={recordingProfile.availableFormats.length > 1}
                                title={
                                    <React.Fragment>
                                        {recordingProfile.availableFormats.map((e, i) =>
                                            e.codec === getDefaultRecordingFormat(recordingProfile)?.codec ||
                                            e.secondsPerDefaultUnit === undefined ? null : (
                                                <React.Fragment key={`totalrem-${i}`}>
                                                    <span>{`${secondsToHumanReadable(
                                                        e.secondsPerDefaultUnit * availableSPSeconds
                                                    )} in ${e.userFriendlyName ?? `${e.codec}@${e.defaultBitrate}kbps`} Mode`}</span>
                                                    <br />
                                                </React.Fragment>
                                            )
                                        )}
                                    </React.Fragment>
                                }
                                arrow
                            >
                                <span className={cx({ [classes.timeTooltip]: recordingProfile.availableFormats.length > 1 })}>
                                    {secondsToHumanReadable(availableSPSeconds)} {thisSpecDefaultCodecName} time
                                </span>
                            </TooltipOrDefault>
                        ) : (
                            <span>{bytesToHumanReadable(availableDurationUnits)} </span>
                        )}
                    </Typography>
                </span>
                {!fullWidthSupport && deviceSupportsFullWidth && fullWidthCharactersUsed ? (
                    <Typography color="error" component="p">
                        You seem to be trying to enter full-width text into the half-width slot.{' '}
                        <Link onClick={handleToggleFullWidthSupport} color="error" underline="always" style={{ cursor: 'pointer' }}>
                            Enable full-width title support
                        </Link>
                        ?
                    </Typography>
                ) : null}

                <Typography component="h3" color="error" hidden={!loadingMetadata} style={{ marginTop: '1em' }} align="center">
                    Reading Metadata...
                </Typography>
                <Accordion expanded={tracksOrderVisible} className={classes.tracksOrderAccordion} square={true}>
                    <div></div>
                    <div {...getRootProps()} style={{ outline: 'none' }}>
                        <Toolbar variant="dense" className={classes.toolbarHighlight}>
                            {libraryService !== -1 && (
                                <IconButton
                                    className={classes.iconButton}
                                    edge="start"
                                    aria-label="add track from local library"
                                    onClick={handleOpenLocalLibrary}
                                >
                                    <CloudDownload />
                                </IconButton>
                            )}
                            <IconButton className={classes.iconButton} edge="start" aria-label="add track" onClick={open}>
                                <AddIcon />
                            </IconButton>
                            <IconButton
                                className={classes.iconButton}
                                edge="start"
                                aria-label="remove track"
                                onClick={handleRemoveSelectedTrack}
                                disabled={disableRemove}
                            >
                                <RemoveIcon />
                            </IconButton>
                            <IconButton
                                className={classes.iconButton}
                                edge="start"
                                aria-label="rename track"
                                onClick={handleRenameSelectedTrack}
                                disabled={disableRemove}
                            >
                                <EditIcon />
                            </IconButton>
                            <div className={classes.spacer}></div>
                            <IconButton edge="end" aria-label="move up" onClick={moveFileDown}>
                                <ExpandMoreIcon />
                            </IconButton>
                            <IconButton edge="end" aria-label="move down" onClick={moveFileUp}>
                                <ExpandLessIcon />
                            </IconButton>
                        </Toolbar>
                        {!usesHimdTitles ? (
                            <AccordionDetails className={classes.tracksOrderAccordionDetail}>
                                <List dense={true} disablePadding={false} className={classes.trackList}>
                                    {renderTracks()}
                                </List>
                            </AccordionDetails>
                        ) : (
                            <Table size="small" className={classes.fixedTable}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell className={classes.selectCheckboxTableCell}></TableCell>
                                        <TableCell>Title</TableCell>
                                        <TableCell>Album</TableCell>
                                        <TableCell>Artist</TableCell>
                                        <TableCell>Duration</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>{renderHiMDTracks()}</TableBody>
                            </Table>
                        )}
                        <Backdrop className={classes.backdrop} open={isDragActive}>
                            Drop your Music to add it to the queue
                        </Backdrop>
                        <input {...getInputProps()} />
                    </div>
                </Accordion>
                <Accordion className={classes.advancedOptionsAccordion} square={true}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} className={classes.advancedOptionsAccordionSummary}>
                        Advanced Options
                    </AccordionSummary>
                    <AccordionDetails className={classes.advancedOptionsAccordionContents}>
                        {deviceSupportsFullWidth && (
                            <FormControlLabel
                                label={`Enable full width titles support`}
                                className={classes.advancedOption}
                                control={<Checkbox checked={fullWidthSupport} onChange={handleToggleFullWidthSupport} />}
                            />
                        )}

                        <FormControlLabel
                            label={`Use ReplayGain`}
                            className={classes.advancedOption}
                            control={<Checkbox checked={enableReplayGain} onChange={handleToggleReplayGain} />}
                        />
                        <FormControlLabel
                            label={`Gapless`}
                            className={classes.advancedOption}
                            disabled={!encoderSupportState.gapless}
                            control={<Checkbox checked={enableGapless} onChange={handleToggleGapless} />}
                        />
                    </AccordionDetails>
                </Accordion>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleToggleTracksOrder} disabled={loadingMetadata} className={classes.showTracksOrderBtn}>
                    {`${tracksOrderVisible ? 'Hide' : 'Show'} Tracks`}
                </Button>
                <div className={classes.spacer}></div>
                <Button onClick={handleClose} disabled={loadingMetadata}>
                    Cancel
                </Button>
                <Button
                    onClick={handleConvert}
                    disabled={
                        loadingMetadata ||
                        previewPending ||
                        availableDurationUnits < 0 ||
                        previewIssues.length > 0 ||
                        isSelectedUnsupported
                    }
                >
                    Ok
                </Button>
            </DialogActions>
        </Dialog>
    );
};
