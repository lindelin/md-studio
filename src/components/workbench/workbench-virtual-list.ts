export interface VirtualListWindow {
    start: number;
    end: number;
    offset: number;
    totalHeight: number;
    virtualized: boolean;
}

function finiteNonNegative(value: number, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function calculateVirtualListWindow({
    itemCount,
    rowHeight,
    scrollTop,
    viewportHeight,
    overscan = 5,
    minimumItemCount = 80,
}: {
    itemCount: number;
    rowHeight: number;
    scrollTop: number;
    viewportHeight: number;
    overscan?: number;
    minimumItemCount?: number;
}): VirtualListWindow {
    const count = Math.max(0, Math.floor(finiteNonNegative(itemCount)));
    const height = Math.max(1, finiteNonNegative(rowHeight, 1));
    const totalHeight = count * height;
    if (count <= Math.max(0, Math.floor(finiteNonNegative(minimumItemCount)))) {
        return { start: 0, end: count, offset: 0, totalHeight, virtualized: false };
    }

    const safeOverscan = Math.max(0, Math.floor(finiteNonNegative(overscan)));
    const safeScrollTop = Math.min(finiteNonNegative(scrollTop), Math.max(0, totalHeight - height));
    const safeViewportHeight = Math.max(height, finiteNonNegative(viewportHeight, height * 10));
    const firstVisible = Math.floor(safeScrollTop / height);
    const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / height));
    const start = Math.max(0, firstVisible - safeOverscan);
    const end = Math.min(count, firstVisible + visibleCount + safeOverscan);
    return { start, end, offset: start * height, totalHeight, virtualized: true };
}

export function scrollOffsetForVirtualIndex({
    index,
    itemCount,
    rowHeight,
    scrollTop,
    viewportHeight,
}: {
    index: number;
    itemCount: number;
    rowHeight: number;
    scrollTop: number;
    viewportHeight: number;
}) {
    const count = Math.max(0, Math.floor(finiteNonNegative(itemCount)));
    if (count === 0) return 0;
    const height = Math.max(1, finiteNonNegative(rowHeight, 1));
    const safeIndex = Math.min(count - 1, Math.max(0, Math.floor(finiteNonNegative(index))));
    const viewport = Math.max(height, finiteNonNegative(viewportHeight, height));
    const current = Math.min(finiteNonNegative(scrollTop), Math.max(0, count * height - viewport));
    const rowTop = safeIndex * height;
    const rowBottom = rowTop + height;
    if (rowTop < current) return rowTop;
    if (rowBottom > current + viewport) return Math.max(0, rowBottom - viewport);
    return current;
}
