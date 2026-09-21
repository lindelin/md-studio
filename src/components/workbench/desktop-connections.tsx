import React, {useEffect,useState} from 'react';
import {useI18n} from '../use-i18n';
export function DesktopConnections() {
    const {language}=useI18n();
    const text=(zh:string,en:string)=>language === 'zh-CN' ? zh : en;
    const api=window.mdDesktop;
    const [state,setState]=useState({enabled:false,url:'',cli:''});
    const [loaded,setLoaded]=useState(false);
    const [busy,setBusy]=useState(false);
    const [message,setMessage]=useState('');
    useEffect(()=>{let active=true;api?.status().then(value=>{if(active){setState(value);setLoaded(true);}}).catch(error=>{if(active)setMessage(String(error));});return()=>{active=false;};},[api]);
    async function run(operation:()=>Promise<void>){setBusy(true);setMessage('');try{await operation();}catch(error){setMessage(String(error));}finally{setBusy(false);}}
    if(!api)return null;
    return <div className="workbench__connections">
        <h2>{text('AI 接入','AI access')}</h2>
        <section><div className="workbench__connections-heading"><h3>MCP</h3><label><input type="checkbox" role="switch" checked={state.enabled} disabled={busy || !loaded} onChange={event=>{const enabled=event.target.checked;void run(async()=>{const result=await api.setMcp(enabled);setState(current=>({...current,...result}));});}} />{state.enabled ? text('已开启','Enabled') : text('已关闭','Disabled')}</label></div>
        {state.enabled ? <><label>{text('连接地址','Connection URL')}<input readOnly value={state.url} /></label><button className="secondary-button" disabled={busy} onClick={()=>void run(async()=>{await api.copy(state.url);setMessage(text('地址已复制','URL copied'));})}>{text('复制地址','Copy URL')}</button><p>{text('在支持本地 HTTP MCP 的 AI 客户端中粘贴完整地址。地址含访问密钥，请勿分享。','Paste the full URL into a local HTTP MCP client. It contains an access key; keep it private.')}</p></> : <p>{text('开启后生成本机连接地址。','Enable to generate a local connection URL.')}</p>}
        </section>
        <section><h3>{text('MD 标签整理 Skill','MD metadata Skill')}</h3><p>{text('让 AI 按 MD 的标题、读音和分组规则整理音乐。','Guide AI through MD titles, Japanese readings and groups.')}</p><button className="secondary-button" disabled={busy} onClick={()=>void run(async()=>{if(await api.exportSkill())setMessage(text('Skill 已导出，可安装到 AI 客户端。','Skill exported. Install it in your AI client.'));})}>{text('导出 Skill','Export Skill')}</button></section>
        <section><h3>CLI</h3><label>{text('命令入口','Command launcher')}<input readOnly value={state.cli} /></label><button className="secondary-button" disabled={busy || !loaded} onClick={()=>void run(async()=>{await api.copy(`"${state.cli}"`);setMessage(text('命令入口已复制','Launcher copied'));})}>{text('复制命令入口','Copy launcher')}</button><p>{text('无需开启 MCP；使用时保持工作室打开。','MCP is not required. Keep Studio open.')}</p><details><summary>{text('命令示例','Command examples')}</summary><pre>{'mdstudio.cmd status\nmdstudio.cmd add "C:\\Music\\song.wav"\nmdstudio.cmd preview LP2\nmdstudio.cmd write LP2'}</pre></details></section>
        <p role="status" className="workbench__connections-message">{message}</p>
    </div>;
}
