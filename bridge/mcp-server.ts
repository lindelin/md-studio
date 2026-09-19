import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import type { ApplicationCommand, CommandResult } from '../src/application/command-bus.ts';
import { LocalBridgeBroker } from './broker.ts';
import { startLocalBridgeServer } from './websocket-server.ts';

const broker = new LocalBridgeBroker();
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
        'minidisc_get_status',
        { description: 'Read the connected MiniDisc device, capabilities, disc, groups, and tracks.', inputSchema: z.object({}) },
        async () => execute({ type: 'disc.refresh' })
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
        'minidisc_list_imports',
        { description: 'List the ordered audio import queue and its revision.', inputSchema: z.object({}) },
        async () => execute({ type: 'import.list' })
    );

    return server;
}

const stdio = serveStdio(createServer);
console.error(`MiniDisc MCP bridge listening on ws://${bridge.host}:${bridge.port}`);

process.on('SIGINT', () => {
    void Promise.allSettled([stdio.close(), bridge.close()]).then(() => process.exit(0));
});
