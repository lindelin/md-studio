export type WorkbenchDraftField = 'title' | 'album' | 'artist' | 'fullWidthTitle';

export interface SelectionModifiers {
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}

export interface OrderedSelection<T> {
    selection: T[];
    anchor: T;
    primary: T;
}

export function updateOrderedSelection<T>(
    current: T[],
    ordered: T[],
    target: T,
    anchor: T | null,
    modifiers: SelectionModifiers
): OrderedSelection<T> {
    if (!ordered.includes(target)) throw new Error('The selected item is not present in the current view.');

    if (modifiers.shiftKey && anchor !== null) {
        const anchorIndex = ordered.indexOf(anchor);
        const targetIndex = ordered.indexOf(target);
        if (anchorIndex !== -1) {
            const start = Math.min(anchorIndex, targetIndex);
            const end = Math.max(anchorIndex, targetIndex);
            return {
                selection: Array.from(new Set([...current, ...ordered.slice(start, end + 1)])),
                anchor: target,
                primary: target,
            };
        }
    }

    if (modifiers.ctrlKey || modifiers.metaKey) {
        const selection = current.includes(target) ? current.filter((item) => item !== target) : [...current, target];
        return { selection, anchor: target, primary: selection.includes(target) ? target : selection[0] ?? target };
    }

    return { selection: [target], anchor: target, primary: target };
}

export interface MetadataDraft {
    title: string;
    album: string;
    artist: string;
    fullWidthTitle: string;
}

export function buildBatchMetadataUpdates<T>(
    targets: T[],
    primary: T,
    dirtyFields: WorkbenchDraftField[],
    draft: MetadataDraft,
    sharedFields: WorkbenchDraftField[] = ['album', 'artist']
) {
    const orderedTargets = Array.from(new Set([primary, ...targets]));
    return orderedTargets.flatMap((target) => {
        const fields = target === primary ? dirtyFields : dirtyFields.filter((field) => sharedFields.includes(field));
        if (fields.length === 0) return [];
        return [
            {
                target,
                changes: Object.fromEntries(fields.map((field) => [field, draft[field]])) as Partial<MetadataDraft>,
            },
        ];
    });
}
