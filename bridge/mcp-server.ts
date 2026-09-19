import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import type { ApplicationCommand, CommandResult } from '../src/application/command-bus.ts';
import { LocalBridgeBroker } from './broker.ts';
import { LocalFileRegistry } from './local-file-registry.ts';
import { LocalOutputRegistry } from './local-output-registry.ts';
import { startLocalBridgeServer } from './websocket-server.ts';

const localFiles = new LocalFileRegistry();
const localOutputs = new LocalOutputRegistry();
const broker = new LocalBridgeBroker(localFiles, localOutputs);
const bridge = startLocalBridgeServer(broker, {
    host: process.env.MINIDISC_BRIDGE_HOST,
    port: process.env.MINIDISC_BRIDGE_PORT ? Number(process.env.MINIDISC_BRIDGE_PORT) : undefined,
    token: process.env.MINIDISC_BRIDGE_TOKEN,
    allowedOrigins: process.env.MINIDISC_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()),
});

function asToolResult(result: CommandResult) {
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
        isError: !result.ok,
    };
}

async function execute(command: ApplicationCommand) {
    try {
        return asToolResult(await broker.execute(command));
    } catch (error) {
        return {
            content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
            isError: true,
        };
    }
}

function createServer() {
    const server = new McpServer(
        { name: 'minidisc-workspace', version: '0.1.0' },
        {
            instructions:
                'Read the current device and disc state before editing. Pass expectedRevision for edits prepared from an earlier snapshot. Destructive tools require a user-confirmed reason.',
        }
    );

    server.registerTool(
        'minidisc_get_workspace',
        {
            description:
                'Read the complete app workspace: connected device and disc when available, ordered imports, task history, and shared settings. This also works before a device is connected.',
            inputSchema: z.object({}),
        },
        async () => execute({ type: 'workspace.get' })
    );
    server.registerTool(
        'minidisc_get_status',
        { description: 'Read the connected MiniDisc device, capabilities, disc, groups, and tracks.', inputSchema: z.object({}) },
        async () => execute({ type: 'disc.refresh' })
    );
    server.registerTool(
        'minidisc_refresh_library',
        {
            description:
                'Refresh the configured audio library without requiring a MiniDisc. Returns bounded status and entry count; use minidisc_list_library to browse it.',
            inputSchema: z.object({}),
        },
        async () => execute({ type: 'library.refreshSummary' })
    );
    server.registerTool(
        'minidisc_list_library',
        {
            description:
                'List one bounded page in the refreshed audio library. Pass directory names as path segments and retain revision across pages.',
            inputSchema: z.object({
                path: z.array(z.string().min(1).max(1024)).max(64).optional(),
                offset: z.number().int().nonnegative().optional(),
                limit: z.number().int().min(1).max(200).optional(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ path, offset, limit, expectedRevision }) =>
            execute({ type: 'library.list', path, offset, limit, expectedRevision })
    );
    server.registerTool(
        'minidisc_import_library_tracks',
        {
            description:
                'Add selected tracks from the refreshed audio library to the shared import queue. Each path is an array of exact directory and file names returned by minidisc_list_library.',
            inputSchema: z.object({
                paths: z.array(z.array(z.string().min(1).max(1024)).min(1).max(64)).min(1).max(500),
                expectedLibraryRevision: z.number().int().nonnegative().optional(),
                expectedImportRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ paths, expectedLibraryRevision, expectedImportRevision }) =>
            execute({ type: 'library.import', paths, expectedLibraryRevision, expectedImportRevision })
    );
    server.registerTool(
        'minidisc_get_settings',
        {
            description:
                'Read shared appearance, metadata, archive, and advanced-mode preferences. Local bridge authorization is intentionally excluded.',
            inputSchema: z.object({}),
        },
        async () => execute({ type: 'settings.get' })
    );
    server.registerTool(
        'minidisc_update_settings',
        {
            description:
                'Update shared app preferences with revision protection. This cannot enable or reconfigure the local MCP/CLI bridge.',
            inputSchema: z.object({
                changes: z
                    .object({
                        colorTheme: z.enum(['dark', 'light', 'system']).optional(),
                        vintageMode: z.boolean().optional(),
                        discProtectedDialogDisabled: z.boolean().optional(),
                        notifyWhenFinished: z.boolean().optional(),
                        fullWidthSupport: z.boolean().optional(),
                        pageFullHeight: z.boolean().optional(),
                        pageFullWidth: z.boolean().optional(),
                        archiveDiscCreateZip: z.boolean().optional(),
                        factoryModeUseSlowerExploit: z.boolean().optional(),
                        factoryModeShortcuts: z.boolean().optional(),
                        factoryModeNERAWDownload: z.boolean().optional(),
                        uploadFormat: z.record(z.string(), z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).optional(),
                        trackTitleFormat: z
                            .enum(['filename', 'title', 'album-title', 'artist-title', 'artist-album-title', 'title-artist'])
                            .optional(),
                    })
                    .refine((changes) => Object.keys(changes).length > 0, 'At least one setting is required.'),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ changes, expectedRevision }) => execute({ type: 'settings.update', changes, expectedRevision })
    );
    server.registerTool(
        'minidisc_get_advanced_device_info',
        {
            description: 'Read firmware and supported advanced maintenance capabilities from a factory-capable NetMD device.',
            inputSchema: z.object({}),
        },
        async () => execute({ type: 'advanced.inspect' })
    );
    server.registerTool(
        'minidisc_read_raw_toc',
        {
            description:
                'Read all six raw UTOC sectors without modifying the disc. Returns bounded base64 data and a SHA-256 checksum.',
            inputSchema: z.object({}),
        },
        async () => execute({ type: 'advanced.readToc' })
    );
    server.registerTool(
        'minidisc_rename_disc',
        {
            description: 'Rename the current disc and return its refreshed state.',
            inputSchema: z.object({
                title: z.string(),
                fullWidthTitle: z.string().optional(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async (input) => execute({ type: 'disc.rename', ...input })
    );
    server.registerTool(
        'minidisc_export_metadata_csv',
        {
            description: 'Export current disc, group, track, and HiMD metadata as a round-trippable CSV document.',
            inputSchema: z.object({}),
        },
        async () => execute({ type: 'metadata.exportCsv' })
    );
    server.registerTool(
        'minidisc_plan_metadata_csv',
        {
            description:
                'Validate a metadata CSV against the current disc without writing it. Review track-count and content mismatches before applying.',
            inputSchema: z.object({ text: z.string().min(1).max(1024 * 1024) }),
        },
        async ({ text }) => execute({ type: 'metadata.planCsv', text })
    );
    server.registerTool(
        'minidisc_apply_metadata_csv',
        {
            description:
                'Apply a previously reviewed metadata CSV. includedTrackIndexes are zero-based; an empty list applies only the disc title and preserves current groups.',
            inputSchema: z.object({
                text: z.string().min(1).max(1024 * 1024),
                includedTrackIndexes: z.array(z.number().int().nonnegative()),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ text, includedTrackIndexes, expectedRevision }) =>
            execute({ type: 'metadata.applyCsv', text, includedTrackIndexes, expectedRevision })
    );
    server.registerTool(
        'minidisc_rename_tracks',
        {
            description: 'Rename one or more tracks atomically after validating every track index.',
            inputSchema: z.object({
                updates: z.array(
                    z.object({
                        index: z.number().int().nonnegative(),
                        title: z.string(),
                        fullWidthTitle: z.string().optional(),
                    })
                ),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ updates, expectedRevision }) => execute({ type: 'track.renameMany', updates, expectedRevision })
    );
    server.registerTool(
        'minidisc_rename_himd_tracks',
        {
            description: 'Update title, album, and artist metadata on one or more tracks in a HiMD-capable session.',
            inputSchema: z.object({
                updates: z
                    .array(
                        z.object({
                            index: z.number().int().nonnegative(),
                            title: z.string().optional(),
                            album: z.string().optional(),
                            artist: z.string().optional(),
                        })
                    )
                    .min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ updates, expectedRevision }) => execute({ type: 'track.renameHimdMany', updates, expectedRevision })
    );
    server.registerTool(
        'minidisc_create_group',
        {
            description: 'Create a named group over a contiguous range of tracks.',
            inputSchema: z.object({
                firstTrack: z.number().int().nonnegative(),
                trackCount: z.number().int().positive(),
                title: z.string().optional(),
                fullWidthTitle: z.string().optional(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async (input) => execute({ type: 'group.create', ...input })
    );
    server.registerTool(
        'minidisc_rename_group',
        {
            description: 'Rename an existing group.',
            inputSchema: z.object({
                index: z.number().int().nonnegative(),
                title: z.string(),
                fullWidthTitle: z.string().optional(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ index, title, fullWidthTitle, expectedRevision }) =>
            execute({ type: 'group.rename', update: { index, title, fullWidthTitle }, expectedRevision })
    );
    server.registerTool(
        'minidisc_delete_groups',
        {
            description: 'Remove one or more group boundaries without deleting their tracks.',
            inputSchema: z.object({
                indexes: z.array(z.number().int().nonnegative()).min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ indexes, expectedRevision }) => execute({ type: 'group.deleteMany', indexes, expectedRevision })
    );
    server.registerTool(
        'minidisc_move_track',
        {
            description: 'Move a track to a new zero-based position and refresh group layout.',
            inputSchema: z.object({
                sourceIndex: z.number().int().nonnegative(),
                destinationIndex: z.number().int().nonnegative(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async (input) => execute({ type: 'track.move', ...input })
    );
    server.registerTool(
        'minidisc_export_tracks',
        {
            description:
                'Start a background export of MiniDisc tracks into an existing local directory. Read the returned task until it completes.',
            inputSchema: z.object({
                indexes: z.array(z.number().int().nonnegative()).min(1),
                outputDirectory: z.string().min(1),
                convertToWav: z.boolean().optional(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ indexes, outputDirectory, convertToWav, expectedRevision }) => {
            try {
                const output = await localOutputs.registerDirectory(outputDirectory);
                return await execute({
                    type: 'track.export',
                    indexes,
                    outputHandle: output.handle,
                    convertToWav,
                    expectedRevision,
                });
            } catch (error) {
                return {
                    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
                    isError: true,
                };
            }
        }
    );
    server.registerTool(
        'minidisc_delete_tracks',
        {
            description: 'Permanently delete tracks after explicit user confirmation.',
            inputSchema: z.object({
                indexes: z.array(z.number().int().nonnegative()).min(1),
                confirmed: z.literal(true),
                reason: z.string().min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ indexes, confirmed, reason, expectedRevision }) =>
            execute({ type: 'track.deleteMany', indexes, confirmation: { confirmed, reason }, expectedRevision })
    );
    server.registerTool(
        'minidisc_erase_disc',
        {
            description: 'Permanently erase every track and group after explicit user confirmation.',
            inputSchema: z.object({
                confirmed: z.literal(true),
                reason: z.string().min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ confirmed, reason, expectedRevision }) =>
            execute({ type: 'disc.erase', confirmation: { confirmed, reason }, expectedRevision })
    );
    server.registerTool(
        'minidisc_format_himd',
        {
            description: 'Permanently format the current disc as HiMD after explicit user confirmation.',
            inputSchema: z.object({
                confirmed: z.literal(true),
                reason: z.string().min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ confirmed, reason, expectedRevision }) =>
            execute({ type: 'disc.formatHimd', confirmation: { confirmed, reason }, expectedRevision })
    );
    server.registerTool(
        'minidisc_flush_device',
        {
            description: 'Commit pending device-side database changes when the current status reports that flushing is available.',
            inputSchema: z.object({ expectedRevision: z.number().int().nonnegative().optional() }),
        },
        async ({ expectedRevision }) => execute({ type: 'device.flush', expectedRevision })
    );
    server.registerTool(
        'minidisc_eject_disc',
        {
            description: 'Eject the current disc when the connected device supports software eject.',
            inputSchema: z.object({ expectedRevision: z.number().int().nonnegative().optional() }),
        },
        async ({ expectedRevision }) => execute({ type: 'disc.eject', expectedRevision })
    );
    server.registerTool(
        'minidisc_control_playback',
        {
            description: 'Play, pause, stop, skip, select a track, or seek on the connected device.',
            inputSchema: z.discriminatedUnion('action', [
                z.object({ action: z.enum(['play', 'pause', 'stop', 'next', 'previous']) }),
                z.object({ action: z.literal('gotoTrack'), index: z.number().int().nonnegative() }),
                z.object({
                    action: z.literal('seek'),
                    index: z.number().int().nonnegative(),
                    hour: z.number().int().nonnegative(),
                    minute: z.number().int().nonnegative(),
                    second: z.number().int().nonnegative(),
                    frame: z.number().int().nonnegative(),
                }),
            ]),
        },
        async (command) => execute({ type: 'playback.control', command })
    );
    server.registerTool(
        'minidisc_run_device_self_test',
        {
            description:
                'Run the destructive device diagnostic. It renames content, exercises playback and ordering, deletes a track, and finally erases the entire disc. Use only with a disposable test disc.',
            inputSchema: z.object({ confirmed: z.literal(true), reason: z.string().min(1) }),
        },
        async ({ confirmed, reason }) => execute({ type: 'diagnostics.selfTest', confirmation: { confirmed, reason } })
    );
    server.registerTool(
        'minidisc_list_tasks',
        { description: 'List current and completed MiniDisc tasks with progress and results.', inputSchema: z.object({}) },
        async () => execute({ type: 'task.list' })
    );
    server.registerTool(
        'minidisc_cancel_task',
        { description: 'Request cooperative cancellation of a running MiniDisc task.', inputSchema: z.object({ id: z.string() }) },
        async ({ id }) => execute({ type: 'task.cancel', id })
    );
    server.registerTool(
        'minidisc_get_task',
        { description: 'Read one MiniDisc task and its current progress.', inputSchema: z.object({ id: z.string().min(1) }) },
        async ({ id }) => execute({ type: 'task.get', id })
    );
    server.registerTool(
        'minidisc_list_imports',
        { description: 'List the ordered audio import queue and its revision.', inputSchema: z.object({}) },
        async () => execute({ type: 'import.list' })
    );
    server.registerTool(
        'minidisc_add_imports',
        {
            description:
                'Add local audio paths to the ordered import queue. Audio payload transfer starts only when the write task begins.',
            inputSchema: z.object({
                inputs: z
                    .array(
                        z.object({
                            source: z.object({
                                kind: z.literal('local-path'),
                                name: z.string().min(1),
                                reference: z.string().min(1),
                                size: z.number().int().nonnegative().optional(),
                                mimeType: z.string().optional(),
                            }),
                            metadata: z.object({
                                title: z.string(),
                                fullWidthTitle: z.string().optional(),
                                artist: z.string().optional(),
                                album: z.string().optional(),
                                duration: z.number().nonnegative().optional(),
                                forcedEncoding: z
                                    .object({ codec: z.string().min(1), bitrate: z.number().int().nonnegative() })
                                    .nullable()
                                    .optional(),
                                bytesToSkip: z.number().int().nonnegative().optional(),
                            }),
                        })
                    )
                    .min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ inputs, expectedRevision }) => {
            const stagedHandles: string[] = [];
            try {
                const stagedInputs = await Promise.all(
                    inputs.map(async (input) => {
                        const staged = await localFiles.register(input.source.reference);
                        stagedHandles.push(staged.handle);
                        return {
                            ...input,
                            source: {
                                ...input.source,
                                name: input.source.name || staged.name,
                                reference: staged.reference,
                                size: staged.size,
                                mimeType: input.source.mimeType || staged.mimeType,
                            },
                        };
                    })
                );
                return await execute({ type: 'import.add', inputs: stagedInputs, expectedRevision });
            } catch (error) {
                for (const handle of stagedHandles) localFiles.revoke(handle);
                return {
                    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
                    isError: true,
                };
            }
        }
    );
    server.registerTool(
        'minidisc_update_import',
        {
            description: 'Update title, metadata, or encoding choices for one queued import.',
            inputSchema: z.object({
                id: z.string().min(1),
                changes: z.object({
                    title: z.string().optional(),
                    fullWidthTitle: z.string().optional(),
                    artist: z.string().optional(),
                    album: z.string().optional(),
                    duration: z.number().nonnegative().optional(),
                    forcedEncoding: z
                        .object({ codec: z.string().min(1), bitrate: z.number().int().nonnegative() })
                        .nullable()
                        .optional(),
                    bytesToSkip: z.number().int().nonnegative().optional(),
                }),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ id, changes, expectedRevision }) => execute({ type: 'import.update', id, changes, expectedRevision })
    );
    server.registerTool(
        'minidisc_update_imports',
        {
            description: 'Atomically update titles, metadata, or encoding choices for multiple queued imports.',
            inputSchema: z.object({
                updates: z
                    .array(
                        z.object({
                            id: z.string().min(1),
                            changes: z.object({
                                title: z.string().optional(),
                                fullWidthTitle: z.string().optional(),
                                artist: z.string().optional(),
                                album: z.string().optional(),
                                duration: z.number().nonnegative().optional(),
                                forcedEncoding: z
                                    .object({ codec: z.string().min(1), bitrate: z.number().int().nonnegative() })
                                    .nullable()
                                    .optional(),
                                bytesToSkip: z.number().int().nonnegative().optional(),
                            }),
                        })
                    )
                    .min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ updates, expectedRevision }) => execute({ type: 'import.updateMany', updates, expectedRevision })
    );
    server.registerTool(
        'minidisc_move_import',
        {
            description: 'Move one queued import to a new zero-based position.',
            inputSchema: z.object({
                id: z.string().min(1),
                destinationIndex: z.number().int().nonnegative(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async (input) => execute({ type: 'import.move', ...input })
    );
    server.registerTool(
        'minidisc_remove_imports',
        {
            description: 'Remove one or more items from the import queue.',
            inputSchema: z.object({
                ids: z.array(z.string().min(1)).min(1),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async ({ ids, expectedRevision }) => execute({ type: 'import.remove', ids, expectedRevision })
    );
    server.registerTool(
        'minidisc_clear_imports',
        {
            description: 'Clear the complete import queue.',
            inputSchema: z.object({ expectedRevision: z.number().int().nonnegative().optional() }),
        },
        async ({ expectedRevision }) => execute({ type: 'import.clear', expectedRevision })
    );
    server.registerTool(
        'minidisc_write_imports',
        {
            description:
                'Start a background write task for queued imports. Read the returned task with minidisc_get_task until it completes.',
            inputSchema: z.object({
                ids: z.array(z.string().min(1)).min(1).optional(),
                format: z
                    .object({ codec: z.string().min(1), bitrate: z.number().int().positive() })
                    .optional(),
                enableReplayGain: z.boolean().optional(),
                enableGapless: z.boolean().optional(),
                removeOnSuccess: z.boolean().optional(),
                expectedRevision: z.number().int().nonnegative().optional(),
            }),
        },
        async (input) => execute({ type: 'import.write', ...input })
    );

    return server;
}

const stdio = serveStdio(createServer);
console.error(`MiniDisc MCP bridge listening on ws://${bridge.host}:${bridge.port}`);

process.on('SIGINT', () => {
    void Promise.allSettled([stdio.close(), bridge.close(), localOutputs.close()]).then(() => process.exit(0));
});
