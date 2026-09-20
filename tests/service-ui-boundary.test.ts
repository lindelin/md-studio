import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(filePath);
        return entry.isFile() && filePath.endsWith('.ts') ? [filePath] : [];
    });
}

describe('device service UI boundary', () => {
    it('does not open browser-native alert, confirm, or prompt dialogs', () => {
        const violations = sourceFiles(path.resolve('src/services')).flatMap((filePath) => {
            const source = readFileSync(filePath, 'utf8');
            return /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)
                ? [path.relative(process.cwd(), filePath)]
                : [];
        });

        assert.deepEqual(violations, []);
    });
});
