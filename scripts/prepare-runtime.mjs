import { copyFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDirectory = path.join(repositoryRoot, 'public', 'runtime');

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

console.log('Prepared browser runtime assets.');
