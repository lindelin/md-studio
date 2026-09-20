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
    // Operation-level mutation capabilities. Keep metadataEdit above for
    // compatibility with older Remote NetMD servers and saved mocks; the
    // application gateway expands that legacy value to this complete set.
    discRename,
    trackRename,
    groupRename,
    groupCreate,
    groupDelete,
    trackDelete,
    trackMove,
    discErase,
}

export enum ExploitCapability {
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
