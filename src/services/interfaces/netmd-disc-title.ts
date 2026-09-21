import type { NetMDInterface } from 'netmd-js';
import { sanitizeHalfWidthTitle, sanitizeFullWidthTitle } from 'netmd-js/dist/utils';

export function replaceDiscTitle(raw: string, title: string, fullWidth: boolean): string {
    const separator = fullWidth ? '／／' : '//';
    const prefix = fullWidth ? '０；' : '0;';
    if (!raw.includes(separator)) return title;
    const groups = raw.startsWith(prefix) ? raw.slice(raw.indexOf(separator) + separator.length) : raw;
    return (title ? prefix + title + separator : '') + groups;
}

export async function renameDiscPreservingGroups(
    device: Pick<NetMDInterface, '_getDiscTitle' | 'setDiscTitle'>,
    title: string,
    fullWidthTitle?: string
) {
    const raw = await device._getDiscTitle();
    const rawFullWidth = fullWidthTitle === undefined ? undefined : await device._getDiscTitle(true);
    if (rawFullWidth !== undefined) {
        const next = replaceDiscTitle(rawFullWidth, sanitizeFullWidthTitle(fullWidthTitle!), true);
        if (next !== rawFullWidth) await device.setDiscTitle(next, true);
    }
    const next = replaceDiscTitle(raw, sanitizeHalfWidthTitle(title), false);
    if (next !== raw) await device.setDiscTitle(next);
}
