import type { ApplicationClient } from './application-client';
import type { ApplicationCommand, CommandResult } from './command-bus';

type SessionTransitionClient = Pick<ApplicationClient, 'execute' | 'disconnectLocalDevice'>;

export async function executeSessionEndingCommand(
    client: SessionTransitionClient,
    command: ApplicationCommand
): Promise<CommandResult> {
    const result = await client.execute(command);
    if (!result.ok) throw new Error(result.error.message);
    await client.disconnectLocalDevice(false);
    return result;
}
