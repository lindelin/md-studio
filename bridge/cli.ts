import { readFile } from 'node:fs/promises';
import type { ApplicationCommand, CommandResult } from '../src/application/command-bus.ts';
import type { TaskSnapshot } from '../src/application/task-manager.ts';
import { LocalBridgeBroker } from './broker.ts';
import { LocalFileRegistry } from './local-file-registry.ts';
import { LocalOutputRegistry } from './local-output-registry.ts';
import { startLocalBridgeServer } from './websocket-server.ts';
import { stageLocalAudioImport } from './local-audio-import.ts';

function help() {
    return `MiniDisc Workspace CLI

Usage:
  npm run cli -- status
  npm run cli -- workspace
  npm run cli -- tasks
  npm run cli -- imports
  npm run cli -- write <audio-file> [audio-file ...]
  npm run cli -- export <directory> <track-number> [track-number ...] [--wav]
  npm run cli -- command '{"type":"playback.control","command":{"action":"play"}}'
  npm run cli -- --file command.json

Options:
  --codec <name>       Recording codec for write (for example LP2 or LP4)
  --bitrate <number>   Recording bitrate paired with --codec
  --wav                Convert exported tracks to WAV
  --port <number>      Local browser bridge port (default: 47123)
  --timeout <seconds>  Time to wait for the browser app and each command (default: 30)
  --file <path>        Read an ApplicationCommand JSON object from a file

Track numbers in the export command are one-based, matching the labels on a MiniDisc.
Write and export commands remain open until their background task reaches a terminal state.
`;
}

type CliOperation =
    | { kind: 'command'; command: ApplicationCommand }
    | { kind: 'write'; paths: string[]; codec?: string; bitrate?: number }
    | { kind: 'export'; directory: string; indexes: number[]; convertToWav: boolean };

interface ParsedArguments {
    operation?: CliOperation;
    port: number;
    timeoutMs: number;
    showHelp: boolean;
}

interface ExecutedOperation {
    result: CommandResult;
    temporaryImportIds: string[];
}

async function parseArguments(arguments_: string[]): Promise<ParsedArguments> {
    let port = Number(process.env.MINIDISC_BRIDGE_PORT ?? 47123);
    let timeoutMs = 30_000;
    let commandFile: string | undefined;
    let codec: string | undefined;
    let bitrate: number | undefined;
    let convertToWav = false;
    const positional: string[] = [];

    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--help' || argument === '-h') return { port, timeoutMs, showHelp: true };
        if (argument === '--port') {
            port = Number(arguments_[++index]);
            continue;
        }
        if (argument === '--timeout') {
            timeoutMs = Number(arguments_[++index]) * 1000;
            continue;
        }
        if (argument === '--file') {
            commandFile = arguments_[++index];
            continue;
        }
        if (argument === '--codec') {
            codec = arguments_[++index];
            continue;
        }
        if (argument === '--bitrate') {
            bitrate = Number(arguments_[++index]);
            continue;
        }
        if (argument === '--wav') {
            convertToWav = true;
            continue;
        }
        positional.push(argument);
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a whole number from 1 to 65535.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Timeout must be a positive number of seconds.');
    if ((codec === undefined) !== (bitrate === undefined)) throw new Error('--codec and --bitrate must be supplied together.');
    if (bitrate !== undefined && (!Number.isInteger(bitrate) || bitrate <= 0)) throw new Error('Bitrate must be a positive whole number.');

    let operation: CliOperation | undefined;
    if (commandFile) {
        operation = { kind: 'command', command: JSON.parse(await readFile(commandFile, 'utf8')) as ApplicationCommand };
    } else if (positional[0] === 'status') {
        operation = { kind: 'command', command: { type: 'disc.refresh' } };
    } else if (positional[0] === 'workspace') {
        operation = { kind: 'command', command: { type: 'workspace.get' } };
    } else if (positional[0] === 'tasks') {
        operation = { kind: 'command', command: { type: 'task.list' } };
    } else if (positional[0] === 'imports') {
        operation = { kind: 'command', command: { type: 'import.list' } };
    } else if (positional[0] === 'write' && positional.length > 1) {
        operation = { kind: 'write', paths: positional.slice(1), codec, bitrate };
    } else if (positional[0] === 'export' && positional.length > 2) {
        const indexes = positional.slice(2).map((value) => Number(value) - 1);
        if (indexes.some((value) => !Number.isInteger(value) || value < 0)) {
            throw new Error('Export track numbers must be positive whole numbers.');
        }
        operation = { kind: 'export', directory: positional[1], indexes, convertToWav };
    } else if (positional[0] === 'command' && positional[1]) {
        operation = { kind: 'command', command: JSON.parse(positional.slice(1).join(' ')) as ApplicationCommand };
    } else if (positional.length > 0) {
        throw new Error(`Unknown or incomplete CLI command: ${positional[0]}`);
    }

    return { operation, port, timeoutMs, showHelp: operation === undefined };
}

