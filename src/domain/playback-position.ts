export interface WaitForTrackReadyOptions {
    timeoutMs?: number;
    pollIntervalMs?: number;
    isCancelled?: () => boolean;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
}

export async function waitForTrackReady(
    trackIndex: number,
    readPosition: () => Promise<number[] | null>,
    options: WaitForTrackReadyOptions = {}
): Promise<'ready' | 'cancelled'> {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const pollIntervalMs = options.pollIntervalMs ?? 250;
    const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const now = options.now ?? Date.now;
    const deadline = now() + timeoutMs;

    while (now() <= deadline) {
        if (options.isCancelled?.()) return 'cancelled';
        const position = await readPosition();
        if (
            position !== null &&
            position.length >= 4 &&
            position[0] === trackIndex &&
            position[1] === 0 &&
            position[2] === 0 &&
            position[3] >= 1
        ) {
            return 'ready';
        }
        await sleep(pollIntervalMs);
    }
    throw new Error(`Timed out waiting for track ${trackIndex + 1} to start playing.`);
}
