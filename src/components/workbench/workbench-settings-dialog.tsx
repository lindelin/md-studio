import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../use-i18n';
import { WorkbenchSettings } from './workbench-settings';
import './workbench.css';

export const WorkbenchSettingsDialog = ({ open, onClose }: { open: boolean; onClose(): void }) => {
    const { t } = useI18n();
    const [message, setMessage] = useState<string | null>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        setMessage(null);
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeButtonRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus();
        };
    }, [onClose, open]);

    if (!open) return null;

    return (
        <div className="workbench workbench__welcome-settings-host" role="presentation" onMouseDown={onClose}>
            <section ref={dialogRef} className="workbench__welcome-settings-dialog" role="dialog" aria-modal="true" aria-label={t('Settings')} onMouseDown={(event) => event.stopPropagation()}>
                <button ref={closeButtonRef} className="workbench__welcome-settings-close" aria-label={t('Close')} onClick={onClose}><CloseRoundedIcon /></button>
                {message ? <div className="workbench__welcome-settings-message">{message}</div> : null}
                <WorkbenchSettings onMessage={setMessage} />
            </section>
        </div>
    );
};
