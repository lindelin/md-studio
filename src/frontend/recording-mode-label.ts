export function recordingModeLabel(format?: { codec: string; bitrate: number } | string | null): string {
    if (!format) return 'Auto';
    const codec = typeof format === 'string' ? format : format.codec;
    if (codec === 'SPS' || codec === 'SP') return 'SP';
    if (codec === 'SPM') return 'SP Mono';
    if (codec === 'LP2' || (codec === 'AT3' && typeof format !== 'string' && format.bitrate === 132)) return 'LP2';
    if (codec === 'LP4' || (codec === 'AT3' && typeof format !== 'string' && format.bitrate === 66)) return 'LP4';
    if (codec === 'AT3') return `ATRAC3${typeof format === 'string' ? '' : ` ${format.bitrate} kbps`}`;
    return typeof format === 'string' ? codec : `${codec} ${format.bitrate} kbps`;
}
