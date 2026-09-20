import { parseTOC, reconstructTOC, type ToC } from 'netmd-tocmanip';
import { RAW_TOC_BYTE_LENGTH, RAW_TOC_SECTOR_COUNT, RAW_TOC_SECTOR_SIZE } from './raw-toc-contract';

export const RAW_TOC_EDITOR_WRITABLE_SECTORS = 4;
export const RAW_TOC_CELL_LENGTH = 7;

export type RawTocEditorTab = 'position' | 'half-width-title' | 'timestamp' | 'full-width-title';

export const rawTocEditorTabs: { id: RawTocEditorTab; label: string; mapLabel: string; contentLabel: string }[] = [
    { id: 'position', label: 'Position', mapLabel: 'Track map', contentLabel: 'Fragments' },
    { id: 'half-width-title', label: 'Half-width titles', mapLabel: 'Title map', contentLabel: 'Title cells' },
    { id: 'timestamp', label: 'Timestamps', mapLabel: 'Timestamp map', contentLabel: 'Timestamps' },
    { id: 'full-width-title', label: 'Full-width titles', mapLabel: 'Full-width map', contentLabel: 'Title cells' },
];

export interface RawTocEditorDocument {
    source: Uint8Array;
    toc: ToC;
}

export function parseRawTocEditorData(data: Uint8Array): RawTocEditorDocument {
    if (data.byteLength !== RAW_TOC_BYTE_LENGTH) {
        throw new Error(`A raw TOC must contain exactly ${RAW_TOC_BYTE_LENGTH.toLocaleString()} bytes.`);
    }
    const source = new Uint8Array(data);
    const sectors = Array.from({ length: RAW_TOC_SECTOR_COUNT }, (_, index) =>
        source.slice(index * RAW_TOC_SECTOR_SIZE, (index + 1) * RAW_TOC_SECTOR_SIZE)
    );
    const toc = parseTOC(...sectors.slice(0, RAW_TOC_EDITOR_WRITABLE_SECTORS));
    validateTocShape(toc);
    return { source, toc };
}

export function reconstructRawTocEditorData(toc: ToC, reference: Uint8Array): Uint8Array {
    if (reference.byteLength !== RAW_TOC_BYTE_LENGTH) {
        throw new Error(`The reference TOC must contain exactly ${RAW_TOC_BYTE_LENGTH.toLocaleString()} bytes.`);
    }
    validateTocShape(toc);
    const sectors = reconstructTOC(toc, false);
    const output = new Uint8Array(reference);
    for (let index = 0; index < RAW_TOC_EDITOR_WRITABLE_SECTORS; index += 1) {
        const sector = sectors[index];
        if (!sector || sector.byteLength !== RAW_TOC_SECTOR_SIZE) {
            throw new Error(`TOC sector ${index} could not be reconstructed as ${RAW_TOC_SECTOR_SIZE} bytes.`);
        }
        output.set(sector, index * RAW_TOC_SECTOR_SIZE);
    }
    return output;
}

export function cloneRawToc(toc: ToC): ToC {
    return JSON.parse(JSON.stringify(toc)) as ToC;
}

export function getRawTocMap(toc: ToC, tab: RawTocEditorTab): number[] {
    if (tab === 'position') return toc.trackMap;
    if (tab === 'half-width-title') return toc.titleMap;
    if (tab === 'timestamp') return toc.timestampMap;
    return toc.fullWidthTitleMap;
}

export function escapeRawTocCell(value: number[]): string {
    return value
        .map((code) => {
            if (code === 0x5c) return '\\\\';
            if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
            return `\\${code.toString(16).padStart(2, '0')}`;
        })
        .join('');
}

export function parseEscapedRawTocCell(value: string): number[] {
    const output: number[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character !== '\\') {
            const code = character.charCodeAt(0);
            if (code > 0xff) throw new Error('Use hexadecimal escapes for values outside the byte range.');
            output.push(code);
            continue;
        }
        const next = value[index + 1];
        if (next === '\\') {
            output.push(0x5c);
            index += 1;
            continue;
        }
        const pair = value.slice(index + 1, index + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(pair)) throw new Error('Escapes must be two hexadecimal digits, for example \\00.');
        output.push(Number.parseInt(pair, 16));
        index += 2;
    }
    if (output.length !== RAW_TOC_CELL_LENGTH) {
        throw new Error(`A TOC title cell must contain exactly ${RAW_TOC_CELL_LENGTH} bytes; this value contains ${output.length}.`);
    }
    return output;
}

export function assertRawTocInteger(value: number, maximum: number, label: string): number {
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
        throw new Error(`${label} must be an integer from 0 to ${maximum}.`);
    }
    return value;
}

export function linkedRawTocContentIndices(toc: ToC, tab: RawTocEditorTab, mapIndex: number): number[] {
    const root = getRawTocMap(toc, tab)[mapIndex] ?? 0;
    if (tab === 'timestamp') return root === 0 ? [] : [root];
    const cells = tab === 'position' ? toc.trackFragmentList : tab === 'half-width-title' ? toc.titleCellList : toc.fullWidthTitleCellList;
    const linked: number[] = [];
    let index = root;
    while (index !== 0 && index < cells.length && !linked.includes(index)) {
        linked.push(index);
        index = cells[index].link;
    }
    return linked;
}

function validateTocShape(toc: ToC) {
    const arrays: [string, unknown[]][] = [
        ['track map', toc.trackMap],
        ['fragment list', toc.trackFragmentList],
        ['title map', toc.titleMap],
        ['title cell list', toc.titleCellList],
        ['timestamp map', toc.timestampMap],
        ['timestamp list', toc.timestampList],
        ['full-width title map', toc.fullWidthTitleMap],
        ['full-width title cell list', toc.fullWidthTitleCellList],
    ];
    for (const [label, value] of arrays) {
        if (!Array.isArray(value) || value.length !== 256) throw new Error(`The ${label} must contain exactly 256 entries.`);
    }
    for (const cell of [...toc.titleCellList, ...toc.fullWidthTitleCellList]) {
        if (!Array.isArray(cell.title) || cell.title.length !== RAW_TOC_CELL_LENGTH) {
            throw new Error(`Every TOC title cell must contain exactly ${RAW_TOC_CELL_LENGTH} bytes.`);
        }
    }
}
