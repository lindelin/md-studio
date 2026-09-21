import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface DesktopPreferences { mcpEnabled: boolean; mcpToken: string }
export async function saveDesktopPreferences(folder: string, value: DesktopPreferences) {
    await mkdir(folder, { recursive: true });
    const path = join(folder, 'desktop-preferences.json');
    await writeFile(path + '.tmp', JSON.stringify(value), { mode: 0o600 });
    await rename(path + '.tmp', path);
}
export async function loadDesktopPreferences(folder: string): Promise<DesktopPreferences> {
    try {
        const value = JSON.parse(await readFile(join(folder, 'desktop-preferences.json'), 'utf8'));
        if (typeof value.mcpEnabled !== 'boolean' || !/^[a-f0-9]{48}$/.test(value.mcpToken)) throw new Error('Invalid desktop preferences');
        return { mcpEnabled: value.mcpEnabled, mcpToken: value.mcpToken };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const value = { mcpEnabled: false, mcpToken: randomBytes(24).toString('hex') };
        await saveDesktopPreferences(folder, value);
        return value;
    }
}
