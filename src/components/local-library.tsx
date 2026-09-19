import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { belowDesktop, forAnyDesktop, useDispatch } from '../frontend-utils';
import { useShallowEqualSelector } from '../frontend-utils';

import { actions as localLibraryActions } from '../redux/local-library-feature';
import { actions as convertDialogActions } from '../redux/convert-dialog-feature';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { AdaptiveFile, formatTimeFromSeconds } from '../utils';
import { makeStyles } from 'tss-react/mui';
import { ExportParams } from '../services/audio/audio-export';
import { File, FileBrowser } from './file-browser/browser';
import { Add, ArrowUpward } from '@mui/icons-material';
import { dirSorter, FileType } from './file-browser/utils';
import { useApplicationClient, useApplicationWorkspace } from './use-application-client';
import type { LibraryCatalogEntry } from '../application/library-catalog';

const LIBRARY_PAGE_SIZE = 200;

const Transition = React.forwardRef(function Transition(props: SlideProps, ref: React.Ref<unknown>) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const useStyles = makeStyles()((theme) => ({
    uploadRow: {
        '&:hover': {
            textDecoration: 'line-through',
        },
    },
    wrapperDiv: {
        display: 'flex',
        [forAnyDesktop(theme)]: {
            flexDirection: 'row',
            height: '100%',
        },
        [belowDesktop(theme)]: {
            flexDirection: 'column',
            width: '100%',
        },
    },
    internalDiv: {
        [forAnyDesktop(theme)]: {
            width: '49%',
        },
        [belowDesktop(theme)]: {
            height: '49%',
        },
        display: 'flex',
        overflow: 'auto',
        flexDirection: 'column',
        height: '100%',
    },
    uploadHeader: {
        textAlign: 'center',
        margin: 0,
        marginBottom: theme.spacing(2.5),
    },
    trackIndexCol: {
        width: 60,
    },
}));

export const LocalLibraryDialog = ({ setUploadedFiles }: { setUploadedFiles: (files: AdaptiveFile[]) => void }) => {
    const applicationClient = useApplicationClient();
    const library = useApplicationWorkspace().library;
    const { classes } = useStyles();
    const dispatch = useDispatch();
    const { visible } = useShallowEqualSelector((state) => state.localLibrary);
    const { visible: convertDialogVisible } = useShallowEqualSelector((state) => state.convertDialog);
    const [currentPath, setCurrentPath] = useState<string[]>([]);
    const [currentFileTree, setCurrentFileTree] = useState<File[]>([]);
    const [listingStatus, setListingStatus] = useState<string | null>(null);

    const listDirectory = useCallback(
        async (path: string[], expectedRevision: number): Promise<File[]> => {
            const entries: LibraryCatalogEntry[] = [];
            let nextOffset: number | undefined = 0;
            while (nextOffset !== undefined) {
                const result = await applicationClient.execute({
                    type: 'library.list',
                    path,
                    offset: nextOffset,
                    limit: LIBRARY_PAGE_SIZE,
                    expectedRevision,
                });
                if (!result.ok) throw new Error(result.error.message);
                const page = result.libraryPage;
                if (!page) throw new Error('The library did not return a directory listing.');
                entries.push(...page.items);
                nextOffset = page.nextOffset;
            }
            return entries.map((entry) => {
                const entryPath = [...path, entry.name];
                const isFolder = entry.kind === 'directory';
                return {
                    name: entry.name,
                    type: isFolder ? FileType.Directory : FileType.File,
                    props: isFolder
                        ? { path: entryPath }
                        : {
                              ...entry,
                              id: entryPath.join('/'),
                              path: entryPath,
                          },
                };
            });
        },
        [applicationClient]
    );

    useEffect(() => {
        if (!visible || library.status !== 'ready') {
            setCurrentFileTree([]);
            return;
        }
        let cancelled = false;
        setListingStatus('Loading folder...');
        void listDirectory(currentPath, library.revision)
            .then((files) => {
                if (!cancelled) setCurrentFileTree(files);
            })
            .catch((error) => {
                if (!cancelled) {
                    setCurrentFileTree([]);
                    setListingStatus(`Could not list library: ${error instanceof Error ? error.message : String(error)}`);
                }
            })
            .finally(() => {
                if (!cancelled) setListingStatus((status) => (status === 'Loading folder...' ? null : status));
            });
        return () => {
            cancelled = true;
        };
    }, [currentPath, library, listDirectory, visible]);

    const libraryStatus = useMemo(() => {
        if (listingStatus) return listingStatus;
        if (library.status === 'loading' || library.status === 'idle') return 'Loading database...';
        if (library.status === 'error') return `Could not load library: ${library.error ?? 'Unknown error'}`;
        return null;
    }, [library, listingStatus]);

    const handleClose = useCallback(() => {
        dispatch(localLibraryActions.setVisible(false));
    }, [dispatch]);

    const [selectedFiles, setSelectedFiles] = useState<
        { path: string; album: string; artist: string; title: string; duration: number; trackIndex?: number }[]
    >([]);

    const resetToRoot = useMemo(
        () => () => {
            setCurrentPath([]);
        },
        [setCurrentPath]
    );

    const addFiles = useCallback(
        (files: File[]) => {
            setSelectedFiles((old) => {
                let current = [...old];
                for (const file of files) {
                    const path = file.props!['id'];
                    const album = file.props!['album'];
                    const artist = file.props!['artist'];
                    const title = file.props!['title'];
                    const duration = file.props!['duration'];
                    const trackIndex = file.props!['trackIndex'];
                    const indexFound = current.findIndex((e) => e.path === path);
                    if (indexFound !== -1) {
                        // Delete (unmark)
                        current.splice(indexFound, 1);
                    } else {
                        // Add (mark)
                        current = [...current, { album, artist, path, title, duration, trackIndex }];
                    }
                }
                return current;
            });
        },
        [setSelectedFiles]
    );

    const handleFileAction = useCallback(
        (file: File) => {
            if (file.type === FileType.Directory) {
                setCurrentPath(file.props?.['path'] ?? []);
            } else {
                addFiles([file]);
            }
        },
        [addFiles, setCurrentPath]
    );

    const handleAddAllSelected = useCallback(
        async (files: File[]) => {
            if (library.status !== 'ready') return false;
            const process = async (filesToProcess: File[]): Promise<File[]> => {
                const finalFiles: File[] = [];
                for (const file of filesToProcess) {
                    if (file.type === FileType.Directory) {
                        const newPath = file.props?.['path'] as string[];
                        const subFiles = await listDirectory(newPath, library.revision);
                        subFiles.sort((a, b) => {
                            const dirSortResult = dirSorter(a, b, '', false);
                            if (dirSortResult) return dirSortResult;
                            if (a.props?.['trackIndex'] !== undefined && b.props?.['trackIndex'] !== undefined) {
                                return a.props!['trackIndex'] - b.props!['trackIndex'];
                            }
                            return a.name.localeCompare(b.name);
                        });
                        finalFiles.push(...(await process(subFiles)));
                    } else {
                        finalFiles.push(file);
                    }
                }
                return finalFiles;
            };

            setListingStatus('Loading selected folders...');
            try {
                addFiles(await process(files));
            } catch (error) {
                setListingStatus(`Could not list library: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
            setListingStatus(null);
            return true;
        },
        [addFiles, library, listDirectory]
    );

    const handleForwardFiles = useCallback(() => {
        const adaptiveFiles: AdaptiveFile[] = selectedFiles.map((file) => {
            const pathTokens = file.path.split('/');
            const processFile = applicationClient.createLocalLibraryFileProcessor(file.path);
            const adaptiveFile: AdaptiveFile = {
                album: file.album,
                artist: file.artist,
                title: file.title,
                name: pathTokens[pathTokens.length - 1] || 'unknown.unk',
                duration: file.duration,

                getForEncoding: async (params: ExportParams) => {
                    return processFile(params);
                },
            };
            return adaptiveFile;
        });
        setUploadedFiles(adaptiveFiles);
        dispatch(localLibraryActions.setVisible(false));
        if (!convertDialogVisible && adaptiveFiles.length) dispatch(convertDialogActions.setVisible(true));
        setSelectedFiles([]);
        resetToRoot();
    }, [applicationClient, convertDialogVisible, selectedFiles, dispatch, setUploadedFiles, resetToRoot]);

    return (
        <Dialog
            open={visible}
            maxWidth={'sm'}
            fullWidth={true}
            fullScreen={true}
            TransitionComponent={Transition as any}
            aria-labelledby="library-dialog-slide-title"
        >
            <DialogTitle id="library-dialog-slide-title">Library</DialogTitle>
            <DialogContent>
                <div className={classes.wrapperDiv}>
                    <div className={classes.internalDiv}>
                        <DialogContentText>{libraryStatus}&nbsp;</DialogContentText>
                        {visible && (
                            <FileBrowser
                                fileTree={currentFileTree}
                                onFileDoubleClick={handleFileAction}
                                columnNotFoundPlaceholder=""
                                manualName={true}
                                allowMultifileSelection={true}
                                defaultSorting={{ by: 'name', asc: false }}
                                pathString={currentPath.join('/')}
                                additionalColumns={[
                                    {
                                        name: 'trackIndex',
                                        overrideName: 'Track Index',
                                        sortable: true,
                                        class: classes.trackIndexCol,
                                    },
                                    {
                                        name: 'name',
                                        sortable: true,
                                    },
                                ]}
                                actions={[
                                    {
                                        name: '',
                                        icon: <ArrowUpward />,
                                        actionPossible: () => currentPath.length > 0,
                                        handler: () => setCurrentPath((e) => e.slice(0, -1)),
                                    },
                                    {
                                        name: 'Root',
                                        icon: <ArrowUpward />,
                                        actionPossible: () => currentPath.length > 0,
                                        handler: () => setCurrentPath([]),
                                    },
                                    {
                                        name: 'Add / Remove Selected',
                                        icon: <Add />,
                                        actionPossible: (e) => e.length > 0,
                                        handler: (e) => {
                                            void handleAddAllSelected(e);
                                            return false;
                                        },
                                    },
                                ]}
                            />
                        )}
                    </div>

                    <div className={classes.internalDiv}>
                        <h4 className={classes.uploadHeader}>Files selected:</h4>
                        <Table size="small" style={{ tableLayout: 'fixed' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Track #</TableCell>
                                    <TableCell>Title</TableCell>
                                    <TableCell>Album</TableCell>
                                    <TableCell>Artist</TableCell>
                                    <TableCell align="right">Duration</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {selectedFiles.map((e) => (
                                    <TableRow
                                        key={e.path}
                                        className={classes.uploadRow}
                                        onClick={() => setSelectedFiles((old) => old.filter((z) => z !== e))}
                                    >
                                        <TableCell>{e.trackIndex}</TableCell>
                                        <TableCell>{e.title}</TableCell>
                                        <TableCell>{e.album}</TableCell>
                                        <TableCell>{e.artist}</TableCell>
                                        <TableCell align="right">{formatTimeFromSeconds(e.duration, false)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleForwardFiles}>OK</Button>
            </DialogActions>
        </Dialog>
    );
};
