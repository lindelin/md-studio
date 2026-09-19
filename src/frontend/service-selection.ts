export function normalizeServiceSelection(serviceCount: number, selectedIndex: number) {
    return Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceCount ? selectedIndex : 0;
}
