export function usesLegacyTaskPresentation(mainView: string, vintageMode: boolean) {
    return vintageMode || mainView !== 'MAIN';
}
