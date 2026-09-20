import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import { useShallowEqualSelector, useThemeDetector } from '../frontend-utils';
import { resolveUiLanguage } from '../i18n';
import { useApplicationSettings } from './use-application-client';

const Welcome = lazy(() => import('./welcome'));
const Workbench = lazy(() => import('./workbench/workbench'));

const themeCommons = {
    components: {
        MuiSelect: { defaultProps: { variant: 'standard' } },
        MuiPaper: { defaultProps: { elevation: 1 }, styleOverrides: { elevation24: { backgroundImage: 'none !important' } } },
        MuiDialog: { defaultProps: { PaperProps: { elevation: 0 } } },
        MuiMenu: { defaultProps: { PaperProps: { elevation: 24 } } },
        MuiTextField: { defaultProps: { variant: 'standard' } },
    },
} as const;

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { light: '#6ec6ff', main: '#2196f3', dark: '#0069c0', contrastText: '#fff' },
        secondary: { light: '#ff4081', main: '#f50057', dark: '#c51162' },
        background: { default: '#0d151c', paper: '#14242e' },
    },
    ...themeCommons,
});

const lightTheme = createTheme({
    palette: {
        mode: 'light',
        primary: { light: '#7986cb', main: '#3f51b5', dark: '#303f9f', contrastText: '#fff' },
        secondary: { light: '#ff4081', main: '#f50057', dark: '#c51162', contrastText: '#fff' },
    },
    ...themeCommons,
});

const InternalApp = () => {
    const { mainView, loading } = useShallowEqualSelector((state) => state.appState);
    return (
        <>
            <CssBaseline />
            <Suspense fallback={<Backdrop open><CircularProgress color="info" /></Backdrop>}>
                {mainView === 'MAIN' ? <Workbench /> : <Welcome />}
            </Suspense>
            {loading ? <Backdrop open sx={{ zIndex: 3000, color: '#fff' }}><CircularProgress color="info" /></Backdrop> : null}
        </>
    );
};

const App = () => {
    const { colorTheme, uiLanguage } = useApplicationSettings();
    const systemIsDarkTheme = useThemeDetector();

    useEffect(() => {
        document.documentElement.lang = resolveUiLanguage(uiLanguage);
    }, [uiLanguage]);

    const theme = useMemo(() => {
        if (colorTheme === 'light') return lightTheme;
        if (colorTheme === 'dark') return darkTheme;
        return systemIsDarkTheme ? darkTheme : lightTheme;
    }, [colorTheme, systemIsDarkTheme]);

    return <ThemeProvider theme={theme}><InternalApp /></ThemeProvider>;
};

export default App;
