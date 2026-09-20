import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repositoryRoot, 'RUNTIME_ASSETS.json');
const checkOnly = process.argv.includes('--check');
const releaseCheck = process.argv.includes('--release');

const definitions = [
    {
        path: 'public/assembler.wasm',
        role: 'NetMD exploit assembler',
        source: {
            kind: 'installed-package',
            package: 'netmd-exploits',
            path: 'node_modules/netmd-exploits/assembler.wasm',
            repository: 'https://github.com/asivery/netmd-exploits',
            license: 'GPL-2.0',
        },
    },
    {
        path: 'public/runtime/ffmpeg-worker.min.js',
        role: 'FFmpeg browser worker controller',
        source: {
            kind: 'installed-package',
            package: '@ffmpeg/ffmpeg',
            path: 'node_modules/@ffmpeg/ffmpeg/dist/worker.min.js',
            repository: 'https://github.com/ffmpegjs/ffmpeg.js',
            license: 'MIT',
        },
    },
    {
        path: 'public/runtime/recorder-worker.js',
        role: 'Recorder.js audio capture worker',
        source: {
            kind: 'installed-package',
            package: 'recorderjs',
            path: 'node_modules/recorderjs/recorderWorker.js',
            repository: 'https://github.com/mattdiamond/Recorderjs',
            license: 'MIT',
        },
    },
    {
        path: 'public/ffmpeg-core.js',
        role: 'Custom FFmpeg JavaScript runtime with MiniDisc audio format patches',
        source: {
            kind: 'repository-binary',
            repository: 'https://github.com/ffmpegjs/FFmpeg',
            revision: '0deba716e237a538',
            buildInstructions: 'extra/BUILD_FFMPEGJS.md',
            license: 'Review required: FFmpeg license depends on the exact build configuration',
        },
        reviewRequired: true,
    },
    {
        path: 'public/atracdenc.js',
        role: 'Open-source ATRAC encoder compiled as a single-file Emscripten module',
        source: {
            kind: 'repository-binary',
            repository: 'https://github.com/dcherednik/atracdenc',
            revision: 'e16e9c60a18e4b914f5cb16463ed781f09808a25',
            dependencies: {
                libsndfile: '4bdd7414602946a18799b514001b0570e8693a47',
            },
            toolchain: {
                emsdk: '27b23d467d5b8beb73d4d325b9a32c8eb77e8f95',
                emscripten: '1.39.18 (1914a1543f08cd8e41f44c2bb05f7a90d1920275)',
                cmake: '3.29.6',
                ninja: '1.12.1',
            },
            buildScript: 'scripts/rebuild-atracdenc.ps1',
            buildInstructions: 'extra/BUILD_ATRACDENC.md',
            license: 'LGPL-2.1-or-later (Atracdenc and linked libsndfile)',
        },
    },
    {
        path: 'public/atrac3vm/libv86.js',
        role: 'Patched v86 JavaScript runtime for the optional Atrac3OS encoder',
        source: {
            kind: 'repository-binary',
            repository: 'https://github.com/copy/v86',
            revision: 'b6c940d0d481a43d',
            buildInstructions: 'extra/atrac3vm/README.md',
            license: 'BSD-2-Clause',
        },
        optional: true,
        reviewRequired: true,
    },
    {
        path: 'public/atrac3vm/v86-patched.wasm',
        role: 'Patched v86 WebAssembly runtime for the optional Atrac3OS encoder',
        source: {
            kind: 'repository-binary',
            repository: 'https://github.com/copy/v86',
            revision: 'b6c940d0d481a43d',
            buildInstructions: 'extra/atrac3vm/README.md',
            license: 'BSD-2-Clause',
        },
        optional: true,
        reviewRequired: true,
    },
    {
        path: 'public/atrac3vm/seabios.bin',
        role: 'SeaBIOS image used by the optional Atrac3OS virtual machine',
        source: {
            kind: 'repository-binary',
            repository: 'https://www.seabios.org/',
            buildInstructions: 'extra/atrac3vm/README.md',
            license: 'Review required: exact SeaBIOS revision is not recorded',
        },
        optional: true,
        reviewRequired: true,
    },
    {
        path: 'public/atrac3vm/system.cmi',
        role: 'Optional Atrac3OS system image containing a separately supplied encoder',
        optional: true,
        source: {
            kind: 'local-build-output',
            buildInstructions: 'extra/atrac3os/README.md',
            license: 'Not distributed; redistribution review required before inclusion',
        },
        reviewRequired: true,
    },
    {
        path: 'public/atrac3vm/kernel.bin',
        role: 'Optional Atrac3OS kernel image',
        optional: true,
        source: {
            kind: 'local-build-output',
            buildInstructions: 'extra/atrac3os/README.md',
            license: 'Review required before redistribution',
        },
        reviewRequired: true,
    },
    {
        path: 'public/at3re-harness.js',
        role: 'Optional proprietary At3RE compatibility harness',
        optional: true,
        source: {
            kind: 'local-build-output',
            buildInstructions: 'extra/at3re-harness/CMakeLists.txt',
            license: 'Not distributed; redistribution review required before inclusion',
        },
        reviewRequired: true,
    },
    {
        path: 'public/at3re-harness.wasm',
        role: 'Optional proprietary At3RE compatibility WebAssembly module',
        optional: true,
        source: {
            kind: 'local-build-output',
            buildInstructions: 'extra/at3re-harness/CMakeLists.txt',
            license: 'Not distributed; redistribution review required before inclusion',
        },
        reviewRequired: true,
    },
];

