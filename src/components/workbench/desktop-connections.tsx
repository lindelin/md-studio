import { localizeJapanese } from '../../i18n';
import React, {useEffect,useState} from 'react';
import {useI18n} from '../use-i18n';
export function DesktopConnections() {
    const {language}=useI18n();
    const text=(zh:string,en:string)=>language === 'zh-CN' ? zh : localizeJapanese(language, en);
    const api=window.mdDesktop;
    const [state,setState]=useState({enabled:false,url:'',cli:''});
    const [loaded,setLoaded]=useState(false);
    const [busy,setBusy]=useState(false);
    const [message,setMessage]=useState('');
    useEffect(()=>{let active=true;api?.status().then(value=>{if(active){setState(value);setLoaded(true);if(value.error)setMessage(value.error);}}).catch(error=>{if(active)setMessage(String(error));});return()=>{active=false;};},[api]);
    async function run(operation:()=>Promise<void>){setBusy(true);setMessage('');try{await operation();}catch(error){setMessage(String(error));}finally{setBusy(false);}}
    if(!api)return null;
    return <div className="workbench__connections">
        <h2>{text('AI 接入','AI access')}</h2>
        <section><div className="workbench__connections-heading"><h3>MCP</h3><label><input type="checkbox" role="switch" checked={state.enabled} disabled={busy || !loaded} onChange={event=>{const enabled=event.target.checked;void run(async()=>{const result=await api.setMcp(enabled);setState(current=>({...current,...result}));});}} />{state.enabled ? text('已开启','Enabled') : text('已关闭','Disabled')}</label></div>
        {state.enabled ? <><label>{text('连接地址','Connection URL')}<input readOnly value={state.url} /></label><button className="secondary-button" disabled={busy} onClick={()=>void run(async()=>{await api.copy(state.url);setMessage(text('地址已复制','URL copied'));})}>{text('复制地址','Copy URL')}</button><p>{text('将完整地址填入 AI 客户端一次即可。应用重启或重新开启 MCP 后地址不变。地址含访问密钥，请勿分享。','Configure this URL once in a local HTTP MCP client. It stays the same after restarts and toggles. Keep its access key private.')}</p></> : <p>{text('开启一次后随应用自动启动，连接地址保持不变。','Enable once to start MCP with the app. The connection URL stays the same.')}</p>}
        </section>
        <section><h3>{text('MD 标签整理 Skill','MD metadata Skill')}</h3><p>{text('让 AI 按 MD 的标题、读音和分组规则整理音乐。','Guide AI through MD titles, Japanese readings and groups.')}</p><button className="secondary-button" disabled={busy} onClick={()=>void run(async()=>{if(await api.exportSkill())setMessage(text('Skill 已导出，可安装到 AI 客户端。','Skill exported. Install it in your AI client.'));})}>{text('导出 Skill','Export Skill')}</button></section>
        <section><h3>CLI</h3><label>{text('命令入口','Command launcher')}<input readOnly value={state.cli} /></label><button className="secondary-button" disabled={busy || !loaded} onClick={()=>void run(async()=>{await api.copy(`"${state.cli}"`);setMessage(text('命令入口已复制','Launcher copied'));})}>{text('复制命令入口','Copy launcher')}</button><p>{text('无需开启 MCP；工作室在后台运行时也可使用。','MCP is not required. CLI also works while Studio runs in the background.')}</p><details><summary>{text('命令示例','Command examples')}</summary><pre>{'mdstudio.cmd status\nmdstudio.cmd add "C:\\Music\\song.wav"\nmdstudio.cmd preview LP2\nmdstudio.cmd write LP2'}</pre></details></section>
        <section><h3>{text('后台运行','Background')}</h3><p>{text('关闭窗口后留在系统托盘，AI 和录制任务继续运行。双击托盘图标恢复窗口，右键选择“退出”结束应用。','Closing the window keeps AI access and recording active in the system tray. Double-click the tray icon to reopen, or choose Quit from its menu.')}</p><button className="secondary-button" onClick={()=>void run(async()=>{await api.runInBackground();})}>{text('转入后台','Run in background')}</button></section><p role="status" className="workbench__connections-message">{message}</p>
    </div>;
}
