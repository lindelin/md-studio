import React, { useCallback, useEffect, useState } from 'react';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { useDispatch, useShallowEqualSelector } from '../../frontend-utils';
import { actions as appActions } from '../../redux/app-feature';
import type { ServiceCatalogSnapshot, ServiceParameterDescriptor } from '../../application/service-catalog';
import type { CustomParameters } from '../../custom-parameters';
import type { UserSettings, UserSettingsUpdate } from '../../application/settings-store';
import { useApplicationClient, useApplicationWorkspace, useUpdateApplicationSettings } from '../use-application-client';
import { areServiceParametersValid, createDefaultServiceParameters } from './workbench-model';

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
    if (descriptor.type === 'boolean') {
        return <Toggle checked={Boolean(value)} description="Service-specific option" label={descriptor.label} onChange={onChange} />;
    }
    if (descriptor.type === 'enum') {
        return (
            <label className="workbench__settings-field"><span>{descriptor.label}</span><select value={String(value ?? descriptor.defaultValue)} onChange={(event) => onChange(event.target.value)}>{descriptor.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        );
    }
    if (descriptor.type === 'hostFilePath' || descriptor.type === 'hostDirPath') {
        return (
            <div className="workbench__settings-field"><span>{descriptor.label}</span><button className="secondary-button" onClick={() => void window.native?.openFileHostDialog?.([{ name: 'All files', extensions: ['*'] }], descriptor.type === 'hostDirPath').then((path) => { if (path) onChange(path); })}><FolderOpenRoundedIcon />{value ? 'Change path' : 'Choose path'}</button><small>{String(value || 'No path selected')}</small></div>
        );
    }
    return (
        <label className="workbench__settings-field"><span>{descriptor.label}</span><input type={descriptor.type === 'number' ? 'number' : 'text'} value={String(value ?? descriptor.defaultValue)} onChange={(event) => onChange(descriptor.type === 'number' ? Number(event.target.value) : event.target.value)} /></label>
    );
};

