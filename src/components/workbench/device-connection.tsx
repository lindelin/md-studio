import React, { useState } from 'react';
import UsbRoundedIcon from '@mui/icons-material/UsbRounded';
import { doesServiceRequireChrome, type ServiceConstructionInfo } from '../../services/interface-service-manager';
import { browserPreferences } from '../../frontend/browser-preferences-store';
import { useBrowserPreferences } from '../../frontend/use-browser-preferences';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import { useI18n } from '../use-i18n';
import { AppDialog } from '../app-dialog';

export function DeviceConnection() {
    const {t, language} = useI18n();
    const client = useApplicationClient();
    const {connection} = useApplicationWorkspace();
    const {availableServices,lastSelectedService} = useBrowserPreferences();
    const index = availableServices[lastSelectedService] ? lastSelectedService : 0;
    const selected = availableServices[index];
    const connecting = connection.phase === 'connecting';
    const [error,setError] = useState<string | null>(null);
    const [review,setReview] = useState<ServiceConstructionInfo | null>(null);
    const usbAvailable = Boolean(navigator.usb || window.native?.interface || window.native?.himdFullInterface);
    const unavailable = Boolean(selected && doesServiceRequireChrome(selected) && !usbAvailable);
    async function connect(service = selected) {
        if (!service) return;
        setError(null);
        try { await client.connectLocalDevice(service); }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }
    return <section className="workbench__connection" aria-label={t('Connect device')}>
        <div className="workbench__connection-controls">
            <label>{t('Connection method')}<select disabled={connecting} value={index} onChange={event => {
                try { browserPreferences.setSelectedService(Number(event.target.value)); setError(null); }
                catch (error) {setError(String(error));}
            }}>{availableServices.map((service,i) => <option key={`${service.name}:${i}`} value={i}>{service.name}</option>)}</select></label>
            <button className="primary-button" disabled={connecting || unavailable || !selected} onClick={() => {
                if (selected?.id === 'himd-full' && !window.native?.himdFullInterface) setReview(selected);
                else void connect();
            }}><UsbRoundedIcon />{t(connecting ? 'Connecting…' : 'Connect device')}</button>
            {window.mdDesktop ? <button className="secondary-button" onClick={() => void window.mdDesktop?.openControls()}>{language === 'zh-CN' ? '驱动设置' : 'Driver setup'}</button> : null}
        </div>
        {unavailable ? <p role="alert">{t('The selected connection needs a Chromium browser with WebUSB.')}</p> : null}
        {(error || connection.phase === 'error') ? <p className="workbench__connection-error" role="alert">{error || connection.message}</p> : null}
        <AppDialog open={Boolean(review)} onClose={() => setReview(null)} title={t('HiMD full access')} actions={<><button className="secondary-button" onClick={() => setReview(null)}>{t('Cancel')}</button><button className="primary-button" onClick={() => {const service=review;setReview(null);if(service)void connect(service);}}>{t('Continue with browser access')}</button></>}>
            <p>{t('Continue only if you understand that this mode requests advanced access to the connected HiMD device.')}</p>
        </AppDialog>
    </section>;
}
