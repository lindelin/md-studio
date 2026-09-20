const modeAliases: Record<string, { codec: string; bitrate: number }> = {
    LP2: { codec: 'AT3', bitrate: 132 },
    LP105: { codec: 'AT3', bitrate: 105 },
    LP4: { codec: 'AT3', bitrate: 66 },
    SP: { codec: 'SPS', bitrate: 292 },
    MONO: { codec: 'SPM', bitrate: 146 },
};

export function normalizeCliRecordingFormat(codec: string, bitrate: number) {
    const normalizedCodec = codec.trim().toUpperCase();
    if (!normalizedCodec) throw new Error('Codec must not be empty.');

    const alias = modeAliases[normalizedCodec];
    if (!alias) return { codec: normalizedCodec, bitrate };
    if (bitrate !== alias.bitrate) {
        throw new Error(`${normalizedCodec} requires --bitrate ${alias.bitrate}.`);
    }
    return alias;
}
