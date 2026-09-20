export type HiMDCodecName = 'PCM' | 'AT3' | 'MP3' | 'A3+';

// Hi-MD frame sizes are protocol constants. Keeping this small table in the
// domain layer lets import inspection run without loading the full USB,
// filesystem, encryption, and metadata implementation from himd-js.
export const HI_MD_KBPS_TO_FRAME_SIZE = Object.freeze({
    atrac3: Object.freeze({
        66: 192,
        105: 304,
        132: 384,
    }),
    atrac3plus: Object.freeze({
        32: 192,
        48: 280,
        64: 376,
        192: 1120,
        256: 1488,
        352: 2048,
    }),
});
