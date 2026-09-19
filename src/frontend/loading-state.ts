export function updateLoadingOperations(current: number, operationStarted: boolean) {
    const normalized = Number.isInteger(current) && current > 0 ? current : 0;
    return operationStarted ? normalized + 1 : Math.max(0, normalized - 1);
}
