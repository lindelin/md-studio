import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { hasChineseTranslation } from '../src/i18n.ts';

function componentFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return componentFiles(filePath);
        return entry.isFile() && entry.name.endsWith('.tsx') ? [filePath] : [];
    });
}

describe('UI translation coverage', () => {
    it('provides Chinese translations for static strings passed to t()', () => {
        const missing: string[] = [];
        for (const filePath of componentFiles(path.resolve('src/components'))) {
            const source = readFileSync(filePath, 'utf8');
            for (const match of source.matchAll(/\bt\(\s*(['"])(.*?)\1\s*\)/g)) {
                const message = match[2].replace(/\\\\/g, '\\');
                if (!hasChineseTranslation(message)) missing.push(`${path.relative(process.cwd(), filePath)}: ${message}`);
            }
        }

        assert.deepEqual(missing, []);
    });
});
