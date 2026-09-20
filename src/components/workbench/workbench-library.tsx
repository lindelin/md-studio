import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AudiotrackRoundedIcon from '@mui/icons-material/AudiotrackRounded';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import type { LibraryCatalogEntry, LibraryCatalogSearchItem } from '../../application/library-catalog';
import { formatTimeFromSeconds } from '../../utils';
import {
    libraryPathKey,
    resolveRowNavigationIndex,
    toggleLibraryTrackSelection,
    toggleVisibleLibraryTracks,
} from './workbench-model';
import { calculateVirtualListWindow, scrollOffsetForVirtualIndex } from './workbench-virtual-list';

const PAGE_SIZE = 100;
const LIBRARY_ROW_HEIGHT = 51;

type LibraryTrackItem = LibraryCatalogSearchItem;
type LibraryDisplayItem =
    | { kind: 'directory'; name: string; path: string[] }
    | ({ kind: 'track' } & LibraryTrackItem);
type LibraryBrowserRow =
    | { kind: 'parent'; key: string; path: string[] }
    | { kind: 'item'; key: string; item: LibraryDisplayItem };

export const WorkbenchLibrary = ({
    onImported,
    onOpenSettings,
}: {
    onImported(count: number): void;
    onOpenSettings(): void;
}) => {
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const library = workspace.library;
    const [path, setPath] = useState<string[]>([]);
    const [searchDraft, setSearchDraft] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [items, setItems] = useState<LibraryDisplayItem[]>([]);
    const [selectedTracks, setSelectedTracks] = useState<LibraryTrackItem[]>([]);
    const [nextOffset, setNextOffset] = useState<number | undefined>();
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [listViewport, setListViewport] = useState({ scrollTop: 0, height: 0 });
    const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);
    const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
    const requestId = useRef(0);
    const listRef = useRef<HTMLDivElement>(null);

    const refreshLibrary = useCallback(async () => {
        setBusy(true);
        setStatus('Refreshing library…');
        const result = await client.execute({ type: 'library.refreshSummary' });
        setBusy(false);
        if (!result.ok) {
            setStatus(result.error.message);
            return;
        }
        setStatus(null);
    }, [client]);

    useEffect(() => {
        if (library.status === 'idle') void refreshLibrary();
    }, [library.status, refreshLibrary]);

    useEffect(() => {
        setSelectedTracks([]);
    }, [library.revision]);

    const loadPage = useCallback(
        async (offset: number, append: boolean) => {
            if (library.status !== 'ready') return;
            const currentRequest = ++requestId.current;
            setBusy(true);
            setStatus(searchQuery ? `Searching for “${searchQuery}”…` : 'Loading folder…');
            const result = searchQuery
                ? await client.execute({
                      type: 'library.search',
                      query: searchQuery,
                      offset,
                      limit: PAGE_SIZE,
                      expectedRevision: library.revision,
                  })
                : await client.execute({
                      type: 'library.list',
                      path,
                      offset,
                      limit: PAGE_SIZE,
                      expectedRevision: library.revision,
                  });
            if (currentRequest !== requestId.current) return;
            setBusy(false);
            if (!result.ok) {
                setStatus(result.error.message);
                if (!append) setItems([]);
                return;
            }
            const page = searchQuery ? result.librarySearch : result.libraryPage;
            if (!page) {
                setStatus('The library returned no page data.');
                return;
            }
            const nextItems: LibraryDisplayItem[] = searchQuery
                ? (page.items as LibraryCatalogSearchItem[]).map((item) => ({ kind: 'track' as const, ...item }))
                : (page.items as LibraryCatalogEntry[]).map((item) =>
                      item.kind === 'directory'
                          ? { kind: 'directory' as const, name: item.name, path: [...path, item.name] }
                          : { ...item, path: [...path, item.name] }
                  );
            setItems((current) => (append ? [...current, ...nextItems] : nextItems));
            setNextOffset(page.nextOffset);
            setTotal(page.total);
            setStatus(null);
        },
        [client, library.revision, library.status, path, searchQuery]
    );

    useEffect(() => {
        if (library.status !== 'ready') {
            setItems([]);
            setNextOffset(undefined);
            setTotal(0);
            return;
        }
        void loadPage(0, false);
    }, [library.status, library.revision, path, searchQuery, loadPage]);

    const selectedKeys = useMemo(
        () => new Set(selectedTracks.map((track) => libraryPathKey(track.path))),
        [selectedTracks]
    );
    const visibleTracks = items.filter((item): item is Extract<LibraryDisplayItem, { kind: 'track' }> => item.kind === 'track');
    const allVisibleSelected =
        visibleTracks.length > 0 && visibleTracks.every((track) => selectedKeys.has(libraryPathKey(track.path)));
    const browserRows = useMemo<LibraryBrowserRow[]>(() => {
        const rows: LibraryBrowserRow[] = items.map((item) => ({
            kind: 'item',
            key: `${item.kind}:${libraryPathKey(item.path)}`,
            item,
        }));
        if (!searchQuery && path.length > 0) {
            rows.unshift({ kind: 'parent', key: `parent:${libraryPathKey(path)}`, path: path.slice(0, -1) });
        }
        return rows;
    }, [items, path, searchQuery]);
    const listWindow = useMemo(
        () =>
            calculateVirtualListWindow({
                itemCount: browserRows.length,
                rowHeight: LIBRARY_ROW_HEIGHT,
                scrollTop: listViewport.scrollTop,
                viewportHeight: listViewport.height,
            }),
        [browserRows.length, listViewport]
    );
    const visibleBrowserRows = browserRows.slice(listWindow.start, listWindow.end);

    useEffect(() => {
        const element = listRef.current;
        if (!element) return;
        const update = () => {
            const next = { scrollTop: element.scrollTop, height: element.clientHeight };
            setListViewport((current) =>
                current.scrollTop === next.scrollTop && current.height === next.height ? current : next
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const element = listRef.current;
        if (element) element.scrollTop = 0;
        setListViewport((current) => ({ scrollTop: 0, height: element?.clientHeight ?? current.height }));
        setFocusedRowKey(null);
        setPendingFocusIndex(null);
    }, [library.revision, path, searchQuery]);

    useEffect(() => {
        if (browserRows.length === 0) {
            setFocusedRowKey(null);
            return;
        }
        if (!focusedRowKey || !browserRows.some((row) => row.key === focusedRowKey)) {
            setFocusedRowKey(browserRows[0].key);
        }
    }, [browserRows, focusedRowKey]);

    useEffect(() => {
        if (pendingFocusIndex === null) return;
        const row = listRef.current?.querySelector<HTMLElement>(`[data-library-row-index="${pendingFocusIndex}"]`);
        if (!row) return;
        row.focus();
        setPendingFocusIndex(null);
    }, [listWindow.end, listWindow.start, pendingFocusIndex]);

    const toggleTrack = (track: LibraryTrackItem) => {
        setSelectedTracks((current) => toggleLibraryTrackSelection(current, track));
    };

    const toggleVisibleTracks = () => {
        setSelectedTracks((current) => toggleVisibleLibraryTracks(current, visibleTracks));
    };

    const importSelected = async () => {
        if (selectedTracks.length === 0) return;
        setBusy(true);
        setStatus(`Adding ${selectedTracks.length} track${selectedTracks.length === 1 ? '' : 's'} to the recording plan…`);
        const result = await client.execute({
            type: 'library.import',
            paths: selectedTracks.map((track) => track.path),
            expectedLibraryRevision: library.revision,
            expectedImportRevision: workspace.imports.revision,
        });
        setBusy(false);
        if (!result.ok) {
            setStatus(result.error.message);
            return;
        }
        const count = selectedTracks.length;
        setSelectedTracks([]);
        setStatus(null);
        onImported(count);
    };

    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        setSearchQuery(searchDraft.trim());
    };

    const libraryMessage =
        status ??
        (library.status === 'loading'
            ? 'Loading library database…'
            : library.status === 'error'
              ? library.error ?? 'The library could not be loaded.'
              : null);

    const activateBrowserRow = (row: LibraryBrowserRow) => {
        if (row.kind === 'parent') {
            setPath(row.path);
            return;
        }
        if (row.item.kind === 'directory') setPath(row.item.path);
        else toggleTrack(row.item);
    };

    const focusBrowserRow = (index: number) => {
        const element = listRef.current;
        const row = browserRows[index];
        if (!element || !row) return;
        const scrollTop = scrollOffsetForVirtualIndex({
            index,
            itemCount: browserRows.length,
            rowHeight: LIBRARY_ROW_HEIGHT,
            scrollTop: element.scrollTop,
            viewportHeight: element.clientHeight,
        });
        element.scrollTop = scrollTop;
        setListViewport({ scrollTop, height: element.clientHeight });
        setFocusedRowKey(row.key);
        setPendingFocusIndex(index);
    };

    const handleBrowserRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const nextIndex = resolveRowNavigationIndex(index, browserRows.length, event.key);
        if (nextIndex === null) return;
        event.preventDefault();
        focusBrowserRow(nextIndex);
    };

    const renderBrowserRow = (row: LibraryBrowserRow, visibleIndex: number) => {
        const index = listWindow.start + visibleIndex;
        if (row.kind === 'parent') {
            return (
                <button
                    className="workbench__library-row is-directory"
                    key={row.key}
                    role="option"
                    aria-selected="false"
                    aria-posinset={index + 1}
                    aria-setsize={browserRows.length}
                    data-library-row-index={index}
                    tabIndex={row.key === focusedRowKey ? 0 : -1}
                    onFocus={() => setFocusedRowKey(row.key)}
                    onKeyDown={(event) => handleBrowserRowKeyDown(event, index)}
                    onClick={() => activateBrowserRow(row)}
                >
                    <ArrowBackRoundedIcon />
                    <span><strong>Parent folder</strong><small>{row.path.join('/') || 'Library'}</small></span>
                    <span />
                    <span />
                </button>
            );
        }
        const item = row.item;
        if (item.kind === 'directory') {
            return (
                <button
                    className="workbench__library-row is-directory"
                    key={row.key}
                    role="option"
                    aria-selected="false"
                    aria-posinset={index + 1}
                    aria-setsize={browserRows.length}
                    data-library-row-index={index}
                    tabIndex={row.key === focusedRowKey ? 0 : -1}
                    onFocus={() => setFocusedRowKey(row.key)}
                    onKeyDown={(event) => handleBrowserRowKeyDown(event, index)}
                    onClick={() => activateBrowserRow(row)}
                >
                    <FolderRoundedIcon />
                    <span><strong>{item.name}</strong><small>Folder</small></span>
                    <span />
                    <span />
                </button>
            );
        }
        const selected = selectedKeys.has(libraryPathKey(item.path));
        return (
            <button
                className={`workbench__library-row ${selected ? 'is-selected' : ''}`}
                key={row.key}
                role="option"
                aria-selected={selected}
                aria-posinset={index + 1}
                aria-setsize={browserRows.length}
                data-library-row-index={index}
                tabIndex={row.key === focusedRowKey ? 0 : -1}
                onFocus={() => setFocusedRowKey(row.key)}
                onKeyDown={(event) => handleBrowserRowKeyDown(event, index)}
                onClick={() => activateBrowserRow(row)}
            >
                <span className="workbench__library-check">{selected ? <CheckBoxRoundedIcon /> : <CheckBoxOutlineBlankRoundedIcon />}</span>
                <span><strong>{item.title || item.name}</strong><small>{item.path.join('/')}</small></span>
                <span><strong>{item.artist || 'Unknown artist'}</strong><small>{item.album || 'Unknown album'}</small></span>
                <span>{formatTimeFromSeconds(item.duration, false)}</span>
            </button>
        );
    };

    return (
        <section className="workbench__library" aria-label="Music library">
            <header>
                <div>
                    <span className="workbench__eyebrow">LOCAL LIBRARY</span>
                    <h2>{searchQuery ? `Search: ${searchQuery}` : path.length ? path.at(-1) : 'Browse music'}</h2>
                    <p>{library.status === 'ready' ? `${library.entryCount} indexed entries · ${total} in this view` : 'Connect a configured library service to browse audio.'}</p>
                </div>
                <div className="workbench__library-actions">
                    <button className="secondary-button" onClick={() => void refreshLibrary()} disabled={busy}><RefreshRoundedIcon /> Refresh</button>
                    <button className="primary-button" onClick={() => void importSelected()} disabled={busy || selectedTracks.length === 0}><AddRoundedIcon /> {selectedTracks.length ? `Add ${selectedTracks.length} to plan` : 'Add to plan'}</button>
                </div>
            </header>

            <div className="workbench__library-toolbar">
                <nav aria-label="Library path">
                    <button onClick={() => { setPath([]); setSearchQuery(''); }} disabled={!searchQuery && path.length === 0}>Library</button>
                    {!searchQuery && path.map((part, index) => <React.Fragment key={`${part}:${index}`}><span>/</span><button onClick={() => setPath(path.slice(0, index + 1))}>{part}</button></React.Fragment>)}
                </nav>
                <form onSubmit={submitSearch}>
                    <SearchRoundedIcon />
                    <input aria-label="Search library" placeholder="Search title, artist, album or path" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
                    {searchQuery ? <button type="button" onClick={() => { setSearchDraft(''); setSearchQuery(''); }}>Clear</button> : <button type="submit">Search</button>}
                </form>
            </div>

            {libraryMessage ? <div className={`workbench__library-message ${library.status === 'error' ? 'is-error' : ''}`}><span>{libraryMessage}</span>{library.status === 'error' ? <button onClick={onOpenSettings}>Open settings</button> : null}</div> : null}

            <div className="workbench__library-content">
                <div className="workbench__library-browser">
                    <div className="workbench__library-list-head"><button aria-label={allVisibleSelected ? 'Clear visible track selection' : 'Select all visible tracks'} onClick={toggleVisibleTracks} disabled={visibleTracks.length === 0}>{allVisibleSelected ? <CheckBoxRoundedIcon /> : <CheckBoxOutlineBlankRoundedIcon />}</button><span>Name</span><span>Artist / Album</span><span>Duration</span></div>
                    <div
                        className="workbench__library-list"
                        role="listbox"
                        aria-label="Library entries"
                        aria-multiselectable="true"
                        ref={listRef}
                        onScroll={(event) =>
                            setListViewport({
                                scrollTop: event.currentTarget.scrollTop,
                                height: event.currentTarget.clientHeight,
                            })
                        }
                    >
                        {listWindow.virtualized ? (
                            <div className="workbench__virtual-list" style={{ height: listWindow.totalHeight }}>
                                <div className="workbench__virtual-list-window" style={{ transform: `translateY(${listWindow.offset}px)` }}>
                                    {visibleBrowserRows.map(renderBrowserRow)}
                                </div>
                            </div>
                        ) : visibleBrowserRows.map(renderBrowserRow)}
                        {!busy && items.length === 0 && library.status === 'ready' ? <div className="workbench__library-empty"><AudiotrackRoundedIcon /><strong>{searchQuery ? 'No matching tracks' : 'This folder is empty'}</strong><span>{searchQuery ? 'Try a different title, artist, album or path.' : 'Choose another folder or refresh the library.'}</span></div> : null}
                    </div>
                    {nextOffset !== undefined ? <button className="workbench__library-more" disabled={busy} onClick={() => void loadPage(nextOffset, true)}>Load more · {items.length} of {total}</button> : null}
                </div>

                <aside className="workbench__library-selection">
                    <span className="workbench__eyebrow">RECORDING SELECTION</span>
                    <h3>{selectedTracks.length ? `${selectedTracks.length} tracks selected` : 'Nothing selected'}</h3>
                    <p>{selectedTracks.length ? 'These tracks will be added to the shared recording plan in this order.' : 'Select tracks from folders or search results.'}</p>
                    <div>
                        {selectedTracks.map((track, index) => <button key={libraryPathKey(track.path)} aria-label={`Remove ${track.title || track.name} from selection`} onClick={() => toggleTrack(track)}><em>{String(index + 1).padStart(2, '0')}</em><span><strong>{track.title || track.name}</strong><small>{track.artist || track.path.join('/')}</small></span><span>×</span></button>)}
                    </div>
                </aside>
            </div>
        </section>
    );
};
