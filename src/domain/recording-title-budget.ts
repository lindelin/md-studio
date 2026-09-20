const TWO_UNIT_HALF_WIDTH_CHARACTERS = new Set(
    'ガギグゲゴザジズゼゾダヂヅデドバパビピブプベペボポヮヰヱヵヶヴヽヾがぎぐげござじずぜぞだぢづでどばぱびぴぶぷべぺぼぽゎゐゑゕゖゔゝゞ'
);

export interface RecordingTitleBudget {
    halfWidth: number;
    fullWidth: number;
}

export interface AllocatedRecordingTitle {
    halfWidthTitle: string;
    fullWidthTitle: string;
    remaining: RecordingTitleBudget;
}

export class RecordingTitleCapacityError extends Error {
    constructor(kind: 'half-width' | 'full-width', available: number, required: number) {
        super(`The disc has ${available} ${kind} title units left, but the next track requires at least ${required}.`);
        this.name = 'RecordingTitleCapacityError';
    }
}

export function allocateRecordingTitle(
    halfWidthTitle: string,
    fullWidthTitle: string,
    available: RecordingTitleBudget,
    includeFullWidth: boolean,
    minimumUnits = 7
): AllocatedRecordingTitle {
    validateBudget(available);
    if (!Number.isInteger(minimumUnits) || minimumUnits < 0) throw new Error('Minimum title units must be non-negative.');
    if (available.halfWidth < minimumUnits) {
        throw new RecordingTitleCapacityError('half-width', available.halfWidth, minimumUnits);
    }
    if (available.fullWidth < minimumUnits) {
        throw new RecordingTitleCapacityError('full-width', available.fullWidth, minimumUnits);
    }

    const fittedHalfWidth = fitMeasuredPrefix(halfWidthTitle, floorToCell(available.halfWidth), measureHalfWidthTitle);
    const halfWidthUsed = Math.max(roundToCell(measureHalfWidthTitle(fittedHalfWidth)), minimumUnits);

    const fittedFullWidth = includeFullWidth
        ? fitMeasuredPrefix(fullWidthTitle, Math.min(floorToCell(available.fullWidth), 210), (value) => value.length * 2)
        : '';
    const fullWidthUsed = includeFullWidth
        ? Math.max(roundToCell(fittedFullWidth.length * 2), minimumUnits)
        : minimumUnits;

    return {
        halfWidthTitle: fittedHalfWidth,
        fullWidthTitle: fittedFullWidth,
        remaining: {
            halfWidth: available.halfWidth - halfWidthUsed,
            fullWidth: available.fullWidth - fullWidthUsed,
        },
    };
}

// NetMD stores the listed voiced, semi-voiced, and uncommon kana as two bytes.
// Keeping this protocol-sized measurement local avoids loading the complete
// netmd-js utility module (including its encryption and Shift-JIS tables) at startup.
export function measureHalfWidthTitle(title: string) {
    let length = title.length;
    for (const character of title) {
        if (TWO_UNIT_HALF_WIDTH_CHARACTERS.has(character)) length += 1;
    }
    return length;
}

function fitMeasuredPrefix(value: string, maximum: number, measure: (value: string) => number) {
    let fitted = '';
    for (const character of value) {
        const candidate = fitted + character;
        if (measure(candidate) > maximum) break;
        fitted = candidate;
    }
    return fitted;
}

function roundToCell(length: number) {
    return length === 0 ? 0 : Math.ceil(length / 7) * 7;
}

function floorToCell(length: number) {
    return Math.floor(length / 7) * 7;
}

function validateBudget(available: RecordingTitleBudget) {
    if (
        !Number.isInteger(available.halfWidth) ||
        available.halfWidth < 0 ||
        !Number.isInteger(available.fullWidth) ||
        available.fullWidth < 0
    ) {
        throw new Error('Title budgets must be non-negative whole numbers.');
    }
}
