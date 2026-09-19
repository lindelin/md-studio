import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeSessionEndingCommand } from '../src/application/device-session-transition.ts';
import type { ApplicationClient } from '../src/application/application-client.ts';
import type { CommandResult } from '../src/application/command-bus.ts';

type TransitionClient = Pick<ApplicationClient, 'execute' | 'disconnectLocalDevice'>;

describe('executeSessionEndingCommand', () => {
    it('keeps the session attached until the device command finishes', async () => {
        const events: string[] = [];
        let finishCommand!: (result: CommandResult) => void;
        const commandResult = new Promise<CommandResult>((resolve) => {
            finishCommand = resolve;
        });
        const client: TransitionClient = {
            execute: async () => {
                events.push('command-started');
                const result = await commandResult;
                events.push('command-finished');
                return result;
            },
            disconnectLocalDevice: async (finalize) => {
                events.push(`disconnect:${String(finalize)}`);
            },
        };

        const transition = executeSessionEndingCommand(client, {
            type: 'advanced.runTetris',
            confirmation: { confirmed: true },
        });
        await Promise.resolve();
        assert.deepEqual(events, ['command-started']);

        finishCommand({ ok: true });
        await transition;

        assert.deepEqual(events, ['command-started', 'command-finished', 'disconnect:false']);
    });

    it('preserves a failed command and leaves the session available for recovery', async () => {
        let disconnected = false;
        const client: TransitionClient = {
            execute: async () => ({
                ok: false,
                error: { code: 'DEVICE_IO', message: 'The device rejected the mode change.' },
            }),
            disconnectLocalDevice: async () => {
                disconnected = true;
            },
        };

        await assert.rejects(
            executeSessionEndingCommand(client, {
                type: 'advanced.enterServiceMode',
                confirmation: { confirmed: true },
            }),
            /rejected the mode change/
        );
        assert.equal(disconnected, false);
    });
});
