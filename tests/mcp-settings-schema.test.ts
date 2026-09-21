import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mcpSettingKeys, mcpSettingsChangesSchema } from '../bridge/settings-schema.ts';
import type { UserSettings } from '../src/application/settings-store.ts';

const expectedKeys = [
    'audioEncoderId',
    'audioExportService',
    'audioExportServiceConfig',
    'colorTheme',
    'factoryModeNERAWDownload',
    'factoryModeUseSlowerExploit',
    'fullWidthSupport',
    'notifyWhenFinished',
    'trackTitleFormat',
    'uiLanguage',
    'uploadFormat',
] satisfies (keyof UserSettings)[];

describe('MCP settings schema', () => {
    it('covers every current shared setting and accepts the bilingual preference', () => {
        assert.deepEqual(mcpSettingKeys, [...expectedKeys].sort());
        assert.deepEqual(mcpSettingsChangesSchema.parse({ uiLanguage: 'zh-CN' }), { uiLanguage: 'zh-CN' });
        assert.deepEqual(mcpSettingsChangesSchema.parse({ audioEncoderId: null }), { audioEncoderId: null });
    });

    it('rejects retired and unknown preferences instead of silently stripping them', () => {
        assert.equal(mcpSettingsChangesSchema.safeParse({ vintageMode: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ factoryModeShortcuts: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ archiveDiscCreateZip: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ pageFullHeight: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ factoryBadSectorRememberChoice: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ discProtectedDialogDisabled: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ onlineServicesEnabled: true }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ recognitionImportMethod: 'line-in' }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({ uiLanguage: 'fr' }).success, false);
        assert.equal(mcpSettingsChangesSchema.safeParse({}).success, false);
    });
});
