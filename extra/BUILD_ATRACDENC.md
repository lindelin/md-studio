# Rebuilding the Atracdenc browser runtime

`public/atracdenc.js` is built from open-source Atracdenc and libsndfile sources. The checked-in runtime is reproducible on Windows with the pinned toolchain and source revisions below.

| Component | Revision |
|---|---|
| Atracdenc | `e16e9c60a18e4b914f5cb16463ed781f09808a25` |
| libsndfile | `4bdd7414602946a18799b514001b0570e8693a47` |
| emsdk | `27b23d467d5b8beb73d4d325b9a32c8eb77e8f95` |
| Emscripten | `1.39.18` (`1914a1543f08cd8e41f44c2bb05f7a90d1920275`) |
| CMake | `3.29.6` |
| Ninja | `1.12.1` |

Run from a PowerShell prompt with Git and Python available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rebuild-atracdenc.ps1
npm run runtime-assets:update
npm run runtime-assets:check
```

The script downloads only pinned revisions and checks the CMake and Ninja archives before use. It builds libsndfile without optional external codecs, removes Atracdenc's native endian probe because WebAssembly is little-endian, and links a modularized single-file Emscripten runtime. It refuses to replace `public/atracdenc.js` unless the result has SHA-256 `2fe122f4da021f84b3fa9c32b957f62c17e8da23b08d2d9ea602c74ab1f7c51b`.

Atracdenc and the linked libsndfile revision are licensed under LGPL-2.1-or-later. Their exact source revisions, this complete build procedure, and the application source are available together so a distributor can rebuild or replace the runtime.
