import { app, BrowserWindow, Menu, dialog, ipcMain, clipboard, session } from 'electron';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBridgeRuntime } from '../bridge/mcp-server';
import { stageLocalAudioImport } from '../bridge/local-audio-import';
import { startMcpHttp, readJson } from './http';
import { isSupportedMD, protectedMDClasses } from './usb-policy';
import { scanDrivers } from './drivers';
const exec = promisify(execFile);
const root = app.getAppPath();
const resources = app.isPackaged ? process.resourcesPath : root;
const uiOrigin = 'http://127.0.0.1:5190';
let mainWindow: BrowserWindow;
let mcp: Awaited<ReturnType<typeof startMcpHttp>> | undefined;
let mcpChanging = false;
const cliDir = app.isPackaged ? join(process.resourcesPath,'cli') : join(root,'desktop-build');
const bridgeToken = randomBytes(32).toString('hex');
const commandToken = randomBytes(32).toString('hex');
let mcpToken = randomBytes(24).toString('hex');
const configFolder = join(app.getPath('appData'), 'MD Studio');
let runtime: ReturnType<typeof createBridgeRuntime>;
let driverInstalling = false;
if (!app.requestSingleInstanceLock()) app.quit();
else void start().catch(error => { dialog.showErrorBox('MD Studio', String(error)); app.quit(); });
app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
function trusted(event: Electron.IpcMainInvokeEvent) {
    if (!event.senderFrame || new URL(event.senderFrame.url).origin !== uiOrigin || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted window');
}
async function isBusy() {
    if (!runtime.broker.isConnected()) return false;
    const result = await runtime.broker.execute({ type:'task.list' });
    if (!result.ok) throw new Error('Cannot verify device task state');
    return result.tasks?.some(task => task.status === 'running' || task.status === 'queued') ?? false;
}
function openControl() { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('desktop:show-settings'); }
function secureWindow(win: BrowserWindow) {
    win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== uiOrigin) event.preventDefault(); });
}
async function start() {
    await app.whenReady();
    // Desktop assets are local; a PWA navigation fallback must never replace the control page.
    await session.defaultSession.clearStorageData({ storages:['serviceworkers','cachestorage'] });
    runtime = createBridgeRuntime({ host:'127.0.0.1', port:0, token:bridgeToken, allowedOrigins:[uiOrigin] });
    await runtime.bridge.ready;
    const staticRoot = resolve(root,'dist');
    const contentTypes: Record<string,string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.svg':'image/svg+xml', '.png':'image/png' };
    const server = createServer(async (req,res) => {
        try {
            if (req.headers.host !== '127.0.0.1:5190') { res.writeHead(403).end(); return; }
            const url = new URL(req.url || '/',uiOrigin);
            if (url.pathname === '/registerSW.js') { res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end('// Service workers are disabled in the desktop host.'); return; }
            if (url.pathname === '/sw.js') { res.writeHead(404).end(); return; }
            if (url.pathname === '/desktop-command') {
                if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${commandToken}` || req.headers.origin) { res.writeHead(403).end(); return; }
                const input = await readJson(req);
                let result;
                if (input.action === 'add') {
                    if (!Array.isArray(input.paths) || input.paths.length < 1 || input.paths.length > 500 || input.paths.some((p:unknown) => typeof p !== 'string')) throw new Error('Invalid paths');
                    const staged = [];
                    try {
                        for (const path of input.paths) staged.push(await stageLocalAudioImport(runtime.localFiles,path));
                        result = await runtime.broker.execute({ type:'import.add', inputs:staged.map(item => item.input) });
                        if (!result.ok) for (const item of staged) runtime.localFiles.revoke(item.handle);
                    } catch(error) { for (const item of staged) runtime.localFiles.revoke(item.handle); throw error; }
                } else result = await runtime.broker.execute(input.command);
                res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(result)); return;
            }
            if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
            let file: string;
            {
                file = resolve(staticRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
                if (!file.startsWith(staticRoot+sep)) { res.writeHead(403).end(); return; }
            }
            const body = await readFile(file);
            res.writeHead(200, {'Content-Type':contentTypes[extname(file)] || 'application/octet-stream','Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
            res.end(req.method === 'HEAD' ? undefined : body);
        } catch(error) { if (!res.headersSent) res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ error:String(error) })); }
    });
    await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(5190,'127.0.0.1',resolve); });
    await mkdir(configFolder,{recursive:true});
    await writeFile(join(configFolder,'mdstudio.cmd'), `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${join(cliDir,'cli.cjs')}" %*\r\n`);
    await writeFile(join(configFolder,'connection.json'),JSON.stringify({ url:`${uiOrigin}/desktop-command`, token:commandToken }));
    session.defaultSession.setPermissionCheckHandler((_contents,permission,origin) => origin === uiOrigin && permission === 'usb');
    session.defaultSession.setDevicePermissionHandler(details => details.origin === uiOrigin && details.deviceType === 'usb' && isSupportedMD(details.device as Electron.USBDevice));
    session.defaultSession.setUSBProtectedClassesHandler(details => protectedMDClasses(details.protectedClasses));
    session.defaultSession.on('select-usb-device', (event,details,callback) => {
        event.preventDefault();
        if (!details.frame || new URL(details.frame.url).origin !== uiOrigin) { callback(); return; }
        const devices = details.deviceList.filter(isSupportedMD);
        if (!devices.length) { callback(); return; }
        void dialog.showMessageBox(mainWindow,{type:'question',title:'选择 MD / Select MD',message:'选择要连接的设备 / Choose a device',buttons:[...devices.map(d => `${d.productName || 'USB'} (${d.vendorId.toString(16)}:${d.productId.toString(16)})`),'取消 / Cancel'],cancelId:devices.length}).then(({response}) => callback(devices[response]?.deviceId));
    });
    mainWindow = new BrowserWindow({width:1400,height:950,title:'MD Studio',icon:join(__dirname,'app-icon.png'),webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,additionalArguments:[`--md-bridge=${encodeURIComponent(`ws://127.0.0.1:${runtime.bridge.port}?token=${bridgeToken}`)}`]}});
    secureWindow(mainWindow);
    let closing = false;
    mainWindow.on('close', event => {
        if (closing) return;
        event.preventDefault();
        void isBusy().then(busy => {
            if (busy) { void dialog.showMessageBox(mainWindow,{type:'warning',title:'任务仍在进行 / Task still active',message:'请保持碟机供电和 USB 连接。可在任务中心请求“当前曲目完成后结束批次”，或等待任务完成。 / Keep the recorder powered and USB connected. Use Task Center to end the batch after the current track, or wait for completion.'}); return; }
            closing = true; mainWindow.close();
        }).catch(error => dialog.showErrorBox('MD Studio',String(error)));
    });
    ipcMain.handle('desktop:open-controls',event => { trusted(event); openControl(); });
    ipcMain.handle('desktop:status', event => { trusted(event); return { enabled:Boolean(mcp),url:mcp?.url || '',cli:join(configFolder,'mdstudio.cmd') }; });
    ipcMain.handle('desktop:mcp',async(event,enabled) => {
        trusted(event); if(typeof enabled !== 'boolean' || mcpChanging) throw new Error('Please wait');
        mcpChanging=true;
        try { if(enabled && !mcp) { mcpToken=randomBytes(24).toString('hex'); mcp=await startMcpHttp(runtime,mcpToken); }
            else if(!enabled && mcp) { const old=mcp; mcp=undefined; await old.close(); }
            return {enabled:Boolean(mcp),url:mcp?.url || ''};
        } finally { mcpChanging=false; }
    });
    ipcMain.handle('desktop:copy',(event,value) => { trusted(event); if(typeof value !== 'string' || value.length > 10000) throw new Error('Invalid text'); clipboard.writeText(value); });
    ipcMain.handle('desktop:drivers', async event => {trusted(event); return scanDrivers();});
    ipcMain.handle('desktop:install-driver',async(event,id) => {
        trusted(event); if (driverInstalling || await isBusy()) throw new Error('设备忙，请稍后重试 / Device busy');
        const device=(await scanDrivers()).find(d => d.id === id);
        if(!device?.eligible) throw new Error('此设备不需要或不适用 WinUSB 安装 / Device not eligible');
        const answer=await dialog.showMessageBox(mainWindow,{type:'warning',buttons:['取消 / Cancel','打开安装器 / Open installer'],defaultId:0,cancelId:0,message:`${device.name}\n${device.id}`,detail:'将打开 Zadig。请核对这个设备及 USB ID，并选择 WinUSB。更换驱动可能影响旧软件。不要选择其他设备。 / Verify this device and select WinUSB; replacing its driver may affect legacy software.'});
        if(answer.response !== 1) return {cancelled:true};
        driverInstalling=true;
        try {
            const source=app.isPackaged ? join(resources,'zadig') : join(root,'vendor','zadig');
            const exe=join(source,'zadig-2.9.exe');
            const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
            if(createHash('sha256').update(new Uint8Array(await readFile(exe))).digest('hex') !== manifest.sha256) throw new Error('Installer integrity check failed');
            // Only this explicit click launches the official interactive elevated installer.
            const escaped=exe.replace(/'/g,"''");
            const workingDirectory=source.replace(/'/g,"''");
            await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Start-Process -FilePath '${escaped}' -WorkingDirectory '${workingDirectory}' -Verb RunAs -PassThru -Wait; exit $p.ExitCode`],{windowsHide:true});
            return {devices:await scanDrivers()};
        } finally {driverInstalling=false;}
    });
    ipcMain.handle('desktop:skill',async event => { trusted(event); const result=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory','createDirectory']}); if(result.canceled) return; const source=app.isPackaged ? join(resources,'skills','md-metadata-curator') : join(root,'skills','md-metadata-curator'); await cp(source,join(result.filePaths[0],'md-metadata-curator'),{recursive:true,errorOnExist:true,force:false}); return 'OK'; });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'MD Studio',submenu:[{label:'打开设置 / Open Settings',click:openControl},{role:'quit'}]},{label:'查看 / View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'toggleDevTools'}]}]));
    await mainWindow.loadURL(uiOrigin);
    app.on('will-quit', () => { void mcp?.close(); void runtime.close(); server.close(); });
    app.on('window-all-closed',() => app.quit());
}
