import type { ApplicationCommand, CommandResult } from './command-bus';
import type { WorkspaceSnapshot, WorkspaceStore } from './workspace-store';

export interface ApplicationCommandExecutor {
    execute(command: ApplicationCommand): Promise<CommandResult>;
}

export interface ApplicationClient {
    execute(command: ApplicationCommand): Promise<CommandResult>;
    getWorkspaceSnapshot(): WorkspaceSnapshot;
    subscribe(listener: () => void): () => void;
}

export class InProcessApplicationClient implements ApplicationClient {
    constructor(
        private readonly commands: ApplicationCommandExecutor,
        private readonly workspace: WorkspaceStore
    ) {}

    execute = (command: ApplicationCommand) => this.commands.execute(command);
    getWorkspaceSnapshot = this.workspace.getSnapshot;
    subscribe = this.workspace.subscribe;
}
