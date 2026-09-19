# MiniDisc Workspace notices

MiniDisc Workspace is an independent project derived from Web MiniDisc Pro. It is distributed under the GNU General Public License version 2.0; the complete license text is in `LICENSE`.

## Project lineage

- Web MiniDisc Pro by Asivery and contributors: <https://github.com/asivery/webminidisc>
- Web MiniDisc by Christian Heckendorf and contributors: <https://github.com/cybercase/webminidisc>

The repository retains the upstream Git history so individual authorship and changes remain inspectable. References to the upstream repositories in the About screen, changelog, and source links are attribution, not an active remote or a claim that upstream maintains this project.

## Protocol and device libraries

The application depends on the following projects, among others:

- netmd-js: <https://github.com/cybercase/netmd-js>
- netmd-exploits: <https://github.com/asivery/netmd-exploits>
- netmd-tocmanip: <https://github.com/asivery/netmd-tocmanip>
- himd-js: <https://github.com/asivery/himd-js>
- networkwm-js: <https://github.com/asivery/networkwm-js>
- linux-minidisc research and tooling: <https://github.com/linux-minidisc/linux-minidisc>

Each dependency remains under its own license. Exact resolved versions are recorded in `package-lock.json`; installed package metadata and license files are the authoritative notices for a particular build.

`THIRD_PARTY_LICENSES.md` is a generated inventory of every resolved npm package entry, including transitive and development dependencies. Regenerate it with `npm run licenses:update`; `npm run licenses:check` verifies that it matches the lockfile and installed package metadata.

## Audio and browser runtimes

The browser build uses or can use FFmpeg, Atracdenc, v86, Recorder.js, and related runtime assets. Some assets are copied from installed npm packages during `npm run prepare-runtime`; others are retained from the upstream Web MiniDisc Pro distribution. Their licenses and source projects must be reviewed when publishing binary or hosted distributions:

- FFmpeg: <https://ffmpeg.org/>
- Atracdenc: <https://github.com/dcherednik/atracdenc>
- v86: <https://github.com/copy/v86>
- Recorder.js: <https://github.com/mattdiamond/Recorderjs>

Do not remove copyright notices or license files from redistributed dependencies. A release process should archive the exact source revision, dependency lock file, build instructions, and any corresponding-source material required by the licenses of bundled binaries.

## Sony trademarks

MiniDisc, NetMD, Hi-MD, and Sony product names identify compatible formats and hardware. This project is not affiliated with or endorsed by Sony.
