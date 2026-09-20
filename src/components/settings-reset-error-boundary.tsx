import React from 'react';
import { clearAppPreferences, loadPreference } from '../preferences';

export class SettingsResetErrorBoundary extends React.Component<
    {
        children: React.ReactNode;
    },
    {
        error: Error | null;
        resetFailed: boolean;
    }
> {
    constructor(props: any) {
        super(props);
        this.state = { error: null, resetFailed: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    render(): React.ReactNode {
        if (!this.state.error) return <>{this.props.children}</>;

        const message = (this.state.error.stack ?? this.state.error.message).substring(0, 500);
        const preference = loadPreference<'system' | 'en' | 'zh-CN'>('uiLanguage', 'system');
        const isChinese = preference === 'zh-CN' || (preference === 'system' && navigator.language.toLowerCase().startsWith('zh'));
        return (
            <main
                role="alert"
                style={{
                    maxWidth: 720,
                    margin: '10vh auto',
                    padding: 32,
                    fontFamily: 'system-ui, sans-serif',
                    lineHeight: 1.5,
                }}
            >
                <h1>{isChinese ? 'MiniDisc Workspace 无法启动' : 'MiniDisc Workspace could not start'}</h1>
                <p>{isChinese ? '请先重新加载应用。如果问题仍然存在，请仅重置本应用保存的设置。' : "Reload the app first. If the problem continues, reset only this app's saved settings."}</p>
                <pre style={{ overflow: 'auto', padding: 16, background: 'rgba(127, 127, 127, 0.15)' }}>{message}</pre>
                {this.state.resetFailed ? (
                    <p role="alert" style={{ color: '#b42318', fontWeight: 600 }}>
                        {isChinese
                            ? '浏览器拒绝清除设置，因此没有重新加载。请检查此站点的存储权限或手动清除此站点的数据。'
                            : 'The browser refused to clear the settings, so the app was not reloaded. Check this site\'s storage permission or clear this site\'s data manually.'}
                    </p>
                ) : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button type="button" onClick={() => window.reload()}>
                        {isChinese ? '重新加载' : 'Reload'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const result = clearAppPreferences();
                            if (result?.ok) window.reload();
                            else this.setState({ resetFailed: true });
                        }}
                    >
                        {isChinese ? '重置应用设置并重新加载' : 'Reset app settings and reload'}
                    </button>
                </div>
            </main>
        );
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('Root rendering error!!');
        console.error(error);
        console.error(errorInfo);
    }
}