async function hashFile(filePath) {
    const contents = await readFile(filePath);
    return {
        bytes: contents.byteLength,
        sha256: createHash('sha256').update(contents).digest('hex'),
    };
}

async function packageVersion(packageName) {
    const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'node_modules', packageName, 'package.json'), 'utf8'));
    return manifest.version;
}

async function discoverExecutableAssets(directory, prefix = 'public') {
    const entries = await readdir(directory, { withFileTypes: true });
    const discovered = [];
    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) discovered.push(...(await discoverExecutableAssets(absolutePath, relativePath)));
        else if (/\.(?:bin|cmi|js|wasm)$/i.test(entry.name)) discovered.push(relativePath);
    }
    return discovered;
}

const declaredPaths = new Set(definitions.map((definition) => definition.path));
const undeclaredPaths = (await discoverExecutableAssets(path.join(repositoryRoot, 'public'))).filter(
    (assetPath) => !declaredPaths.has(assetPath)
);
if (undeclaredPaths.length > 0) {
    throw new Error(`Executable public assets are missing provenance records: ${undeclaredPaths.join(', ')}`);
}

const assets = [];
for (const definition of definitions) {
    const absolutePath = path.join(repositoryRoot, ...definition.path.split('/'));
    const file = await hashFile(absolutePath).catch(() => null);
    if (!file && !definition.optional) throw new Error(`Required runtime asset is missing: ${definition.path}`);

    const source = { ...definition.source };
    if (source.buildInstructions) {
        await access(path.join(repositoryRoot, ...source.buildInstructions.split('/'))).catch(() => {
            throw new Error(`Build instructions are missing for ${definition.path}: ${source.buildInstructions}`);
        });
    }
    if (source.buildScript) {
        await access(path.join(repositoryRoot, ...source.buildScript.split('/'))).catch(() => {
            throw new Error(`Build script is missing for ${definition.path}: ${source.buildScript}`);
        });
    }
    if (source.package) source.version = await packageVersion(source.package);
    if (source.kind === 'installed-package' && file) {
        const sourceFile = await hashFile(path.join(repositoryRoot, ...source.path.split('/')));
        if (sourceFile.sha256 !== file.sha256) {
            throw new Error(`${definition.path} does not match its locked package source ${source.path}.`);
        }
    }

    assets.push({
        path: definition.path,
        role: definition.role,
        present: Boolean(file),
        ...(file ?? {}),
        optional: definition.optional ?? false,
        reviewRequired: definition.reviewRequired ?? false,
        source,
    });
}

const manifest = {
    schemaVersion: 1,
    purpose: 'Checksums and provenance for executable browser runtime assets shipped by MiniDisc Workspace.',
    assets,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (releaseCheck) {
    const unresolved = assets.filter((asset) => asset.present && asset.reviewRequired).map((asset) => asset.path);
    if (unresolved.length > 0) {
        throw new Error(`Release contains runtime assets that still require provenance or license review: ${unresolved.join(', ')}`);
    }
}

if (checkOnly) {
    const current = await readFile(outputPath, 'utf8').catch(() => null);
    if (current !== serialized) {
        throw new Error('RUNTIME_ASSETS.json is stale. Run npm run runtime-assets:update.');
    }
    console.log(`Verified ${assets.filter((asset) => asset.present).length} runtime assets and ${assets.length} provenance records.`);
} else {
    await writeFile(outputPath, serialized, 'utf8');
    console.log(`Wrote ${path.basename(outputPath)} with ${assets.length} provenance records.`);
}
