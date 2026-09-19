import React from 'react';
import { clearAppPreferences } from '../preferences';

export class SettingsResetErrorBoundary extends React.Component<
    {
        children: React.ReactNode;
    },
    {
        error: Error | null;
    }
> {
    constructor(props: any) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    render(): React.ReactNode {
        if (!this.state.error) return <>{this.props.children}</>;

        const message = (this.state.error.stack ?? this.state.error.message).substring(0, 500);
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
                <h1>Web MiniDisc could not start</h1>
                <p>Reload the app first. If the problem continues, reset only this app's saved settings.</p>
                <pre style={{ overflow: 'auto', padding: 16, background: 'rgba(127, 127, 127, 0.15)' }}>{message}</pre>
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button type="button" onClick={() => window.reload()}>
                        Reload
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            clearAppPreferences();
                            window.reload();
                        }}
                    >
                        Reset app settings and reload
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
