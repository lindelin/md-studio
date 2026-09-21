import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { resolveUiLanguage, translate, hasJapaneseTranslation, localizeJapanese } from '../src/i18n.ts';

describe('Japanese interface', () => {
    it('resolves Japanese system locales and keeps explicit choices', () => {
        assert.equal(resolveUiLanguage('system', 'ja-JP'), 'ja');
        assert.equal(resolveUiLanguage('en', 'ja-JP'), 'en');
        assert.equal(resolveUiLanguage('ja', 'zh-CN'), 'ja');
        assert.equal(translate('ja', 'Settings'), '設定');
        assert.equal(localizeJapanese('ja', 'Write 4 tracks to MiniDisc'), '4 曲を MD に書き込み');
        assert.equal(translate('ja', 'ERASE DISC'), 'ERASE DISC');
        assert.equal(translate('ja', 'Sony MZ-N920'), 'Sony MZ-N920');
    });

    it('covers literal messages in UI translation calls and settings feedback', () => {
        const missing: string[] = [];
        for (const file of ts.sys.readDirectory('src/components', ['.tsx'], [], [])) {
            const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            const walk = (node: ts.Node) => {
                if (ts.isCallExpression(node)) {
                    const name = node.expression.getText(source);
                    const argument = ['t', 'runtimeTranslate'].includes(name) ? node.arguments[0]
                        : ['translate', 'text', 'labelText', 'localizeJapanese', 'apply'].includes(name) ? node.arguments[1] : undefined;
                    if (argument && ts.isStringLiteral(argument) && !hasJapaneseTranslation(argument.text)) missing.push(`${file}: ${argument.text}`);
                }
                ts.forEachChild(node, walk);
            };
            walk(source);
        }
        assert.deepEqual(missing, []);
    });
});
