import { getATRACWAVEncoding } from '../../utils';

export interface ExpectedAtracEncoding {
    codec: string;
    bitrate: number;
}

export async function validateAndStripAtracEncoderOutput(
    source: ArrayBuffer,
    expected: ExpectedAtracEncoding,
    encoderName: string
) {
    if (expected.codec !== 'AT3' && expected.codec !== 'A3+') {
        throw new Error(`${encoderName} was asked to produce an unsupported ${expected.codec} format.`);
    }
    const encoding = await getATRACWAVEncoding(new File([source], 'encoded.wav'));
    if (!encoding) throw new Error(`${encoderName} returned an invalid ATRAC WAV file.`);
    if (encoding.format.codec !== expected.codec || encoding.format.bitrate !== expected.bitrate) {
        throw new Error(
            `${encoderName} returned ${encoding.format.codec} ${encoding.format.bitrate} kbps instead of ${expected.codec} ${expected.bitrate} kbps.`
        );
    }
    if (source.byteLength <= encoding.headerLength) {
        throw new Error(`${encoderName} returned an ATRAC WAV file without audio frames.`);
    }
    return source.slice(encoding.headerLength);
}
