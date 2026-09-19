import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDirectory = path.join(repositoryRoot, 'public', 'runtime');

function git(args, fallback) {
    const result = spawnSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() : fallback;
}

function countChangedLines(diff) {
    return diff.split(/\r?\n/).reduce((total, row) => {
        if (!row) return total;
        const [added, removed] = row.split('\t');
        const parsedAdded = Number.parseInt(added, 10);
        const parsedRemoved = Number.parseInt(removed, 10);
        return total + (Number.isFinite(parsedAdded) ? parsedAdded : 0) + (Number.isFinite(parsedRemoved) ? parsedRemoved : 0);
    }, 0);
}

async function copyRuntimeAsset(sourceSegments, destinationName) {
    const source = path.join(repositoryRoot, ...sourceSegments);
    const destination = path.join(runtimeDirectory, destinationName);
    const sourceInfo = await stat(source).catch(() => null);
    if (!sourceInfo?.isFile()) {
        throw new Error(`Required runtime asset is missing: ${path.relative(repositoryRoot, source)}`);
    }
    await copyFile(source, destination);
    const destinationInfo = await stat(destination);
    if (destinationInfo.size !== sourceInfo.size) {
        throw new Error(`Runtime asset copy was incomplete: ${destinationName}`);
    }
}

await mkdir(runtimeDirectory, { recursive: true });
await Promise.all([
    copyRuntimeAsset(['node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'worker.min.js'], 'ffmpeg-worker.min.js'),
    copyRuntimeAsset(['node_modules', 'recorderjs', 'recorderWorker.js'], 'recorder-worker.js'),
]);

const unstagedDiff = git(['diff', '--numstat'], '');
const stagedDiff = git(['diff', '--cached', '--numstat'], '');
const at3reJavascript = await stat(path.join(repositoryRoot, 'public', 'at3re-harness.js')).catch(() => null);
const at3reWasm = await stat(path.join(repositoryRoot, 'public', 'at3re-harness.wasm')).catch(() => null);
const versionInfo = [
    '// This file has been auto-generated. Please do not modify.',
    `export const GIT_HASH = ${JSON.stringify(git(['rev-parse', '--short', 'HEAD'], 'unknown'))};`,
    `export const GIT_DIFF = ${JSON.stringify(String(countChangedLines(`${unstagedDiff}\n${stagedDiff}`)))};`,
    `export const BUILD_DATE = ${JSON.stringify(new Date().toISOString())};`,
    `export const ATRACOS_INCLUDED = ${Number((await stat(path.join(repositoryRoot, 'public', 'atrac3vm', 'system.cmi')).catch(() => null))?.isFile() ?? false)};`,
    `export const AT3RE_INCLUDED = ${Number(Boolean(at3reJavascript?.isFile() && at3reWasm?.isFile()))};`,
    '',
].join('\n');

await writeFile(path.join(repositoryRoot, 'src', 'version-info.ts'), versionInfo, 'utf8');
console.log('Prepared browser runtime assets and build metadata.');
