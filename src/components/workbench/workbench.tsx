import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDispatch, useShallowEqualSelector } from '../../frontend-utils';
import {
    acceptedTypes,
    bytesToHumanReadable,
    DisplayTrack,
    formatTimeFromSeconds,
    getSortedTracks,
    isSequential,
} from '../../utils';
import { actions as appActions } from '../../redux/app-feature';
import { actions as dumpDialogActions } from '../../redux/dump-dialog-feature';
import { useApplicationClient, useApplicationWorkspace, useUpdateApplicationSettings } from '../use-application-client';
import { getDefaultRecordingFormat, getRecordingCodec } from '../../application/device-profile';
import type { ImportQueueItem } from '../../application/import-queue';
import type { ImportPreview } from '../../application/import-preview';
import { stageBrowserImports } from '../../application/browser-import-planner';
import { INTERACTIVE_HOMEBREW_AUTHORIZATION } from '../../application/interactive-authorization';
import {
    buildBatchMetadataUpdates,
    canRequestTaskCancellation,
    canStartRecording,
    findTaskNeedingAttention,
    getTaskErrorDetail,
    isActiveUninterruptibleWrite,
    resolveRowNavigationIndex,
    summarizeTaskResult,
    taskProgressPercent,
    updateOrderedSelection,
    type WorkbenchDraftField,
} from './workbench-model';

import AlbumIcon from '@mui/icons-material/Album';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EjectIcon from '@mui/icons-material/Eject';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UsbRoundedIcon from '@mui/icons-material/UsbRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded';
import FolderOffRoundedIcon from '@mui/icons-material/FolderOffRounded';
import SelectAllRoundedIcon from '@mui/icons-material/SelectAllRounded';

import { TopMenu } from '../topmenu';
import { DiscProtectedDialog } from '../disc-protected-dialog';
import { RenameDialog } from '../rename-dialog';
import { ErrorDialog } from '../error-dialog';
import { FactoryModeBadSectorDialog } from '../factory/factory-bad-sector-dialog';
import { DumpDialog } from '../dump-dialog';
import { SongRecognitionDialog } from '../song-recognition-dialog';
import { FactoryModeNoticeDialog } from '../factory/factory-notice-dialog';
import { AboutDialog } from '../about-dialog';
import { ChangelogDialog } from '../changelog-dialog';
import { PanicDialog } from '../panic-dialog';
import { WorkbenchLibrary } from './workbench-library';
import { WorkbenchSettings } from './workbench-settings';
import { WorkbenchTrackTransfer } from './workbench-track-transfer';
import { WorkbenchTools } from './workbench-tools';

import './workbench.css';

type NavigationSection = 'device' | 'library' | 'settings' | 'automation' | 'tools';
type ContentView = 'plan' | 'disc';
type PlanItem =
    | { kind: 'import'; key: string; index: number; item: ImportQueueItem }
    | { kind: 'track'; key: string; index: number; item: DisplayTrack };

function formatDuration(seconds?: number | null) {
    if (seconds === undefined || seconds === null) return '—';
    return formatTimeFromSeconds(seconds);
}

function formatPreviewCapacity(preview: ImportPreview, value: number) {
    return preview.measurementUnits === 'bytes' ? bytesToHumanReadable(value) : formatTimeFromSeconds(value);
}

