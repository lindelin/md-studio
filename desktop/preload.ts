import { contextBridge, ipcRenderer } from 'electron';
const arg = process.argv.find(value => value.startsWith('--md-bridge='));
contextBridge.exposeInMainWorld('mdDesktop', {
    bridgeUrl: arg ? decodeURIComponent(arg.slice('--md-bridge='.length)) : undefined,
    onOpenControls: (callback: () => void) => { const listener = () => callback(); ipcRenderer.on('desktop:show-settings',listener); return () => ipcRenderer.removeListener('desktop:show-settings',listener); },
    openControls: () => ipcRenderer.invoke('desktop:open-controls'),
    status: () => ipcRenderer.invoke('desktop:status'),
    setMcp: (enabled: boolean) => ipcRenderer.invoke('desktop:mcp', enabled),
    drivers: () => ipcRenderer.invoke('desktop:drivers'),
    installDriver: (id: string) => ipcRenderer.invoke('desktop:install-driver', id),
    copy: (value: string) => ipcRenderer.invoke('desktop:copy', value),
    exportSkill: () => ipcRenderer.invoke('desktop:skill'),
});
