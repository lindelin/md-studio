import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import React, { useEffect, useId, useRef } from 'react';
import { useI18n } from './use-i18n';
import './app-dialog.css';

type AppDialogProps = {
    open: boolean;
    title: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
    onClose(): void;
    size?: 'small' | 'medium' | 'large';
    dismissOnBackdrop?: boolean;
    showCloseButton?: boolean;
};

export const AppDialog = ({
    open,
    title,
    children,
    actions,
    onClose,
    size = 'medium',
    dismissOnBackdrop = false,
    showCloseButton = true,
}: AppDialogProps) => {
    const { t } = useI18n();
    const titleId = useId();
    const panelRef = useRef<HTMLElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        queueMicrotask(() => {
            const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            );
            (closeButtonRef.current ?? firstFocusable)?.focus();
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !panelRef.current) return;
            const focusable = Array.from(
                panelRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
                )
            ).filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;
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
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, [onClose, open]);

    if (!open) return null;

    return (
        <div
            className="app-dialog__backdrop"
            role="presentation"
            onMouseDown={(event) => {
                if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={panelRef}
                className={`app-dialog app-dialog--${size}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="app-dialog__header">
                    <div>
                        <span className="app-dialog__eyebrow">MINIDISC WORKSPACE</span>
                        <h2 id={titleId}>{title}</h2>
                    </div>
                    {showCloseButton ? (
                        <button ref={closeButtonRef} className="app-dialog__close" aria-label={t('Close')} onClick={onClose}>
                            <CloseRoundedIcon />
                        </button>
                    ) : null}
                </header>
                <div className="app-dialog__content">{children}</div>
                {actions ? <footer className="app-dialog__actions">{actions}</footer> : null}
            </section>
        </div>
    );
};
