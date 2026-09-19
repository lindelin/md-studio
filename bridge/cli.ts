import { readFile } from 'node:fs/promises';
import type { ApplicationCommand } from '../src/application/command-bus.ts';
import { LocalBridgeBroker } from './broker.ts';
import { startLocalBridgeServer } from './websocket-server.ts';

function help() {
    return `MiniDisc workspace CLI

Usage:
  npm run cli -- status
  npm run cli -- tasks
  npm run cli -- imports
  npm run cli -- command '{"type":"playback.control","command":{"action":"play"}}'
  npm run cli -- --file command.json

Options:
  --port <number>       Local browser bridge port (default: 47123)
  --timeout <seconds>   Time to wait for the browser app (default: 30)
  --file <path>         Read an ApplicationCommand JSON object from a file
`;
}

interface ParsedArguments {
    command?: ApplicationCommand;
    port: number;
    timeoutMs: number;
    showHelp: boolean;
}

async function parseArguments(arguments_: string[]): Promise<ParsedArguments> {
    let port = Number(process.env.MINIDISC_BRIDGE_PORT ?? 47123);
    let timeoutMs = 30_000;
    let commandFile: string | undefined;
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
        positional.push(argument);
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a whole number from 1 to 65535.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Timeout must be a positive number of seconds.');

    let command: ApplicationCommand | undefined;
    if (commandFile) command = JSON.parse(await readFile(commandFile, 'utf8')) as ApplicationCommand;
    else if (positional[0] === 'status') command = { type: 'disc.refresh' };
    else if (positional[0] === 'tasks') command = { type: 'task.list' };
    else if (positional[0] === 'imports') command = { type: 'import.list' };
    else if (positional[0] === 'command' && positional[1]) command = JSON.parse(positional.slice(1).join(' ')) as ApplicationCommand;
    else if (positional.length > 0) throw new Error(`Unknown CLI command: ${positional[0]}`);

    return { command, port, timeoutMs, showHelp: command === undefined };
}

async function main() {
    const parsed = await parseArguments(process.argv.slice(2));
    if (parsed.showHelp || !parsed.command) {
        console.log(help());
        return;
    }

    const broker = new LocalBridgeBroker();
    const bridge = startLocalBridgeServer(broker, {
        host: '127.0.0.1',
        port: parsed.port,
        token: process.env.MINIDISC_BRIDGE_TOKEN,
        allowedOrigins: process.env.MINIDISC_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()),
    });

    try {
        console.error(`Waiting for the MiniDisc browser app on ws://${bridge.host}:${bridge.port}...`);
        await broker.waitForConnection(parsed.timeoutMs);
        const result = await broker.execute(parsed.command, parsed.timeoutMs);
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
    } finally {
        await bridge.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
