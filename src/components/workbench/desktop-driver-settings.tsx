import React, { useState } from 'react';
import { useI18n } from '../use-i18n';

type DesktopDevice = Awaited<ReturnType<NonNullable<Window['mdDesktop']>['drivers']>>[number];

export function DesktopDriverSettings() {
    const { language } = useI18n();
    const text = (zh: string, en: string) => language === 'zh-CN' ? zh : en;
    const api = window.mdDesktop;
    const [devices, setDevices] = useState<DesktopDevice[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    if (!api) return null;

    async function run(operation: () => Promise<void>) {
        setBusy(true);
        setMessage('');
        try {
            await operation();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="workbench__settings-card workbench__driver-settings">
            <h3>{text('设备驱动', 'Device driver')}</h3>
            <button className="secondary-button" disabled={busy} onClick={() => void run(async () => setDevices(await api.drivers()))}>
                {text('检测驱动', 'Check driver')}
            </button>
            {devices?.length === 0 ? <p>{text('未检测到受支持的 MD，请检查 USB 连接。', 'No supported MD detected. Check USB.')}</p> : null}
            {devices?.map((device) => (
                <article key={device.id}>
                    <strong>{device.name}</strong>
                    <p>{device.service || text('未安装驱动', 'No driver')} · {device.status}</p>
                    <small>{device.id}</small>
                    {device.eligible ? (
                        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => {
                            await api.installDriver(device.id);
                            setDevices(await api.drivers());
                        })}>{text('打开驱动安装器', 'Open driver installer')}</button>
                    ) : (
                        <p>{device.service.toLowerCase() === 'winusb' ? text('WinUSB 已安装，无需更换。', 'WinUSB is installed.') : text('保留当前驱动，此接口不提供更换。', 'Keep the current driver; replacement is unavailable for this interface.')}</p>
                    )}
                </article>
            ))}
            {message ? <p className="workbench__settings-message is-error" role="status">{message}</p> : null}
        </section>
    );
}
