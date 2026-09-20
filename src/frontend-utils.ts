import { Theme } from '@mui/material';
import {  useEffect, useState } from 'react';

function themeSpacing(theme: Theme, number: number){
    return parseInt(theme.spacing(number).slice(0, -2));
}

export function forAnyDesktop(theme: Theme) {
    return theme.breakpoints.up(600 + themeSpacing(theme, 2) * 2);
}

export function belowDesktop(theme: Theme) {
    return theme.breakpoints.down(600 + themeSpacing(theme, 2) * 2);
}

export function forWideDesktop(theme: Theme) {
    return theme.breakpoints.up(700 + themeSpacing(theme, 2) * 2) + ` and (min-height: 750px)`;
}

export function useThemeDetector() {
    const getCurrentTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
    const [isDarkTheme, setIsDarkTheme] = useState(getCurrentTheme());
    const mqListener = (e: any) => {
        setIsDarkTheme(e.matches);
    };

    useEffect(() => {
        const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
        darkThemeMq.addEventListener('change', mqListener);
        return () => darkThemeMq.removeEventListener('change', mqListener);
    }, []);
    return isDarkTheme;
}
