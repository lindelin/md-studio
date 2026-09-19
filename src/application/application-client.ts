import type { ApplicationCommand, CommandResult } from './command-bus';
import type { ImportQueue, ImportQueueInput, ImportQueueSnapshot } from './import-queue';
import type { WorkspaceSnapshot, WorkspaceStore } from './workspace-store';

export interface ApplicationCommandExecutor {
    execute(command: ApplicationCommand): Promise<CommandResult>;
}

export interface ApplicationClient {
    execute(command: ApplicationCommand): Promise<CommandResult>;
    addLocalImports(inputs: ImportQueueInput[], expectedRevision?: number): ImportQueueSnapshot;
    getWorkspaceSnapshot(): WorkspaceSnapshot;
    subscribe(listener: () => void): () => void;
}

export class InProcessApplicationClient implements ApplicationClient {
    constructor(
        private readonly commands: ApplicationCommandExecutor,
        private readonly workspace: WorkspaceStore,
        private readonly localImports: Pick<ImportQueue, 'add'>
    ) {}

    execute = (command: ApplicationCommand) => this.commands.execute(command);
    addLocalImports = (inputs: ImportQueueInput[], expectedRevision?: number) =>
        this.localImports.add(inputs, expectedRevision);
    getWorkspaceSnapshot = this.workspace.getSnapshot;
    subscribe = this.workspace.subscribe;
}