async function executeOperation(
    operation: CliOperation,
    broker: LocalBridgeBroker,
    files: LocalFileRegistry,
    outputs: LocalOutputRegistry,
    timeoutMs: number,
    registerTemporaryImports: (ids: string[]) => void
): Promise<ExecutedOperation> {
    if (operation.kind === 'command') {
        return { result: await broker.execute(operation.command, timeoutMs), temporaryImportIds: [] };
    }

    if (operation.kind === 'export') {
        const output = await outputs.registerDirectory(operation.directory);
        return {
            result: await broker.execute(
                {
                    type: 'track.export',
                    indexes: operation.indexes,
                    outputHandle: output.handle,
                    convertToWav: operation.convertToWav,
                },
                timeoutMs
            ),
            temporaryImportIds: [],
        };
    }

    const staged = await Promise.all(operation.paths.map((filePath) => stageLocalAudioImport(files, filePath)));
    const added = await broker.execute(
        {
            type: 'import.add',
            inputs: staged.map((file) => file.input),
        },
        timeoutMs
    );
    if (!added.ok || !added.importQueue) return { result: added, temporaryImportIds: [] };

    const ids = added.importQueue.items.slice(-staged.length).map((item) => item.id);
    registerTemporaryImports(ids);
    const format = operation.codec && operation.bitrate ? { codec: operation.codec, bitrate: operation.bitrate } : undefined;
    const preview = await broker.execute(
        {
            type: 'import.preview',
            ids,
            format,
            expectedImportRevision: added.importQueue.revision,
        },
        timeoutMs
    );
    if (!preview.ok || !preview.importPreview) return { result: preview, temporaryImportIds: ids };
    return {
        result: await broker.execute(
            {
                type: 'import.write',
                ids,
                format,
                removeOnSuccess: true,
                expectedRevision: added.importQueue.revision,
                expectedDeviceSessionId: preview.importPreview.deviceSessionId,
                expectedDeviceRevision: preview.importPreview.deviceRevision,
            },
            timeoutMs
        ),
        temporaryImportIds: ids,
    };
}

async function waitForTask(broker: LocalBridgeBroker, task: TaskSnapshot, timeoutMs: number) {
    let current = task;
    while (current.status === 'queued' || current.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const result = await broker.execute({ type: 'task.get', id: current.id }, timeoutMs);
        if (!result.ok || !result.task) return result;
        current = result.task;
    }
    return { ok: true as const, task: current };
}

async function removeTemporaryImports(broker: LocalBridgeBroker, ids: string[], timeoutMs: number) {
    if (ids.length === 0 || !broker.isConnected()) return;
    const listed = await broker.execute({ type: 'import.list' }, timeoutMs);
    if (!listed.ok || !listed.importQueue) return;
    const existingIds = new Set(listed.importQueue.items.map((item) => item.id));
    const remainingIds = ids.filter((id) => existingIds.has(id));
    if (remainingIds.length > 0) await broker.execute({ type: 'import.remove', ids: remainingIds }, timeoutMs);
}

async function main() {
    const parsed = await parseArguments(process.argv.slice(2));
    if (parsed.showHelp || !parsed.operation) {
        console.log(help());
        return;
    }

    const files = new LocalFileRegistry();
    const outputs = new LocalOutputRegistry();
    const broker = new LocalBridgeBroker(files, outputs);
    const bridge = startLocalBridgeServer(broker, {
        host: '127.0.0.1',
        port: parsed.port,
        token: process.env.MINIDISC_BRIDGE_TOKEN,
        allowedOrigins: process.env.MINIDISC_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()),
    });

    let temporaryImportIds: string[] = [];
    try {
        await bridge.ready;
        console.error(`Waiting for the MiniDisc browser app on ws://${bridge.host}:${bridge.port}...`);
        await broker.waitForConnection(parsed.timeoutMs);
        const executed = await executeOperation(parsed.operation, broker, files, outputs, parsed.timeoutMs, (ids) => {
            temporaryImportIds = ids;
        });
        temporaryImportIds = executed.temporaryImportIds;
        let result = executed.result;
        if (result.ok && result.task && (result.task.status === 'queued' || result.task.status === 'running')) {
            result = await waitForTask(broker, result.task, parsed.timeoutMs);
        }
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok || (result.task && result.task.status !== 'succeeded')) process.exitCode = 1;
    } finally {
        try {
            await removeTemporaryImports(broker, temporaryImportIds, parsed.timeoutMs);
        } catch (error) {
            console.error(`Could not remove temporary imports: ${error instanceof Error ? error.message : String(error)}`);
        }
        files.clear();
        await Promise.allSettled([bridge.close(), outputs.close()]);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
