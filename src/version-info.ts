interface BuildInfo {
    gitHash: string;
    gitDiff: string;
    buildDate: string;
    atracOsIncluded: number;
    at3reIncluded: number;
}

declare const __MINIDISC_BUILD_INFO__: BuildInfo | undefined;

const buildInfo: BuildInfo = typeof __MINIDISC_BUILD_INFO__ === 'undefined'
    ? {
          gitHash: 'development',
          gitDiff: '0',
          buildDate: 'development',
          atracOsIncluded: 0,
          at3reIncluded: 0,
      }
    : __MINIDISC_BUILD_INFO__;

export const GIT_HASH = buildInfo.gitHash;
export const GIT_DIFF = buildInfo.gitDiff;
export const BUILD_DATE = buildInfo.buildDate;
export const ATRACOS_INCLUDED = buildInfo.atracOsIncluded;
export const AT3RE_INCLUDED = buildInfo.at3reIncluded;
