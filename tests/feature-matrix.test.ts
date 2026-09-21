import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

function uniqueMatches(source: string, expression: RegExp) {
    return [...new Set([...source.matchAll(expression)].map((match) => match[1]))].sort();
}

describe('release feature matrix', () => {
    it('tracks every application command and friendly MCP tool', async () => {
        const [matrix, commands, mcpServer] = await Promise.all([
            readFile(new URL('../docs/FEATURE-MATRIX.md', import.meta.url), 'utf8'),
            readFile(new URL('../src/application/command-bus.ts', import.meta.url), 'utf8'),
            readFile(new URL('../bridge/mcp-server.ts', import.meta.url), 'utf8'),
        ]);
        const commandNames = uniqueMatches(commands, /type:\s*'([^']+)'/g);
        const toolNames = uniqueMatches(mcpServer, /registerTool\(\s*'([^']+)'/g);

        assert.equal(commandNames.length, 47);
        assert.equal(toolNames.length, 30);
        assert.deepEqual(commandNames.filter((name) => !matrix.includes(`\`${name}\``)), []);
        assert.deepEqual(toolNames.filter((name) => !matrix.includes(`\`${name}\``)), []);
    });
});
