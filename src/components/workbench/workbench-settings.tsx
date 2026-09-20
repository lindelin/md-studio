import React, { useCallback, useEffect, useState } from 'react';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { useDispatch, useShallowEqualSelector } from '../../frontend-utils';
import { actions as appActions } from '../../redux/app-feature';
import type { ServiceCatalogSnapshot, ServiceParameterDescriptor } from '../../application/service-catalog';
import type { CustomParameters } from '../../custom-parameters';
import type { UserSettings, UserSettingsUpdate } from '../../application/settings-store';
import type { SettingInterface } from '../../bridge-types';
import { useApplicationClient, useApplicationWorkspace, useUpdateApplicationSettings } from '../use-application-client';
import { areServiceParametersValid, createDefaultServiceParameters } from './workbench-model';
import { useI18n } from '../use-i18n';
import { resolveUiLanguage, translate, type ResolvedUiLanguage } from '../../i18n';

const titleFormats = [
    ['filename', 'File name'],
    ['title', 'Title'],
    ['album-title', 'Album · Title'],
    ['artist-title', 'Artist · Title'],
    ['artist-album-title', 'Artist · Album · Title'],
    ['title-artist', 'Title · Artist'],
] as const;

function sameParameters(left: CustomParameters, right: CustomParameters) {
    return JSON.stringify(left) === JSON.stringify(right);
}

const Toggle = ({
    checked,
    description,
    disabled,
    label,
    onChange,
}: {
    checked: boolean;
    description: string;
    disabled?: boolean;
    label: string;
    onChange(checked: boolean): void;
}) => (
    <label className={`workbench__settings-toggle ${disabled ? 'is-disabled' : ''}`}>
        <span><strong>{label}</strong><small>{description}</small></span>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <i aria-hidden="true"><CheckRoundedIcon /></i>
    </label>
);

