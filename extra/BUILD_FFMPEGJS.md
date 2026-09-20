# Rebuilding the FFmpeg browser runtime

`public/ffmpeg-core.js` is a single-file Emscripten build used for local, browser-side audio decoding and conversion. End-user machines do not need FFmpeg or Emscripten installed.

On Windows, run this command from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/rebuild-ffmpeg.ps1
```

The script downloads or checks out every input at an exact revision, verifies downloaded tool archives, applies `extra/aeafix.patch`, builds the runtime, checks the expected SHA-256, and only then replaces `public/ffmpeg-core.js`. Git for Windows, Git Bash, Python, and `curl.exe` are required. CMake, GNU Make, Emscripten, FFmpeg, zlib, and LAME are provisioned in `.runtime-build/ffmpeg`.

Pinned inputs:

- `ffmpegwasm/ffmpeg.wasm-core` at `0deba716e237a5382f1b69320d093483df1d1d5b`
- zlib at `cacf7f1d4e3d44d871b605da3b647f07d718623f`
- zlargon/lame at `59a722d49e9f2bea65917dcdd17b94c710a02f0c`
- emsdk at `27b23d467d5b8beb73d4d325b9a32c8eb77e8f95`
- Emscripten 1.39.0, mapped by that emsdk revision to `d57bfdd6d43181501bbd3fab502d57c9073ceb49`
- CMake 3.29.6 and GNU Make 4.4.1 archives with checksums embedded in the script

The tracked `extra/build-ffmpeg-core.sh` is the canonical audio-only configuration. It disables x264, post-processing, GPL mode, and all x86 CPU optimizations that Emscripten cannot execute. The explicit Linux target prevents Git Bash on Windows from making FFmpeg select Win32 runtime behavior. A fixed `/src/build` configuration prefix and relative compiler search paths keep the output independent of the checkout directory. The compatibility patch removes an invalid `noreturn` declaration from the browser port so a completed conversion returns normally. The resulting FFmpeg configuration reports `LGPL version 2.1 or later`; LAME is LGPL and zlib uses the zlib license.

After rebuilding, run the release checks and a browser conversion smoke test:

```text
npm run runtime-assets:update
npm run runtime-assets:release-check
npm test
npm run build
```

The smoke test used for the checked-in asset sends a short WAV through the CLI, browser FFmpeg worker, open-source Atracdenc, and byte-based MockMD. A task is accepted only after conversion output passes the ATRAC container, codec, bitrate, and frame validation already enforced by the application.
