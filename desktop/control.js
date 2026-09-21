const api=window.mdDesktop;
const get=id=>document.getElementById(id);
let enabled=false;
async function action(fn){try{get('message').textContent='处理中 / Working…';await fn();get('message').textContent='完成 / Done';}catch(error){get('message').textContent=String(error);}}
async function refresh(){const state=await api.status();enabled=state.enabled;get('url').value=state.url;get('cli').value=state.cli;get('toggle').textContent=enabled?'关闭 / Disable':'开启 / Enable';get('state').textContent=enabled?'接入已开启；客户端连接需在 AI 中验证 / Access enabled; verify connection in your AI client.':'接入已关闭 / Access disabled';}
function render(devices){get('devices').replaceChildren();if(!devices.length)get('devices').textContent='未检测到受支持的 MD。检查 USB 连接及设备模式。 / No supported MD detected.';for(const device of devices){const row=document.createElement('article');const title=document.createElement('strong');title.textContent=device.name;const info=document.createElement('small');info.textContent=`${device.id} · ${device.service||'未安装驱动 / No driver'} · ${device.status}`;row.append(title,info);if(device.eligible){const button=document.createElement('button');button.textContent='安装连接驱动 / Set up driver';button.onclick=()=>action(async()=>{await api.installDriver(device.id);render(await api.drivers());});row.append(button);}else{const note=document.createElement('small');note.textContent=device.service.toLowerCase()==='winusb'?'WinUSB 已安装，无需更换 / WinUSB installed.':'保留当前驱动；此接口不提供自动更换 / Driver replacement unavailable for this interface.';row.append(note);}get('devices').append(row);}}
get('toggle').onclick=()=>action(async()=>{await api.setMcp(!enabled);await refresh();});
get('copy').onclick=()=>action(()=>api.copy(get('url').value));get('copy-cli').onclick=()=>action(()=>api.copy('"'+get('cli').value+'"'));
get('scan').onclick=()=>action(async()=>render(await api.drivers()));get('skill').onclick=()=>action(()=>api.exportSkill());
void action(refresh);
