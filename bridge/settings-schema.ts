import * as z from 'zod/v4';
import type { UserSettings } from '../src/application/settings-store.ts';

const settingsShape = {
    colorTheme: z.enum(['dark', 'light', 'system']).optional(),
    uiLanguage: z.enum(['system', 'en', 'zh-CN']).optional(),
    notifyWhenFinished: z.boolean().optional(),
    fullWidthSupport: z.boolean().optional(),
    factoryModeUseSlowerExploit: z.boolean().optional(),
    factoryModeNERAWDownload: z.boolean().optional(),
    audioEncoderId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable().optional(),
    audioExportService: z.number().int().nonnegative().optional(),
    audioExportServiceConfig: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    uploadFormat: z.record(z.string(), z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).optional(),
    trackTitleFormat: z
        .enum(['filename', 'title', 'album-title', 'artist-title', 'artist-album-title', 'title-artist'])
        .optional(),
} satisfies { [Key in keyof UserSettings]: z.ZodType<UserSettings[Key] | undefined> };

export const mcpSettingsChangesSchema = z
    .object(settingsShape)
    .strict()
    .refine((changes) => Object.keys(changes).length > 0, 'At least one setting is required.');

export const mcpSettingKeys = Object.freeze(Object.keys(settingsShape).sort());