function codecLabel(codec?: { codec: string; bitrate: number } | string | null) {
    if (!codec) return 'Auto';
    if (typeof codec === 'string') {
        if (codec === 'SPS') return 'SP Stereo';
        if (codec === 'SPM') return 'SP Mono';
        return codec;
    }
    if (codec.codec === 'SP') return 'SP Stereo';
    if (codec.codec === 'LP2') return 'LP2 Stereo';
    if (codec.codec === 'LP4') return 'LP4 Stereo';
    return `${codec.codec} ${codec.bitrate}`;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function taskStatusLabel(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTaskTimestamp(timestamp?: string) {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const Workbench = () => {
    const dispatch = useDispatch();
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const updateSettings = useUpdateApplicationSettings();
    const factoryModeRippingInMainUi = useShallowEqualSelector((state) => state.appState.factoryModeRippingInMainUi);
    const device = workspace.device;
    const disc = device?.disc ?? null;
    const imports = workspace.imports.items;
    const tracks = useMemo(() => getSortedTracks(disc), [disc]);
    const [section, setSection] = useState<NavigationSection>('device');
    const [contentView, setContentView] = useState<ContentView>(imports.length > 0 ? 'plan' : 'disc');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedTrackIndexes, setSelectedTrackIndexes] = useState<number[]>([]);
    const [lastSelectedTrackIndex, setLastSelectedTrackIndex] = useState<number | null>(null);
    const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
    const [lastSelectedImportIndex, setLastSelectedImportIndex] = useState<number | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [draft, setDraft] = useState({ title: '', album: '', artist: '', fullWidthTitle: '' });
    const [dirtyDraftFields, setDirtyDraftFields] = useState<WorkbenchDraftField[]>([]);
    const [groupDraft, setGroupDraft] = useState('');
    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [trackTransferOpen, setTrackTransferOpen] = useState(false);
    const [taskCenterOpen, setTaskCenterOpen] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [writeReviewOpen, setWriteReviewOpen] = useState(false);
    const [writePreview, setWritePreview] = useState<ImportPreview | null>(null);
    const [writePreviewPending, setWritePreviewPending] = useState(false);
    const [enableReplayGain, setEnableReplayGain] = useState(false);
    const [enableGapless, setEnableGapless] = useState(false);
    const [formatIndex, setFormatIndex] = useState<[number, number]>(device?.recording.defaultFormat ?? [0, 0]);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const previousImportCount = useRef(imports.length);
    const acknowledgedAttentionTaskIds = useRef(
        new Set(
            workspace.tasks
                .filter((task) => task.status === 'failed' || task.status === 'interrupted')
                .map((task) => task.id)
        )
    );

    const planItems: PlanItem[] = useMemo(
        () =>
            contentView === 'plan' && imports.length > 0
                ? imports.map((item, index) => ({ kind: 'import' as const, key: `import:${item.id}`, index, item }))
                : tracks.map((item, index) => ({ kind: 'track' as const, key: `track:${item.index}`, index, item })),
        [contentView, imports, tracks]
    );

    useEffect(() => {
        if (imports.length === 0) setContentView('disc');
        else if (previousImportCount.current === 0) setContentView('plan');
        previousImportCount.current = imports.length;
    }, [imports.length]);

    useEffect(() => {
        if (!selectedKey || !planItems.some((item) => item.key === selectedKey)) {
            setSelectedKey(planItems[0]?.key ?? null);
        }
    }, [planItems, selectedKey]);

    const selected = planItems.find((item) => item.key === selectedKey) ?? null;
    const selectedTitle = selected?.item.title ?? '';
    const selectedAlbum = selected?.item.album ?? '';
    const selectedArtist = selected?.item.artist ?? '';
    const selectedFullWidthTitle = selected?.item.fullWidthTitle ?? '';
    const hasSelectedItem = selected !== null;
    useEffect(() => {
        if (!hasSelectedItem) {
            setDraft({ title: '', album: '', artist: '', fullWidthTitle: '' });
            setDirtyDraftFields([]);
            return;
        }
        setDraft({
            title: selectedTitle,
            album: selectedAlbum,
            artist: selectedArtist,
            fullWidthTitle: selectedFullWidthTitle,
        });
        setDirtyDraftFields([]);
    }, [selectedKey, hasSelectedItem, selectedTitle, selectedAlbum, selectedArtist, selectedFullWidthTitle]);

    useEffect(() => {
        if (!device) return;
        setFormatIndex(workspace.settings.values.uploadFormat[device.recording.specName] ?? device.recording.defaultFormat);
    }, [device, workspace.settings.values.uploadFormat]);

    useEffect(() => {
        if (contentView === 'disc') {
            setSelectedImportIds([]);
            setLastSelectedImportIndex(null);
        } else {
            setSelectedTrackIndexes([]);
            setLastSelectedTrackIndex(null);
        }
    }, [contentView]);

    useEffect(() => {
        const availableIndexes = new Set(tracks.map((track) => track.index));
        setSelectedTrackIndexes((current) => current.filter((index) => availableIndexes.has(index)));
    }, [tracks]);

    useEffect(() => {
        const availableIds = new Set(imports.map((item) => item.id));
        setSelectedImportIds((current) => current.filter((id) => availableIds.has(id)));
    }, [imports]);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const accepted = acceptedFiles.filter((file) => !['audio/mpegurl', 'audio/x-mpegurl'].includes(file.type));
            if (accepted.length === 0) return;
            if (!device) return;
            setBusy(true);
            setMessage(null);
            void stageBrowserImports(client, accepted, {
                recordingProfile: device.recording,
                titleFormat: workspace.settings.values.trackTitleFormat,
                fullWidthTitles: workspace.settings.values.fullWidthSupport,
                supportsFullWidthTitles: device.capabilities.includes('metadata.fullWidth'),
                usesHimdTitles: device.capabilities.includes('metadata.himd'),
                expectedRevision: workspace.imports.revision,
            })
                .then((result) => {
                    const added = result.addedCount;
                    if (added > 0) setContentView('plan');
                    if (result.failures.length > 0) {
                        const first = result.failures[0];
                        setMessage(
                            `${added > 0 ? `${added} added. ` : ''}${result.failures.length} file${result.failures.length === 1 ? '' : 's'} skipped: ${first.name} — ${first.reason}`
                        );
                    } else {
                        setMessage(`${added} audio file${added === 1 ? '' : 's'} added to the recording plan.`);
                    }
                })
                .catch((error) => setMessage(errorMessage(error)))
                .finally(() => setBusy(false));
        },
        [client, device, workspace.imports.revision, workspace.settings.values]
    );
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: acceptedTypes,
        noClick: true,
        noKeyboard: true,
    });

    const run = useCallback(async (operation: () => Promise<void>) => {
        setBusy(true);
        setMessage(null);
        try {
            await operation();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }, []);

    const execute = useCallback(
        async (command: Parameters<typeof client.execute>[0]) => {
            const result = await client.execute(command);
            if (!result.ok) throw new Error(result.error.message);
            return result;
        },
        [client]
    );

    const selectedFormat = useMemo(
        () => (device ? getRecordingCodec(device.recording, formatIndex) : null),
        [device, formatIndex]
    );
    const selectedEncoderSupport = selectedFormat
        ? (workspace.encoder.support[selectedFormat.codec] ?? { state: 'unsupported' as const, gapless: false })
        : { state: 'unsupported' as const, gapless: false };
    const defaultFormat = device ? getDefaultRecordingFormat(device.recording) : null;
    const capabilities = device?.capabilities ?? [];
    const canUpload = capabilities.includes('track.upload');
    const canEject = capabilities.includes('disc.eject');
    const canPlayback = capabilities.includes('playback.control');
    const canDownload = capabilities.includes('track.download');
    const canMoveTrack = capabilities.includes('track.move');
    const canCreateGroup = capabilities.includes('group.create');
    const canDeleteGroup = capabilities.includes('group.delete');
    const canRenameGroup = capabilities.includes('group.rename');
    const measurementIsBytes = device?.recording.measurementUnits === 'bytes';
    const usedPercent = disc?.total ? Math.min(100, Math.max(0, (disc.used / disc.total) * 100)) : 0;
    const queuedDuration = imports.reduce((total, item) => total + (item.duration ?? 0), 0);
    const activeTask = workspace.tasks.find((task) => task.status === 'running' || task.status === 'queued') ?? null;
    const taskPercent = activeTask ? taskProgressPercent(activeTask) : 0;
    const recentTasks = useMemo(
        () => [...workspace.tasks].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 12),
        [workspace.tasks]
    );
    const selectedTask = recentTasks.find((task) => task.id === selectedTaskId) ?? recentTasks[0] ?? null;
    const selectedTaskResultLines = selectedTask ? summarizeTaskResult(selectedTask.result) : [];
    const selectedTaskErrorDetail = getTaskErrorDetail(selectedTask?.error);
    const activeTaskCount = workspace.tasks.filter((task) => task.status === 'running' || task.status === 'queued').length;

    useEffect(() => {
        if (!selectedEncoderSupport.gapless) setEnableGapless(false);
    }, [selectedEncoderSupport.gapless]);

    useEffect(() => {
        if (!writeReviewOpen || !device || !selectedFormat || imports.length === 0) {
            setWritePreview(null);
            setWritePreviewPending(false);
            return;
        }
        let active = true;
        setWritePreview(null);
        setWritePreviewPending(true);
        void client
            .execute({
                type: 'import.preview',
                ids: imports.map((item) => item.id),
                format: selectedFormat,
                expectedImportRevision: workspace.imports.revision,
                expectedDeviceRevision: device.revision,
            })
            .then((result) => {
                if (!active) return;
                setWritePreviewPending(false);
                if (!result.ok) {
                    setMessage(result.error.message);
                    return;
                }
                setWritePreview(result.importPreview ?? null);
            })
            .catch((error) => {
                if (!active) return;
                setWritePreviewPending(false);
                setMessage(errorMessage(error));
            });
        return () => {
            active = false;
        };
    }, [client, device, imports, selectedFormat, workspace.imports.revision, writeReviewOpen]);

    useEffect(() => {
        if (!taskCenterOpen || recentTasks.length === 0) return;
        if (!selectedTaskId || !recentTasks.some((task) => task.id === selectedTaskId)) {
            setSelectedTaskId(recentTasks[0].id);
        }
    }, [recentTasks, selectedTaskId, taskCenterOpen]);

    useEffect(() => {
        const attentionTask = findTaskNeedingAttention(recentTasks, acknowledgedAttentionTaskIds.current);
        for (const task of recentTasks) {
            if (task.status === 'failed' || task.status === 'interrupted') acknowledgedAttentionTaskIds.current.add(task.id);
        }
        if (!attentionTask) return;
        setSelectedTaskId(attentionTask.id);
        setTaskCenterOpen(true);
        setMessage(`${attentionTask.label} needs attention. Review the task details before retrying.`);
    }, [recentTasks]);

    useEffect(() => {
        if (!taskCenterOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setTaskCenterOpen(false);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [taskCenterOpen]);
    const sortedSelectedTrackIndexes = useMemo(
        () => [...selectedTrackIndexes].sort((left, right) => left - right),
        [selectedTrackIndexes]
    );
    const selectedTracks = useMemo(
        () => tracks.filter((track) => selectedTrackIndexes.includes(track.index)),
        [selectedTrackIndexes, tracks]
    );
    const selectedImportCount = selectedImportIds.length;
    const selectedTrackCount = selectedTrackIndexes.length;
    const activeSelectionCount = selected?.kind === 'import' ? selectedImportCount : selectedTrackCount;
    const supportsSharedMetadata = selected?.kind === 'import' || capabilities.includes('metadata.himd');
    const metadataApplyCount = supportsSharedMetadata ? Math.max(activeSelectionCount, 1) : 1;
    const selectedDiscTrack = selected?.kind === 'track' ? selected.item : null;
    const selectedGroup = useMemo(
        () =>
            selectedDiscTrack
                ? disc?.groups.find(
                      (group) => group.title !== null && group.tracks.some((track) => track.index === selectedDiscTrack.index)
                  ) ?? null
                : null,
        [disc, selectedDiscTrack]
    );
    const selectedNamedGroups = useMemo(() => {
        if (!disc) return [];
        return disc.groups.filter(
            (group) =>
                group.title !== null && group.tracks.some((track) => selectedTrackIndexes.includes(track.index))
        );
    }, [disc, selectedTrackIndexes]);
    const canGroupSelection =
        canCreateGroup &&
        sortedSelectedTrackIndexes.length > 0 &&
        isSequential(sortedSelectedTrackIndexes) &&
        sortedSelectedTrackIndexes.every((index) => tracks.find((track) => track.index === index)?.group === null);

    useEffect(() => {
        setGroupDraft(selectedGroup?.title ?? '');
    }, [selectedGroup?.index, selectedGroup?.title]);

    const updateDraftField = (field: WorkbenchDraftField, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setDirtyDraftFields((current) => (current.includes(field) ? current : [...current, field]));
    };

    const saveInspector = () => {
        if (!selected || !device || dirtyDraftFields.length === 0) return;
        void run(async () => {
            let appliedCount = 1;
            if (selected.kind === 'import') {
                const ids = selectedImportIds.length > 0
                    ? Array.from(new Set([selected.item.id, ...selectedImportIds]))
                    : [selected.item.id];
                const updates = buildBatchMetadataUpdates(ids, selected.item.id, dirtyDraftFields, draft).map(
                    ({ target, changes }) => ({ id: target, changes })
                );
                appliedCount = updates.length;
                await execute({
                    type: 'import.updateMany',
                    updates,
                    expectedRevision: workspace.imports.revision,
                });
            } else if (capabilities.includes('metadata.himd')) {
                const indexes = selectedTrackIndexes.length > 0
                    ? Array.from(new Set([selected.item.index, ...selectedTrackIndexes]))
                    : [selected.item.index];
                const updates = buildBatchMetadataUpdates(
                    indexes,
                    selected.item.index,
                    dirtyDraftFields.filter((field) => field !== 'fullWidthTitle'),
                    draft
                ).map(({ target, changes }) => ({ index: target, ...changes }));
                appliedCount = updates.length;
                await execute({
                    type: 'track.renameHimdMany',
                    updates,
                    expectedRevision: device.revision,
                });
            } else {
                await execute({
                    type: 'track.renameMany',
                    updates: [{ index: selected.item.index, title: draft.title, fullWidthTitle: draft.fullWidthTitle }],
                    expectedRevision: device.revision,
                });
            }
            setDirtyDraftFields([]);
            setMessage(appliedCount > 1 ? `Changes saved to ${appliedCount} items.` : 'Changes saved.');
        });
    };

    const removeSelected = () => {
        if (!selected) return;
        void run(async () => {
            if (selected.kind === 'import') {
                const ids = selectedImportIds.length > 0 ? selectedImportIds : [selected.item.id];
                await execute({ type: 'import.remove', ids, expectedRevision: workspace.imports.revision });
                setSelectedImportIds([]);
                setLastSelectedImportIndex(null);
                return;
            }
            const indexes = sortedSelectedTrackIndexes.length > 0 ? sortedSelectedTrackIndexes : [selected.item.index];
            const description = indexes.length === 1 ? `“${selected.item.title || `Track ${selected.item.index}`}”` : `${indexes.length} tracks`;
            if (!window.confirm(`Delete ${description} from this test disc?`)) return;
            await execute({
                type: 'track.deleteMany',
                indexes,
                confirmation: { confirmed: true, reason: 'User confirmed deletion in the workbench.' },
                expectedRevision: device?.revision,
            });
            setSelectedTrackIndexes([]);
            setLastSelectedTrackIndex(null);
        });
    };

    const moveImport = (id: string, destinationIndex: number) => {
        if (destinationIndex < 0 || destinationIndex >= imports.length) return;
        void run(async () => {
            await execute({ type: 'import.move', id, destinationIndex, expectedRevision: workspace.imports.revision });
            setSelectedKey(`import:${id}`);
            setSelectedImportIds([id]);
            setLastSelectedImportIndex(destinationIndex);
        });
    };

    const moveDiscTrack = (sourceIndex: number, destinationIndex: number) => {
        if (!device || destinationIndex < 0 || destinationIndex >= tracks.length || sourceIndex === destinationIndex) return;
        void run(async () => {
            await execute({ type: 'track.move', sourceIndex, destinationIndex, expectedRevision: device.revision });
            setSelectedKey(`track:${destinationIndex}`);
            setSelectedTrackIndexes([destinationIndex]);
            setLastSelectedTrackIndex(destinationIndex);
        });
    };

    const selectRow = (
        event: Pick<React.MouseEvent | React.KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
        row: PlanItem
    ) => {
        if (row.kind === 'import') {
            setSelectedTrackIndexes([]);
            setLastSelectedTrackIndex(null);
            const ids = imports.map((item) => item.id);
            const anchorId = lastSelectedImportIndex === null ? null : imports[lastSelectedImportIndex]?.id ?? null;
            const next = updateOrderedSelection(selectedImportIds, ids, row.item.id, anchorId, event);
            setSelectedImportIds(next.selection);
            setSelectedKey(`import:${next.primary}`);
            setLastSelectedImportIndex(row.index);
            return;
        }
        setSelectedImportIds([]);
        setLastSelectedImportIndex(null);
        const index = row.item.index;
        const indexes = tracks.map((track) => track.index);
        const next = updateOrderedSelection(selectedTrackIndexes, indexes, index, lastSelectedTrackIndex, event);
        setSelectedTrackIndexes(next.selection);
        setSelectedKey(`track:${next.primary}`);
        setLastSelectedTrackIndex(next.anchor);
    };

    const selectRowFromKeyboard = (event: React.KeyboardEvent<HTMLDivElement>, row: PlanItem) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectRow(event, row);
            return;
        }
        const nextIndex = resolveRowNavigationIndex(row.index, planItems.length, event.key);
        if (nextIndex === null) return;
        event.preventDefault();
        const next = planItems[nextIndex];
        if (!next) return;
        selectRow(event, next);
        const target = event.currentTarget.parentElement?.children.item(nextIndex) as HTMLElement | null;
        target?.focus();
    };

    const toggleSelectAllTracks = () => {
        if (selectedTrackIndexes.length === tracks.length) {
            setSelectedTrackIndexes([]);
            setLastSelectedTrackIndex(null);
            return;
        }
        const indexes = tracks.map((track) => track.index);
        setSelectedTrackIndexes(indexes);
        setLastSelectedTrackIndex(indexes.at(-1) ?? null);
        if (tracks[0]) setSelectedKey(`track:${tracks[0].index}`);
    };

    const toggleSelectAllImports = () => {
        if (selectedImportIds.length === imports.length) {
            setSelectedImportIds([]);
            setLastSelectedImportIndex(null);
            return;
        }
        const ids = imports.map((item) => item.id);
        setSelectedImportIds(ids);
        setLastSelectedImportIndex(imports.length - 1);
        if (ids[0]) setSelectedKey(`import:${ids[0]}`);
    };

    const createGroup = () => {
        if (!device || !canGroupSelection) return;
        void run(async () => {
            await execute({
                type: 'group.create',
                firstTrack: sortedSelectedTrackIndexes[0],
                trackCount: sortedSelectedTrackIndexes.length,
                title: groupDraft.trim(),
                expectedRevision: device.revision,
            });
            setGroupDialogOpen(false);
            setMessage('Group created.');
        });
    };

    const ungroupSelected = () => {
        if (!device || selectedNamedGroups.length === 0) return;
        void run(async () => {
            await execute({
                type: 'group.deleteMany',
                indexes: selectedNamedGroups.map((group) => group.index),
                expectedRevision: device.revision,
            });
            setMessage(selectedNamedGroups.length === 1 ? 'Group removed.' : 'Groups removed.');
        });
    };

    const renameSelectedGroup = () => {
        if (!device || !selectedGroup) return;
        void run(async () => {
            await execute({
                type: 'group.rename',
                update: { index: selectedGroup.index, title: groupDraft },
                expectedRevision: device.revision,
            });
            setMessage('Group name updated.');
        });
    };

    const changeRecordingFormat = (next: [number, number]) => {
        if (!device) return;
        setFormatIndex(next);
        void run(async () => {
            await updateSettings({
                uploadFormat: {
                    ...workspace.settings.values.uploadFormat,
                    [device.recording.specName]: next,
                },
            });
            setMessage('Recording mode updated for the current device type.');
        });
    };

    const openTrackTransfer = () => {
        if (selectedTrackIndexes.length === 0) return;
        if (factoryModeRippingInMainUi) {
            dispatch(dumpDialogActions.setVisible(true));
            return;
        }
        setTrackTransferOpen(true);
    };

    const cancelTask = (id: string) => {
        void run(async () => {
            const task = workspace.tasks.find((candidate) => candidate.id === id);
            await execute({ type: 'task.cancel', id });
            setMessage(
                task?.kind === 'disc.write'
                    ? 'Stop requested. The current track cannot be interrupted safely; the next track will not start. Keep USB connected while the recording light is flashing.'
                    : 'Cancellation requested. The current operation will stop at its next safe boundary.'
            );
        });
    };

    const refresh = () => void run(async () => void (await execute({ type: 'disc.refresh', dropCache: true })));
    const eject = () => void run(async () => void (await execute({ type: 'disc.eject', expectedRevision: device?.revision })));
    const togglePlayback = (track: DisplayTrack) =>
        void run(async () => {
            const playing = device?.status.track === track.index && device.status.state === 'playing';
            if (playing) {
                await execute({ type: 'playback.control', command: { action: 'pause' } });
                return;
            }
            if (device?.status.track !== track.index) {
                await execute({ type: 'playback.control', command: { action: 'gotoTrack', index: track.index } });
            }
            await execute({ type: 'playback.control', command: { action: 'play' } });
        });

    const openWriter = () => {
        if (imports.length === 0) {
            open();
            return;
        }
        setWriteReviewOpen(true);
    };

    const startWrite = () => {
        if (!writePreview || !selectedFormat) return;
        void run(async () => {
            const result = await execute({
                type: 'import.write',
                ids: writePreview.selectedIds,
                format: selectedFormat,
                enableReplayGain,
                enableGapless,
                removeOnSuccess: true,
                expectedRevision: writePreview.importRevision,
                expectedDeviceSessionId: writePreview.deviceSessionId,
                expectedDeviceRevision: writePreview.deviceRevision,
                interactiveHomebrewAuthorization: INTERACTIVE_HOMEBREW_AUTHORIZATION,
            });
            if (!result.task) throw new Error('The recording task did not start.');
            setWriteReviewOpen(false);
            setSelectedTaskId(result.task.id);
            setTaskCenterOpen(true);
            setMessage('Recording started. Keep the USB cable connected until the task finishes.');
        });
    };

    const writePreviewFits = canStartRecording(writePreview, selectedEncoderSupport.state);

    const discLabel = disc?.title || 'Untitled MiniDisc';
    const capacityUsed = disc
        ? measurementIsBytes
            ? bytesToHumanReadable(disc.used)
            : formatTimeFromSeconds(disc.used)
        : '—';
    const capacityTotal = disc
        ? measurementIsBytes
            ? bytesToHumanReadable(disc.total)
            : formatTimeFromSeconds(disc.total)
        : '—';

    return (
        <div className="workbench" {...getRootProps()}>
            <input {...getInputProps()} />
            <aside className="workbench__sidebar">
                <div className="workbench__brand">
                    <span className="workbench__brand-mark"><AlbumIcon /></span>
                    <span><strong>Studio Workbench</strong><small>MiniDisc Management</small></span>
                </div>

                <nav className="workbench__nav" aria-label="Workspace">
                    <button aria-label="Device" className={section === 'device' ? 'is-active' : ''} onClick={() => setSection('device')}>
                        <UsbRoundedIcon /><span>Device</span><i className={device ? 'is-online' : ''} />
                    </button>
                    <button aria-label="Library" className={section === 'library' ? 'is-active' : ''} onClick={() => setSection('library')}>
                        <LibraryMusicIcon /><span>Library</span>
                    </button>
                    <button aria-label="Import audio" onClick={open} disabled={!canUpload}><AddRoundedIcon /><span>Import Audio</span></button>
                    <button aria-label="Settings" className={section === 'settings' ? 'is-active' : ''} onClick={() => setSection('settings')}><SettingsRoundedIcon /><span>Settings</span></button>
                    <button aria-label="Tools" className={`workbench__mobile-only ${section === 'tools' ? 'is-active' : ''}`} onClick={() => setSection('tools')}><TuneRoundedIcon /><span>Tools</span></button>
                </nav>

                <div className="workbench__sidebar-label">WORKSPACE</div>
                <nav className="workbench__nav">
                    <button aria-label="Automation" className={section === 'automation' ? 'is-active' : ''} onClick={() => setSection('automation')}>
                        <AutoAwesomeIcon /><span>Automation</span><em>API</em>
                    </button>
                    <button aria-label="Tools" className={section === 'tools' ? 'is-active' : ''} onClick={() => setSection('tools')}><TuneRoundedIcon /><span>Tools</span></button>
                </nav>

                <nav className="workbench__nav workbench__support-nav">
                    <a href="https://www.minidisc.wiki/guides/start" target="_blank" rel="noreferrer"><HelpOutlineRoundedIcon /><span>Help &amp; Support</span></a>
                    <button aria-label="About" onClick={() => dispatch(appActions.showAboutDialog(true))}><InfoOutlinedIcon /><span>About</span></button>
                </nav>

                <div className="workbench__sidebar-footer">
                    <CloudDoneIcon /><span>Studio Workbench v0.1.0<small>Local first · Open source</small></span>
                </div>
            </aside>

            <main className="workbench__main">
                <header className="workbench__header">
                    <div>
                        <span className="workbench__eyebrow">CONNECTED DEVICE</span>
                        <h1>{device?.deviceName || 'MiniDisc Workspace'}</h1>
                        <small className="workbench__header-subtitle">{device ? `${device.recording.specName} Mode · ${workspace.connection.method === 'cached' ? 'USB' : workspace.connection.method || 'USB'}` : 'Connect a device to begin'}</small>
                    </div>
                    <div className="workbench__header-actions">
                        <span className={`workbench__status ${device ? 'is-online' : ''}`}><i />{device ? 'Connected' : 'Disconnected'}</span>
                        <button className="icon-button" aria-label="Refresh disc" onClick={refresh} disabled={!disc || busy}><RefreshRoundedIcon /></button>
                        <button className="workbench__eject-button" aria-label="Eject disc" onClick={eject} disabled={!disc || !canEject || busy}><EjectIcon /><span>Eject</span></button>
                        <TopMenu tracksSelected={selectedTrackIndexes} />
                    </div>
                </header>

                <section className="workbench__disc-overview">
                    <div className="workbench__disc-icon"><AlbumIcon /></div>
                    <div className="workbench__disc-copy">
                        <span className="workbench__eyebrow">CURRENT MINIDISC</span>
                        <h2>{discLabel}</h2>
                        <p>{disc ? `${disc.trackCount} tracks on disc · ${formatDuration(tracks.reduce((sum, track) => sum + track.duration, 0))}` : 'Insert a disc to begin'}</p>
                    </div>
                    <div className="workbench__capacity">
                        <div><span>USED</span><strong>{capacityUsed}</strong></div>
                        <div><span>CAPACITY</span><strong>{capacityTotal}</strong></div>
                        <div className="workbench__capacity-meter"><i style={{ width: `${usedPercent}%` }} /></div>
                        <small>{Math.round(usedPercent)}% used · {disc ? `${measurementIsBytes ? bytesToHumanReadable(disc.left) : formatTimeFromSeconds(disc.left)} available` : 'No media'}</small>
                    </div>
                    <dl className="workbench__device-facts">
                        <div><dt>Device</dt><dd>{device?.deviceName || '—'}</dd></div>
                        <div><dt>Connection</dt><dd>{workspace.connection.phase === 'connected' ? `USB (${workspace.connection.serviceName || 'MiniDisc'})` : '—'}</dd></div>
                        <div><dt>Mode</dt><dd>{defaultFormat?.userFriendlyName || defaultFormat?.codec || '—'}</dd></div>
                        <div><dt>Disc</dt><dd>{disc?.writable ? 'Writable' : disc ? 'Read only' : '—'}</dd></div>
                    </dl>
                </section>

                {section === 'automation' ? (
                    <section className="workbench__focus-panel">
                        <AutoAwesomeIcon />
                        <div><span className="workbench__eyebrow">AUTOMATION</span><h2>Application commands are ready</h2><p>The same workspace powers this interface, the local MCP bridge and the CLI. Local bridge access remains off until you enable it in Settings.</p></div>
                        <button className="secondary-button" onClick={() => setSection('settings')}>Open settings</button>
                    </section>
                ) : null}

                {section === 'library' ? (
                    <WorkbenchLibrary
                        onImported={(count) => {
                            setContentView('plan');
                            setSection('device');
                            setMessage(`${count} library track${count === 1 ? '' : 's'} added to the recording plan.`);
                        }}
                        onOpenSettings={() => setSection('settings')}
                    />
                ) : section === 'settings' ? (
                    <WorkbenchSettings onMessage={setMessage} />
                ) : section === 'tools' ? (
                    <WorkbenchTools
                        onMessage={setMessage}
                        onTaskStarted={(id, nextMessage) => {
                            setSelectedTaskId(id);
                            setTaskCenterOpen(true);
                            setMessage(nextMessage);
                        }}
                    />
                ) : <div className="workbench__workspace-grid">
                    <section className="workbench__plan">
                        <div className="workbench__section-heading">
                            <div>
                                <span className="workbench__eyebrow">{contentView === 'plan' && imports.length ? 'READY TO TRANSFER' : 'DISC CONTENTS'}</span>
                                <h2>{contentView === 'plan' && imports.length ? 'Recording Plan' : 'Tracks on MiniDisc'}</h2>
                                {imports.length > 0 ? (
                                    <div className="workbench__view-switch" role="tablist" aria-label="Workspace content">
                                        <button className={contentView === 'plan' ? 'is-active' : ''} onClick={() => setContentView('plan')} role="tab">Recording plan <span>{imports.length}</span></button>
                                        <button className={contentView === 'disc' ? 'is-active' : ''} onClick={() => setContentView('disc')} role="tab">On disc <span>{tracks.length}</span></button>
                                    </div>
                                ) : null}
                            </div>
                            <div className="workbench__plan-actions">
                                <span>{planItems.length} tracks · {formatDuration(contentView === 'plan' && imports.length ? queuedDuration : tracks.reduce((sum, track) => sum + track.duration, 0))}</span>
                                {contentView === 'disc' && tracks.length > 0 ? <button className="secondary-button workbench__compact-button" onClick={toggleSelectAllTracks}><SelectAllRoundedIcon /> {selectedTrackIndexes.length === tracks.length ? 'Clear' : 'Select all'}</button> : null}
                                {contentView === 'plan' && imports.length > 0 ? <button className="secondary-button workbench__compact-button" onClick={toggleSelectAllImports}><SelectAllRoundedIcon /> {selectedImportIds.length === imports.length ? 'Clear' : 'Select all'}</button> : null}
                                <button className="secondary-button" onClick={open} disabled={!canUpload}><AddRoundedIcon /> Add audio</button>
                                <button className="primary-button" onClick={openWriter} disabled={!canUpload || imports.length === 0 || !selectedFormat || busy}><AlbumIcon /> Write to MiniDisc</button>
                            </div>
                        </div>

                        {contentView === 'disc' && selectedTrackIndexes.length > 0 ? (
                            <div className="workbench__selection-bar">
                                <strong>{selectedTrackIndexes.length} selected</strong>
                                <span>Ctrl/⌘ click toggles · Shift click extends the selection</span>
                                <div>
                                    <button onClick={openTrackTransfer}><DownloadRoundedIcon /> {canDownload || factoryModeRippingInMainUi ? 'Export' : 'Record'}</button>
                                    <button onClick={() => { setGroupDraft(''); setGroupDialogOpen(true); }} disabled={!canGroupSelection}><CreateNewFolderRoundedIcon /> Group</button>
                                    <button onClick={ungroupSelected} disabled={!canDeleteGroup || selectedNamedGroups.length === 0}><FolderOffRoundedIcon /> Ungroup</button>
                                </div>
                            </div>
                        ) : null}

                        {contentView === 'plan' && selectedImportIds.length > 0 ? (
                            <div className="workbench__selection-bar">
                                <strong>{selectedImportIds.length} selected</strong>
                                <span>Shared Artist and Album edits apply to every selected item</span>
                                <div>
                                    <button onClick={removeSelected}><DeleteOutlineIcon /> Remove from plan</button>
                                </div>
                            </div>
                        ) : null}

                        <div className="workbench__table" role="table" aria-label={contentView === 'plan' && imports.length ? 'Recording plan' : 'Disc tracks'}>
                            <div className="workbench__table-head" role="row">
                                <span>#</span><span>Title</span><span>Artist</span><span>Mode</span><span>Duration</span><span />
                            </div>
                            <div className="workbench__table-body">
                                {planItems.length === 0 ? (
                                    <div className="workbench__empty"><QueueMusicIcon /><h3>{contentView === 'plan' ? 'Your recording plan is empty' : 'This MiniDisc is empty'}</h3><p>{contentView === 'plan' ? 'Import audio to prepare titles, order and recording modes before writing the disc.' : 'Add audio to begin building this disc.'}</p><button className="primary-button" onClick={open} disabled={!canUpload}><FolderOpenIcon /> Choose audio files</button></div>
                                ) : planItems.map((row) => {
                                    const isSelected =
                                        row.kind === 'track'
                                            ? selectedTrackIndexes.includes(row.item.index) ||
                                              (selectedTrackIndexes.length === 0 && row.key === selectedKey)
                                            : selectedImportIds.includes(row.item.id) ||
                                              (selectedImportIds.length === 0 && row.key === selectedKey);
                                    const playing = row.kind === 'track' && device?.status.track === row.item.index && device?.status.state === 'playing';
                                    const encoding = row.kind === 'import' ? row.item.forcedEncoding ?? selectedFormat : row.item.encoding;
                                    return (
                                        <div
                                            className={`workbench__table-row ${isSelected ? 'is-selected' : ''}`}
                                            key={row.key}
                                            role="row"
                                            aria-selected={isSelected}
                                            tabIndex={row.key === selectedKey ? 0 : -1}
                                            draggable={row.kind === 'import'}
                                            onDragStart={() => row.kind === 'import' && setDraggedId(row.item.id)}
                                            onDragOver={(event) => row.kind === 'import' && event.preventDefault()}
                                            onDrop={() => { if (row.kind === 'import' && draggedId && draggedId !== row.item.id) moveImport(draggedId, row.index); setDraggedId(null); }}
                                            onClick={(event) => selectRow(event, row)}
                                            onKeyDown={(event) => selectRowFromKeyboard(event, row)}
                                        >
                                            <span className="workbench__track-number"><DragIndicatorIcon />{String(row.index + 1).padStart(2, '0')}</span>
                                            <span className="workbench__track-title"><strong>{row.item.title || 'Untitled track'}</strong><small>{row.kind === 'import' ? row.item.name : row.item.group || row.item.fullWidthTitle || discLabel}</small></span>
                                            <span>{row.item.artist || '—'}</span>
                                            <span><i className="workbench__mode-pill">{codecLabel(encoding)}</i></span>
                                            <span>{formatDuration(row.item.duration)}</span>
                                            <span className="workbench__row-actions">
                                                {row.kind === 'track' && canPlayback ? <button aria-label={playing ? 'Pause track' : 'Play track'} onClick={(event) => { event.stopPropagation(); togglePlayback(row.item); }}>{playing ? <StopRoundedIcon /> : <PlayArrowRoundedIcon />}</button> : null}
                                                {row.kind === 'import' && selectedImportIds.length <= 1 ? <><button aria-label="Move track up" disabled={row.index === 0} onClick={(event) => { event.stopPropagation(); moveImport(row.item.id, row.index - 1); }}><KeyboardArrowUpRoundedIcon /></button><button aria-label="Move track down" disabled={row.index === imports.length - 1} onClick={(event) => { event.stopPropagation(); moveImport(row.item.id, row.index + 1); }}><KeyboardArrowDownRoundedIcon /></button></> : null}
                                                {row.kind === 'track' && canMoveTrack && selectedTrackIndexes.length <= 1 ? <><button aria-label="Move track up" disabled={row.item.index === 0} onClick={(event) => { event.stopPropagation(); moveDiscTrack(row.item.index, row.item.index - 1); }}><KeyboardArrowUpRoundedIcon /></button><button aria-label="Move track down" disabled={row.item.index === tracks.length - 1} onClick={(event) => { event.stopPropagation(); moveDiscTrack(row.item.index, row.item.index + 1); }}><KeyboardArrowDownRoundedIcon /></button></> : null}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <aside className="workbench__inspector">
                        <div className="workbench__inspector-heading"><div><span className="workbench__eyebrow">INSPECTOR</span><h2>{selected ? (activeSelectionCount > 1 ? `${activeSelectionCount} tracks selected` : `Track ${selected.index + 1}`) : 'No selection'}</h2></div><MoreHorizIcon /></div>
                        <label>Title<input value={draft.title} disabled={!selected} onChange={(event) => updateDraftField('title', event.target.value)} /></label>
                        <label>Artist<input value={draft.artist} disabled={!selected || !supportsSharedMetadata} onChange={(event) => updateDraftField('artist', event.target.value)} /></label>
                        <label>Album<input value={draft.album} disabled={!selected || !supportsSharedMetadata} onChange={(event) => updateDraftField('album', event.target.value)} /></label>
                        {device?.recording.titleStorage === 'netmd-toc' ? <label>Full-width title<input value={draft.fullWidthTitle} disabled={!selected} onChange={(event) => updateDraftField('fullWidthTitle', event.target.value)} /></label> : null}
                        {activeSelectionCount > 1 ? <p className="workbench__selection-note">{supportsSharedMetadata ? 'Title fields apply to the focused row. Artist and Album apply to all selected tracks.' : 'This device stores per-track titles. Metadata edits apply to the focused row.'}</p> : null}
                        <button className="secondary-button workbench__save" onClick={saveInspector} disabled={!selected || busy || dirtyDraftFields.length === 0}><CheckCircleIcon /> {metadataApplyCount > 1 ? `Apply to ${metadataApplyCount} tracks` : 'Apply metadata'}</button>
                        {selectedGroup ? (
                            <>
                                <div className="workbench__divider" />
                                <label>Group name<input value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} /></label>
                                <button className="secondary-button workbench__save" onClick={renameSelectedGroup} disabled={!canRenameGroup || busy || groupDraft === (selectedGroup.title ?? '')}><CheckCircleIcon /> Apply group name</button>
                            </>
                        ) : null}
                        <div className="workbench__divider" />
                        {contentView === 'plan' ? (
                            <label>Recording mode
                                <select
                                    value={`${formatIndex[0]}:${formatIndex[1]}`}
                                    disabled={!device}
                                    onChange={(event) => {
                                        const [format, bitrate] = event.target.value.split(':').map(Number);
                                        changeRecordingFormat([format, bitrate]);
                                    }}
                                >
                                    {device?.recording.availableFormats.flatMap((format, formatPosition) =>
                                        format.availableBitrates.map((bitrate, bitratePosition) => (
                                            <option value={`${formatPosition}:${bitratePosition}`} key={`${format.codec}:${bitrate}`}>{format.userFriendlyName || codecLabel({ codec: format.codec, bitrate })}</option>
                                        ))
                                    )}
                                </select>
                            </label>
                        ) : (
                            <label>Recorded mode<input value={codecLabel(selectedDiscTrack?.encoding)} disabled /></label>
                        )}
                        <div className="workbench__format-note"><BoltRoundedIcon /><span><strong>{selectedFormat?.codec || defaultFormat?.codec || 'Automatic'}</strong><small>{contentView === 'plan' ? (selectedFormat ? `${selectedFormat.bitrate} kbps for this device type` : 'Uses the device default') : 'Recorded mode is shown in the track list'}</small></span></div>
                        <div className="workbench__divider" />
                        <button className="danger-button" onClick={removeSelected} disabled={!selected || busy}><DeleteOutlineIcon /> {selected?.kind === 'track' ? (selectedTrackIndexes.length > 1 ? `Delete ${selectedTrackIndexes.length} tracks` : 'Delete from disc') : (selectedImportIds.length > 1 ? `Remove ${selectedImportIds.length} tracks` : 'Remove from plan')}</button>
                    </aside>
                </div>}

                {taskCenterOpen ? (
                    <aside
                        id="workbench-task-center"
                        className="workbench__task-center"
                        aria-label="Task center"
                    >
                        <header>
                            <div><span className="workbench__eyebrow">TASK CENTER</span><h2>Transfers and background work</h2></div>
                            <button aria-label="Close task center" onClick={() => setTaskCenterOpen(false)}>×</button>
                        </header>
                        {recentTasks.length === 0 ? (
                            <div className="workbench__task-empty"><CheckCircleIcon /><strong>No task history yet</strong><span>Writes, exports, recordings and recognition jobs will appear here.</span></div>
                        ) : (
                            <div className="workbench__task-center-body">
                                <nav aria-label="Recent tasks">
                                    {recentTasks.map((task) => {
                                        const percent = taskProgressPercent(task);
                                        return (
                                            <button
                                                className={task.id === selectedTask?.id ? 'is-active' : ''}
                                                key={task.id}
                                                onClick={() => setSelectedTaskId(task.id)}
                                            >
                                                <span className={`workbench__task-dot is-${task.status}`} />
                                                <span><strong>{task.label}</strong><small>{task.kind} · {formatTaskTimestamp(task.finishedAt ?? task.startedAt ?? task.createdAt)}</small></span>
                                                <em>{task.status === 'running' || task.status === 'queued' ? `${percent}%` : taskStatusLabel(task.status)}</em>
                                            </button>
                                        );
                                    })}
                                </nav>
                                {selectedTask ? (
                                    <section className="workbench__task-detail">
                                        <div className="workbench__task-detail-title">
                                            <div><span className="workbench__eyebrow">{selectedTask.kind}</span><h3>{selectedTask.label}</h3></div>
                                            <span className={`workbench__task-badge is-${selectedTask.status}`}>{taskStatusLabel(selectedTask.status)}</span>
                                        </div>
                                        <div className="workbench__task-detail-meter"><i style={{ width: `${taskProgressPercent(selectedTask)}%` }} /></div>
                                        <dl>
                                            <div><dt>Phase</dt><dd>{selectedTask.phase}</dd></div>
                                            <div><dt>Progress</dt><dd>{selectedTask.progress.completed} / {selectedTask.progress.total} {selectedTask.progress.unit}</dd></div>
                                            <div><dt>Current item</dt><dd>{selectedTask.progress.currentLabel || '—'}</dd></div>
                                        </dl>
                                        {selectedTaskResultLines.length > 0 ? (
                                            <div className="workbench__task-result">
                                                {selectedTaskResultLines.map((line) => <span key={line}>{line}</span>)}
                                            </div>
                                        ) : null}
                                        {selectedTask.error ? (
                                            <div className="workbench__task-error">
                                                <strong>{selectedTask.error.message}</strong>
                                                {selectedTaskErrorDetail ? <span>{selectedTaskErrorDetail}</span> : null}
                                                {selectedTask.error.completedItems !== undefined || selectedTask.error.pendingItems !== undefined ? <span>{selectedTask.error.completedItems ?? 0} completed · {selectedTask.error.pendingItems ?? 0} pending</span> : null}
                                                {selectedTask.error.recoveryAction ? <p>{selectedTask.error.recoveryAction}</p> : null}
                                            </div>
                                        ) : null}
                                        {isActiveUninterruptibleWrite(selectedTask) ? (
                                            <div className="workbench__task-safety-note">
                                                <strong>The current track cannot be interrupted safely.</strong>
                                                <span>Keep USB connected while the recording light is flashing. A stop request can only prevent another track from starting.</span>
                                            </div>
                                        ) : null}
                                        {canRequestTaskCancellation(selectedTask) ? (
                                            <button className="danger-button" disabled={selectedTask.cancellationRequested || busy} onClick={() => cancelTask(selectedTask.id)}><StopRoundedIcon /> {selectedTask.cancellationRequested ? (selectedTask.kind === 'disc.write' ? 'Next track will not start' : 'Cancellation requested') : (selectedTask.kind === 'disc.write' ? 'Stop before next track' : 'Cancel task')}</button>
                                        ) : null}
                                    </section>
                                ) : null}
                            </div>
                        )}
                    </aside>
                ) : null}

                <footer className="workbench__footer">
                    <button className="workbench__task-status" onClick={() => setTaskCenterOpen((open) => !open)} aria-expanded={taskCenterOpen} aria-controls="workbench-task-center">
                        {activeTask ? <><span className="workbench__task-spinner" /><div><strong>{activeTask.label}</strong><small>{activeTask.phase} · {Math.round(taskPercent)}%</small></div></> : <><CheckCircleIcon /><div><strong>Ready</strong><small>{imports.length ? `${imports.length} tracks prepared` : 'No pending transfer'}</small></div></>}
                        <em>{activeTaskCount > 0 ? activeTaskCount : workspace.tasks.length} {activeTaskCount > 0 ? 'active' : 'tasks'}</em>
                    </button>
                    <div className="workbench__footer-meter"><span><i style={{ width: `${activeTask ? taskPercent : usedPercent}%` }} /></span><small>{activeTask ? `${Math.round(taskPercent)}% complete` : `${capacityUsed} of ${capacityTotal} used`}</small></div>
                </footer>
            </main>

            {isDragActive ? <div className="workbench__drop-overlay"><FolderOpenIcon /><strong>Drop audio to add it to the recording plan</strong></div> : null}
            {message ? <button className="workbench__toast" onClick={() => setMessage(null)}>{message}</button> : null}

            <DiscProtectedDialog />
            <RenameDialog />
            <ErrorDialog />
            <FactoryModeBadSectorDialog />
            {factoryModeRippingInMainUi ? <DumpDialog trackIndexes={selectedTrackIndexes} isCapableOfDownload isExploitDownload /> : null}
            <SongRecognitionDialog />
            <FactoryModeNoticeDialog />
            <AboutDialog />
            <ChangelogDialog />
            <PanicDialog />

            {trackTransferOpen && device ? (
                <WorkbenchTrackTransfer
                    mode={canDownload ? 'export' : 'record'}
                    tracks={selectedTracks}
                    expectedRevision={device.revision}
                    onClose={() => setTrackTransferOpen(false)}
                    onTaskStarted={(id, nextMessage) => {
                        setSelectedTaskId(id);
                        setTaskCenterOpen(true);
                        setMessage(nextMessage);
                    }}
                />
            ) : null}

            {writeReviewOpen ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={() => !busy && setWriteReviewOpen(false)}>
                    <section className="workbench__modal workbench__write-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-write-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">WRITE REVIEW</span>
                        <h2 id="workbench-write-title">Record {imports.length} track{imports.length === 1 ? '' : 's'} to MiniDisc</h2>
                        <p>Review the exact recording mode and capacity calculation before the device starts writing.</p>
                        <div className="workbench__write-warning">
                            A track cannot be interrupted safely once transfer starts. Stopping only prevents the next track from starting; keep USB connected until the recording light stops flashing.
                        </div>
                        {writePreviewPending ? <div className="workbench__write-pending"><i />Validating the recording plan…</div> : null}
                        {writePreview ? (
                            <>
                                <dl className="workbench__write-summary">
                                    <div><dt>Recording mode</dt><dd>{codecLabel(selectedFormat)}</dd></div>
                                    <div><dt>Tracks</dt><dd>{writePreview.selectedIds.length}</dd></div>
                                    <div><dt>Required</dt><dd>{formatPreviewCapacity(writePreview, writePreview.capacity.required)}</dd></div>
                                    <div><dt>Remaining</dt><dd>{formatPreviewCapacity(writePreview, writePreview.capacity.remaining)}</dd></div>
                                    <div><dt>Half-width title space</dt><dd>{writePreview.titles.halfWidthRemaining}</dd></div>
                                    <div><dt>Full-width title space</dt><dd>{writePreview.titles.fullWidthRemaining}</dd></div>
                                </dl>
                                {writePreview.issues.map((issue) => <div className="workbench__write-warning" key={`${issue.id}:${issue.code}`}>{issue.message}</div>)}
                                {!writePreview.capacity.fits ? <div className="workbench__write-warning">The recording plan does not fit on this MiniDisc.</div> : null}
                                {!writePreview.titles.fits ? <div className="workbench__write-warning">The track titles exceed the MiniDisc title capacity.</div> : null}
                                {selectedEncoderSupport.state === 'unsupported' ? <div className="workbench__write-warning">The selected encoder cannot produce {codecLabel(selectedFormat)} audio in this build.</div> : null}
                                <label className="workbench__write-option">
                                    <input type="checkbox" checked={enableReplayGain} onChange={(event) => setEnableReplayGain(event.target.checked)} />
                                    <span>Apply ReplayGain<small>Normalize perceived loudness while encoding compatible source audio.</small></span>
                                </label>
                                <label className={`workbench__write-option ${selectedEncoderSupport.gapless ? '' : 'is-disabled'}`}>
                                    <input type="checkbox" checked={enableGapless} disabled={!selectedEncoderSupport.gapless} onChange={(event) => setEnableGapless(event.target.checked)} />
                                    <span>Gapless encoding<small>{selectedEncoderSupport.gapless ? 'Preserve transitions between adjacent tracks.' : 'The selected encoder does not support gapless output.'}</small></span>
                                </label>
                            </>
                        ) : null}
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={() => setWriteReviewOpen(false)} disabled={busy}>Cancel</button>
                            <button className="primary-button" onClick={startWrite} disabled={busy || writePreviewPending || !writePreviewFits}>Start recording</button>
                        </div>
                    </section>
                </div>
            ) : null}
            {groupDialogOpen ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={() => setGroupDialogOpen(false)}>
                    <section className="workbench__modal" role="dialog" aria-modal="true" aria-labelledby="workbench-group-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">ORGANIZE DISC</span>
                        <h2 id="workbench-group-title">Create a group</h2>
                        <p>Tracks {(sortedSelectedTrackIndexes[0] ?? 0) + 1}–{(sortedSelectedTrackIndexes.at(-1) ?? 0) + 1} will stay in their current order.</p>
                        <label>Group name<input autoFocus value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && groupDraft.trim()) createGroup(); }} /></label>
                        <div className="workbench__modal-actions"><button className="secondary-button" onClick={() => setGroupDialogOpen(false)}>Cancel</button><button className="primary-button" onClick={createGroup} disabled={!groupDraft.trim() || busy}>Create group</button></div>
                    </section>
                </div>
            ) : null}
        </div>
    );
};

export default Workbench;