export const WorkbenchSettings = ({ onMessage }: { onMessage(message: string): void }) => {
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
                setStatus(result.ok ? 'The service catalog returned no data.' : result.error.message);
                return;
            }
            setCatalog(result.services);
            setEncoderId((current) => current ?? result.services!.audioEncoders[settings.audioExportService]?.id ?? null);
        });
        return () => { active = false; };
    }, [client, settings.audioExportService]);

    const apply = useCallback(async (changes: UserSettingsUpdate, successMessage: string) => {
        setBusy(true);
        setStatus(null);
        try {
            await updateSettings(changes);
            onMessage(successMessage);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }, [onMessage, updateSettings]);

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
            setStatus(error instanceof Error ? error.message : String(error));
            setBusy(false);
        }
    };

    return (
        <section className="workbench__settings" aria-label="Application settings">
            <header><div><span className="workbench__eyebrow">PREFERENCES</span><h2>Workspace settings</h2><p>Changes are stored locally. Encoder, Library and automation changes reload the application.</p></div>{serviceChangesPending ? <button className="primary-button" disabled={busy || !serviceConfigurationValid} onClick={() => void saveServices()}><RestartAltRoundedIcon /> Save and reload</button> : null}</header>
            {status ? <div className="workbench__settings-message is-error">{status}</div> : null}
            <div className="workbench__settings-columns">
                <div>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">APPEARANCE</span><h3>Interface</h3><label className="workbench__settings-field"><span>Color theme</span><select value={settings.colorTheme} disabled={busy} onChange={(event) => void apply({ colorTheme: event.target.value as UserSettings['colorTheme'] }, 'Color theme updated.')}><option value="system">Use system theme</option><option value="dark">Dark</option><option value="light">Light</option></select></label><Toggle checked={settings.pageFullHeight} disabled={busy} label="Fill available height" description="Stretch the workspace vertically." onChange={(checked) => updateBoolean('pageFullHeight', checked, 'Height preference updated.')} /><Toggle checked={settings.pageFullWidth} disabled={busy} label="Fill available width" description="Stretch the workspace horizontally." onChange={(checked) => updateBoolean('pageFullWidth', checked, 'Width preference updated.')} /></section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">WORKFLOW</span><h3>Editing and notifications</h3><Toggle checked={settings.fullWidthSupport} disabled={busy} label="Full-width title editing" description="Enable Hiragana, Kanji and full-width MiniDisc titles." onChange={(checked) => updateBoolean('fullWidthSupport', checked, 'Title editing preference updated.')} /><Toggle checked={!settings.discProtectedDialogDisabled} disabled={busy} label="Disc-protected warning" description="Warn before operations on a protected disc." onChange={(checked) => updateBoolean('discProtectedDialogDisabled', !checked, 'Protection warning preference updated.')} /><Toggle checked={settings.notifyWhenFinished} disabled={busy} label="Completion notifications" description="Show a notification when a background task finishes." onChange={(checked) => updateBoolean('notifyWhenFinished', checked, 'Notification preference updated.')} /><Toggle checked={settings.archiveDiscCreateZip} disabled={busy} label="Archive as ZIP" description="Create one ZIP when archiving a complete disc." onChange={(checked) => updateBoolean('archiveDiscCreateZip', checked, 'Archive preference updated.')} /></section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">METADATA</span><h3>Default title rules</h3><label className="workbench__settings-field"><span>Imported track title</span><select value={settings.trackTitleFormat} disabled={busy} onChange={(event) => void apply({ trackTitleFormat: event.target.value as UserSettings['trackTitleFormat'] }, 'Import title rule updated.')}>{titleFormats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="workbench__settings-field"><span>Recognized track title</span><select value={settings.recognitionTrackTitleFormat} disabled={busy} onChange={(event) => void apply({ recognitionTrackTitleFormat: event.target.value as UserSettings['recognitionTrackTitleFormat'] }, 'Recognition title rule updated.')}>{titleFormats.filter(([value]) => value !== 'filename').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="workbench__settings-field"><span>Recognition input</span><select value={settings.recognitionImportMethod} disabled={busy} onChange={(event) => void apply({ recognitionImportMethod: event.target.value as UserSettings['recognitionImportMethod'] }, 'Recognition input updated.')}><option value="line-in">Line input</option><option value="exploits">Direct device read</option></select></label></section>
                </div>
                <div>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">ENCODING</span><h3>ATRAC encoder</h3><label className="workbench__settings-field"><span>Encoder</span><select value={encoderId ?? ''} disabled={!catalog || busy} onChange={(event) => { const service = catalog?.audioEncoders.find((candidate) => candidate.id === event.target.value); setEncoderId(event.target.value); setEncoderParameters(createDefaultServiceParameters(service)); }}>{catalog?.audioEncoders.map((service) => <option key={service.id} value={service.id} disabled={!service.available}>{service.name}{service.available ? '' : ' · unavailable'}</option>)}</select></label>{selectedEncoder?.description ? <p className="workbench__settings-description">{selectedEncoder.description}</p> : null}{selectedEncoder?.unavailableReason ? <div className="workbench__settings-message is-error">{selectedEncoder.unavailableReason}</div> : null}{selectedEncoder?.parameters.map((parameter) => <ServiceParameter key={parameter.key} descriptor={parameter} value={encoderParameters[parameter.key]} onChange={(value) => setEncoderParameters((current) => ({ ...current, [parameter.key]: value }))} />)}</section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">LIBRARY</span><h3>Music source</h3><label className="workbench__settings-field"><span>Library service</span><select value={libraryIndex} disabled={!catalog || busy} onChange={(event) => { const index = Number(event.target.value); setLibraryIndex(index); if (index !== -1) setLibraryParameters(createDefaultServiceParameters(catalog?.libraries[index])); }}><option value={-1}>None</option>{catalog?.libraries.map((service) => <option key={service.id} value={service.index} disabled={!service.available}>{service.name}</option>)}</select></label>{selectedLibrary?.description ? <p className="workbench__settings-description">{selectedLibrary.description}</p> : null}{selectedLibrary?.parameters.map((parameter) => <ServiceParameter key={parameter.key} descriptor={parameter} value={libraryParameters[parameter.key]} onChange={(value) => setLibraryParameters((current) => ({ ...current, [parameter.key]: value }))} />)}</section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">AUTOMATION</span><h3>Local MCP and CLI</h3><Toggle checked={bridgeEnabled} label="Enable local bridge" description="Allow the loopback-only MCP server and CLI to control this browser session." onChange={setBridgeEnabled} /><p className="workbench__settings-description">The bridge listens only on this computer. Saving this option reloads the app so the browser endpoint can attach cleanly.</p></section>
                    <section className="workbench__settings-card"><span className="workbench__eyebrow">ADVANCED</span><h3>Homebrew tools</h3><Toggle checked={settings.factoryModeUseSlowerExploit} disabled={busy} label="Use slower ATRAC ripping exploit" description="Compatibility option for devices that lock up during fast ripping." onChange={(checked) => updateBoolean('factoryModeUseSlowerExploit', checked, 'Ripping preference updated.')} /><Toggle checked={settings.factoryModeShortcuts} disabled={busy} label="Show Homebrew shortcuts" description="Expose advanced maintenance entries in the application menu." onChange={(checked) => updateBoolean('factoryModeShortcuts', checked, 'Homebrew shortcut preference updated.')} /><Toggle checked={settings.factoryModeNERAWDownload} disabled={busy} label="Download raw NERAW streams" description="Preserve sector layout for expert recovery work." onChange={(checked) => updateBoolean('factoryModeNERAWDownload', checked, 'Raw stream preference updated.')} /></section>
                </div>
            </div>
        </section>
    );
};
