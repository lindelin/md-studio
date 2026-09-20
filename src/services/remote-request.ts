export async function retryRemoteRequest<T>(
    label: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: { attempts?: number; timeoutMs?: number } = {}
): Promise<T> {
    const attempts = options.attempts ?? 3;
    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
        throw new Error('Remote request attempts must be a whole number from 1 to 10.');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
        throw new Error('Remote request timeout must be a positive number of milliseconds.');
    }

    let lastMessage = 'Unknown error.';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await operation(controller.signal);
        } catch (error) {
            lastMessage = controller.signal.aborted
                ? `Timed out after ${timeoutMs} ms.`
                : error instanceof Error
                  ? error.message
                  : String(error);
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new Error(`${label} failed after ${attempts} attempts. ${lastMessage}`);
}
