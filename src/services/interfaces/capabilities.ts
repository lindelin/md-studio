/**
 * Runtime capability identifiers shared by the UI and every device adapter.
 *
 * Keep this module dependency-free: reading device state or rendering controls
 * must not load the USB, HiMD, exploit, or encryption implementations.
 */
export enum Capability {
    contentList,
    playbackControl,
    metadataEdit,
    trackUpload,
    trackDownload,
    discEject,
    factoryMode,
    himdTitles,
    fullWidthSupport,
    nativeMonoUpload,
    himdFormat,
}

export enum ExploitCapability {
    runTetris,
    flushUTOC,
    downloadAtrac,
    readFirmware,
    spUploadSpeedup,
    uploadAtrac1,
    himdFullMode,
    readRam,
    uploadMonoSP,
    disableDiscSwapDetection,
    enterServiceMode,
}
