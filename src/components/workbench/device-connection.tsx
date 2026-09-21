import React, { useEffect, useRef, useState } from 'react';
import { DevicesIds } from 'netmd-js/dist/netmd';
import UsbRoundedIcon from '@mui/icons-material/UsbRounded';
import { doesServiceRequireChrome, type ServiceConstructionInfo } from '../../services/interface-service-manager';
import { browserPreferences } from '../../frontend/browser-preferences-store';
import { useBrowserPreferences } from '../../frontend/use-browser-preferences';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import { useI18n } from '../use-i18n';
import { AppDialog } from '../app-dialog';

export function DeviceConnection({ onOpenDriverSettings }: { onOpenDriverSettings: () => void }) {
    const {t, language} = useI18n();
    const client = useApplicationClient();
    const {connection} = useApplicationWorkspace();
    const {availableServices,lastSelectedService} = useBrowserPreferences();
    const index = availableServices[lastSelectedService] ? lastSelectedService : 0;
    const selected = availableServices[index];
    const connecting = connection.phase === 'connecting';
    const [error,setError] = useState<string | null>(null);
    const [review,setReview] = useState<ServiceConstructionInfo | null>(null);
    const [devices,setDevices] = useState<{id:string;name:string;usbId:string;serial:string}[] | null>(null);
    const [deviceId,setDeviceId] = useState('');
    const knownDevices = useRef(new Map<string, USBDevice>());
    useEffect(() => window.mdDesktop?.onUsbChoices(list => { setDevices(list); setDeviceId(current => list?.some(device => device.id === current) ? current : ''); }), []);
    const usbAvailable = Boolean(navigator.usb || window.native?.interface || window.native?.himdFullInterface);
    const unavailable = Boolean(selected && doesServiceRequireChrome(selected) && !usbAvailable);
    async function connect(service = selected, usbDevice?: USBDevice) {
        if (!service) return;
        setError(null);
        try {
            if (window.mdDesktop && service.id === 'usb-netmd' && !usbDevice) {
                const available = (await navigator.usb.getDevices()).filter(device => DevicesIds.some(id => id.vendorId === device.vendorId && id.deviceId === device.productId));
                if (available.length > 1) {
                    knownDevices.current = new Map(available.map((device,i) => [`known:${i}`,device]));
                    setDevices([...knownDevices.current].map(([id,device]) => ({id,name:device.productName || 'MD',usbId:`${device.vendorId.toString(16)}:${device.productId.toString(16)}`,serial:device.serialNumber || ''})));
                    setDeviceId('');
                    return;
                }
                usbDevice = available[0];
            }
            setDevices(null);
            await client.connectLocalDevice({...service, usbDevice});
        }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }
    async function selectDevice(id: string | null) {
        const device = id ? knownDevices.current.get(id) : undefined;
        if (knownDevices.current.size) {
            knownDevices.current.clear(); setDevices(null);
            if (device) await connect(selected, device);
        } else await window.mdDesktop?.selectUsbDevice(id);
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
            {window.mdDesktop ? <button className="secondary-button" onClick={onOpenDriverSettings}>{language === 'zh-CN' ? '驱动设置' : 'Driver setup'}</button> : null}
        </div>
        {devices !== null ? <div className="workbench__usb-picker">
            <label>{language === 'zh-CN' ? '选择 MD 设备' : 'Select MD device'}<select value={deviceId} onChange={event => setDeviceId(event.target.value)}>
                <option value="">{language === 'zh-CN' ? '请选择要连接的设备' : 'Choose a device to connect'}</option>
                {devices.map((device,i) => <option key={device.id} value={device.id}>{device.name} · {device.usbId} · {device.serial || `#${i+1}`}</option>)}
            </select></label>
            <button className="primary-button" disabled={!deviceId} onClick={() => void selectDevice(deviceId).catch(error => setError(String(error)))}>{language === 'zh-CN' ? '连接选中设备' : 'Connect selected device'}</button>
            <button className="secondary-button" onClick={() => void selectDevice(null).catch(error => setError(String(error)))}>{t('Cancel')}</button>
            {devices.length === 0 ? <p>{language === 'zh-CN' ? '设备已拔出，请重新插入或取消。' : 'Devices were unplugged. Reconnect or cancel.'}</p> : null}
        </div> : null}
        {unavailable ? <p role="alert">{t('The selected connection needs a Chromium browser with WebUSB.')}</p> : null}
        {(error || connection.phase === 'error') ? <p className="workbench__connection-error" role="alert">{error || connection.message}</p> : null}
        <AppDialog open={Boolean(review)} onClose={() => setReview(null)} title={t('HiMD full access')} actions={<><button className="secondary-button" onClick={() => setReview(null)}>{t('Cancel')}</button><button className="primary-button" onClick={() => {const service=review;setReview(null);if(service)void connect(service);}}>{t('Continue with browser access')}</button></>}>
            <p>{t('Continue only if you understand that this mode requests advanced access to the connected HiMD device.')}</p>
        </AppDialog>
    </section>;
}
