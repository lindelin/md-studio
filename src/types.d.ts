declare module '@ffmpeg/ffmpeg';
declare module '@ffmpeg/ffmpeg/src/index';
declare module 'recorderjs';
declare module '*.svg' {
    const content: string;
    export default content;
}
declare module 'jconv';

interface ArrayBuffer {
    /**
     * A fake property to make TypeScript distinguish between ArrayBuffer and (U)int*Array
     */
    notTypedArray: undefined;
}

interface SharedArrayBuffer {
    /**
     * A fake property to make TypeScript distinguish between SharedArrayBuffer and (U)int*Array
     */
    notTypedArray: undefined;
}