const ServiceParameter = ({
    descriptor,
    onChange,
    value,
}: {
    descriptor: ServiceParameterDescriptor;
    onChange(value: string | number | boolean): void;
    value: string | number | boolean | undefined;
}) => {
    const { t } = useI18n();
    if (descriptor.type === 'boolean') {
        return <Toggle checked={Boolean(value)} description={t('Service-specific option')} label={t(descriptor.label)} onChange={onChange} />;
    }
    if (descriptor.type === 'enum') {
        return (
            <label className="workbench__settings-field"><span>{t(descriptor.label)}</span><select value={String(value ?? descriptor.defaultValue)} onChange={(event) => onChange(event.target.value)}>{descriptor.options?.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
        );
    }
    if (descriptor.type === 'hostFilePath' || descriptor.type === 'hostDirPath') {
        return (
            <div className="workbench__settings-field"><span>{t(descriptor.label)}</span><button className="secondary-button" onClick={() => void window.native?.openFileHostDialog?.([{ name: t('All files'), extensions: ['*'] }], descriptor.type === 'hostDirPath').then((path) => { if (path) onChange(path); })}><FolderOpenRoundedIcon />{value ? t('Change path') : t('Choose path')}</button><small>{String(value || t('No path selected'))}</small></div>
        );
    }
    return (
        <label className="workbench__settings-field"><span>{t(descriptor.label)}</span><input type={descriptor.type === 'number' ? 'number' : 'text'} value={String(value ?? descriptor.defaultValue)} onChange={(event) => onChange(descriptor.type === 'number' ? Number(event.target.value) : event.target.value)} /></label>
    );
};

const NativeSettings = () => {
    const { t } = useI18n();
    const [settings, setSettings] = useState<SettingInterface[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        if (!window.native?.getSettings) return () => { active = false; };
        void window.native.getSettings().then((items) => {
            if (active) setSettings(items);
        }).catch((cause) => {
            if (active) setError(cause instanceof Error ? cause.message : String(cause));
        });
        return () => { active = false; };
    }, []);

    if (!window.native?.getSettings || (!settings.length && !error)) return null;

    const update = async (index: number, value: boolean | string | number) => {
        setError(null);
        try {
            await settings[index].update(value);
            setSettings(await window.native!.getSettings!());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    const choosePath = async (index: number, directory: boolean) => {
        try {
            const selected = await window.native?.openFileHostDialog?.(
                [{ name: t('All files'), extensions: ['*'] }],
                directory
            );
            if (selected) await update(index, selected);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    return (
        <section className="workbench__settings-card">
            <span className="workbench__eyebrow">{t('DESKTOP')}</span>
            <h3>{t('Desktop integration')}</h3>
            {error ? <div className="workbench__settings-message is-error">{error}</div> : null}
            {settings.map((entry, index) => {
                const key = `${entry.family}:${entry.name}:${index}:${String(entry.state)}`;
                if (entry.type === 'boolean') {
                    return <Toggle key={key} checked={Boolean(entry.state)} label={t(entry.name)} description={t(entry.family)} onChange={(checked) => void update(index, checked)} />;
                }
                if (entry.type === 'action') {
                    return <div className="workbench__settings-field" key={key}><span>{t(entry.name)}</span><button className="secondary-button" onClick={() => void update(index, true)}>{t('Run')}</button><small>{t(entry.family)}</small></div>;
                }
                if (entry.type === 'hostFilePath' || entry.type === 'hostDirPath') {
                    return <div className="workbench__settings-field" key={key}><span>{t(entry.name)}</span><button className="secondary-button" onClick={() => void choosePath(index, entry.type === 'hostDirPath')}><FolderOpenRoundedIcon />{entry.state ? t('Change path') : t('Choose path')}</button><small>{String(entry.state || t('No path selected'))}</small></div>;
                }
                return <label className="workbench__settings-field" key={key}><span>{t(entry.name)}</span><input type={entry.type === 'number' ? 'number' : 'text'} defaultValue={String(entry.state)} onBlur={(event) => { const value = entry.type === 'number' ? Number(event.target.value) : event.target.value; if (value !== entry.state) void update(index, value); }} /><small>{t(entry.family)}</small></label>;
            })}
        </section>
    );
};

export const WorkbenchSettings = ({ onMessage }: { onMessage(message: string): void }) => {
    const { t } = useI18n();
    const dispatch = useDispatch();
    const client = useApplicationClient();
    const updateSettings = useUpdateApplicationSettings();
    const workspace = useApplicationWorkspace();
    const settings = workspace.settings.values;
    const localBridgeEnabled = useShallowEqualSelector((state) => state.appState.localBridgeEnabled);
    const [catalog, setCatalog] = useState<ServiceCatalogSnapshot | null>(null);
    const [encoderId, setEncoderId] = useState(settings.audioEncoderId);
    const [encoderParameters, setEncoderParameters] = useState<CustomParameters>(settings.audioExportServiceConfig);
    const [libraryIndex, setLibraryIndex] = useState(settings.libraryService);
    const [libraryParameters, setLibraryParameters] = useState<CustomParameters>(settings.libraryServiceConfig);
    const [bridgeEnabled, setBridgeEnabled] = useState(localBridgeEnabled);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let active = true;
        void client.execute({ type: 'services.get' }).then((result) => {
            if (!active) return;
            if (!result.ok || !result.services) {
                setStatus(result.ok ? t('The service catalog returned no data.') : result.error.message);
                return;
            }
            setCatalog(result.services);
            setEncoderId((current) => current ?? result.services!.audioEncoders[settings.audioExportService]?.id ?? null);
        });
        return () => { active = false; };
    }, [client, settings.audioExportService, t]);

    const apply = useCallback(async (changes: UserSettingsUpdate, successMessage: string, messageLanguage?: ResolvedUiLanguage) => {
        setBusy(true);
        setStatus(null);
        try {
            await updateSettings(changes);
            onMessage(messageLanguage ? translate(messageLanguage, successMessage) : t(successMessage));
        } catch (error) {
            setStatus(t(error instanceof Error ? error.message : String(error)));
        } finally {
            setBusy(false);
        }
    }, [onMessage, t, updateSettings]);

    const selectedEncoder = catalog?.audioEncoders.find((service) => service.id === encoderId);
    const selectedLibrary = libraryIndex === -1 ? undefined : catalog?.libraries[libraryIndex];
    const selectedEncoderIndex = selectedEncoder?.index ?? settings.audioExportService;
    const serviceChangesPending =
        encoderId !== (settings.audioEncoderId ?? catalog?.audioEncoders[settings.audioExportService]?.id ?? null) ||
        selectedEncoderIndex !== settings.audioExportService ||
        !sameParameters(encoderParameters, settings.audioExportServiceConfig) ||
        libraryIndex !== settings.libraryService ||
        !sameParameters(libraryParameters, settings.libraryServiceConfig) ||
        bridgeEnabled !== localBridgeEnabled;
    const serviceConfigurationValid =
        Boolean(selectedEncoder?.available) &&
        areServiceParametersValid(selectedEncoder, encoderParameters) &&
        (libraryIndex === -1 || areServiceParametersValid(selectedLibrary, libraryParameters));

    const updateBoolean = (key: keyof UserSettings, checked: boolean, message: string) => {
        void apply({ [key]: checked }, message);
    };

    const saveServices = async () => {
        if (!selectedEncoder || !serviceConfigurationValid) return;
        setBusy(true);
        setStatus(null);
        try {
            await updateSettings({
                audioEncoderId: selectedEncoder.id,
                audioExportService: selectedEncoder.index,
                audioExportServiceConfig: encoderParameters,
                libraryService: libraryIndex,
                libraryServiceConfig: libraryParameters,
            });
            if (bridgeEnabled !== localBridgeEnabled) dispatch(appActions.setLocalBridgeEnabled(bridgeEnabled));
            window.reload();
        } catch (error) {
            setStatus(t(error instanceof Error ? error.message : String(error)));
            setBusy(false);
        }
    };

    return (
        <section className="workbench__settings" aria-label={t('Settings')}>
            <header><div><span className="workbench__eyebrow">{t('PREFERENCES')}</span><h2>{t('Workspace settings')}</h2><p>{t('Changes are stored locally. Encoder, Library and automation changes reload the application.')}</p></div>{serviceChangesPending ? <button className="primary-button" disabled={busy || !serviceConfigurationValid} onClick={() => void saveServices()}><RestartAltRoundedIcon /> {t('Save and reload')}</button> : null}</header>
            {status ? <div className="workbench__settings-message is-error">{status}</div> : null}
            <div className="workbench__settings-columns">
                <div>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('APPEARANCE')}</span><h3>{t('Interface')}</h3><label className="workbench__settings-field"><span>{t('Language')}</span><select value={settings.uiLanguage} disabled={busy} onChange={(event) => { const uiLanguage = event.target.value as UserSettings['uiLanguage']; void apply({ uiLanguage }, 'Interface language updated.', resolveUiLanguage(uiLanguage)); }}><option value="system">{t('Follow browser language')}</option><option value="zh-CN">{t('Chinese (Simplified)')}</option><option value="en">{t('English')}</option></select></label><label className="workbench__settings-field"><span>{t('Color theme')}</span><select value={settings.colorTheme} disabled={busy} onChange={(event) => void apply({ colorTheme: event.target.value as UserSettings['colorTheme'] }, 'Color theme updated.')}><option value="system">{t('Use system theme')}</option><option value="dark">{t('Dark')}</option><option value="light">{t('Light')}</option></select></label></section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('WORKFLOW')}</span><h3>{t('Editing and notifications')}</h3><Toggle checked={settings.fullWidthSupport} disabled={busy} label={t('Full-width title editing')} description={t('Enable Hiragana, Kanji and full-width MiniDisc titles.')} onChange={(checked) => updateBoolean('fullWidthSupport', checked, 'Title editing preference updated.')} /><Toggle checked={!settings.discProtectedDialogDisabled} disabled={busy} label={t('Disc-protected warning')} description={t('Warn before operations on a protected disc.')} onChange={(checked) => updateBoolean('discProtectedDialogDisabled', !checked, 'Protection warning preference updated.')} /><Toggle checked={settings.notifyWhenFinished} disabled={busy} label={t('Completion notifications')} description={t('Show a notification when a background task finishes.')} onChange={(checked) => updateBoolean('notifyWhenFinished', checked, 'Notification preference updated.')} /></section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('METADATA')}</span><h3>{t('Default title rules')}</h3><label className="workbench__settings-field"><span>{t('Imported track title')}</span><select value={settings.trackTitleFormat} disabled={busy} onChange={(event) => void apply({ trackTitleFormat: event.target.value as UserSettings['trackTitleFormat'] }, 'Import title rule updated.')}>{titleFormats.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><label className="workbench__settings-field"><span>{t('Recognized track title')}</span><select value={settings.recognitionTrackTitleFormat} disabled={busy} onChange={(event) => void apply({ recognitionTrackTitleFormat: event.target.value as UserSettings['recognitionTrackTitleFormat'] }, 'Recognition title rule updated.')}>{titleFormats.filter(([value]) => value !== 'filename').map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><label className="workbench__settings-field"><span>{t('Recognition input')}</span><select value={settings.recognitionImportMethod} disabled={busy} onChange={(event) => void apply({ recognitionImportMethod: event.target.value as UserSettings['recognitionImportMethod'] }, 'Recognition input updated.')}><option value="line-in">{t('Line input')}</option><option value="exploits">{t('Direct device read')}</option></select></label></section>
                </div>
                <div>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('ENCODING')}</span><h3>{t('ATRAC encoder')}</h3><label className="workbench__settings-field"><span>{t('Encoder')}</span><select value={encoderId ?? ''} disabled={!catalog || busy} onChange={(event) => { const service = catalog?.audioEncoders.find((candidate) => candidate.id === event.target.value); setEncoderId(event.target.value); setEncoderParameters(createDefaultServiceParameters(service)); }}>{catalog?.audioEncoders.map((service) => <option key={service.id} value={service.id} disabled={!service.available}>{service.name}{service.available ? '' : ` · ${t('unavailable')}`}</option>)}</select></label>{selectedEncoder?.description ? <p className="workbench__settings-description">{t(selectedEncoder.description)}</p> : null}{selectedEncoder?.unavailableReason ? <div className="workbench__settings-message is-error">{t(selectedEncoder.unavailableReason)}</div> : null}{selectedEncoder?.parameters.map((parameter) => <ServiceParameter key={parameter.key} descriptor={parameter} value={encoderParameters[parameter.key]} onChange={(value) => setEncoderParameters((current) => ({ ...current, [parameter.key]: value }))} />)}</section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('LIBRARY')}</span><h3>{t('Music source')}</h3><label className="workbench__settings-field"><span>{t('Library service')}</span><select value={libraryIndex} disabled={!catalog || busy} onChange={(event) => { const index = Number(event.target.value); setLibraryIndex(index); if (index !== -1) setLibraryParameters(createDefaultServiceParameters(catalog?.libraries[index])); }}><option value={-1}>{t('None')}</option>{catalog?.libraries.map((service) => <option key={service.id} value={service.index} disabled={!service.available}>{service.name}</option>)}</select></label>{selectedLibrary?.description ? <p className="workbench__settings-description">{t(selectedLibrary.description)}</p> : null}{selectedLibrary?.parameters.map((parameter) => <ServiceParameter key={parameter.key} descriptor={parameter} value={libraryParameters[parameter.key]} onChange={(value) => setLibraryParameters((current) => ({ ...current, [parameter.key]: value }))} />)}</section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('AUTOMATION')}</span><h3>{t('Local MCP and CLI')}</h3><Toggle checked={bridgeEnabled} label={t('Enable local bridge')} description={t('Allow the loopback-only MCP server and CLI to control this browser session.')} onChange={setBridgeEnabled} /><p className="workbench__settings-description">{t('The bridge listens only on this computer. Saving this option reloads the app so the browser endpoint can attach cleanly.')}</p></section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">{t('ADVANCED')}</span><h3>{t('Homebrew tools')}</h3><Toggle checked={settings.factoryModeUseSlowerExploit} disabled={busy} label={t('Use slower ATRAC ripping exploit')} description={t('Compatibility option for devices that lock up during fast ripping.')} onChange={(checked) => updateBoolean('factoryModeUseSlowerExploit', checked, 'Ripping preference updated.')} /><Toggle checked={settings.factoryModeNERAWDownload} disabled={busy} label={t('Download raw NERAW streams')} description={t('Preserve sector layout for expert recovery work.')} onChange={(checked) => updateBoolean('factoryModeNERAWDownload', checked, 'Raw stream preference updated.')} /></section>
                    <NativeSettings />
                </div>
            </div>
        </section>
    );
};
