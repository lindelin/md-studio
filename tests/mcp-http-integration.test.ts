import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridgeRuntime } from '../bridge/mcp-server';
import { startMcpHttp } from '../desktop/http';
import { ApplicationCommandBus } from '../src/application/command-bus';
import { MiniDiscApplication } from '../src/application/minidisc-application';
import { NetMDDeviceGateway } from '../src/application/device-gateway';
import { NetMDMockService } from '../src/services/interfaces/netmd-mock';
import { DefaultMinidiscSpec } from '../src/services/interfaces/netmd';
import { TaskManager } from '../src/application/task-manager';
import { ImportQueue } from '../src/application/import-queue';
it('exercises every MCP tool through HTTP against an isolated application', async () => {
 const service = new NetMDMockService({capabilityContentList:true,capabilityPlaybackControl:true,capabilityMetadataEdit:true,capabilityTrackUpload:true,capabilityDiscEject:true,capabilityFullWidthTitles:true}, false);
 const application = new MiniDiscApplication(new NetMDDeviceGateway(service,new DefaultMinidiscSpec()));
 await application.refresh();
 const tasks = new TaskManager();
 const bus = new ApplicationCommandBus(application,tasks,new ImportQueue(),{start:async()=>tasks.create('test','Test write')},undefined,undefined,undefined,undefined,{devices:[],audioEncoders:[{id:'atracdenc',name:'Atracdenc',index:1,available:true,parameters:[]}]});
 const runtime = createBridgeRuntime({port:0});
 await runtime.bridge.ready;
 runtime.broker.execute = command => bus.execute(command);
 const http = await startMcpHttp(runtime,'integration-test',0);
 let id = 0;
 const called = new Set<string>();
 async function rpc(method:string,params:unknown) {
   const response = await fetch(http.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
   assert.equal(response.status,200);const raw=await response.text(); return JSON.parse(raw.startsWith('event:') ? raw.split('\n').find(line=>line.startsWith('data:'))!.slice(5) : raw);
 }
 async function call(name:string,args:unknown={},failure=false) {
   called.add(name);
   const body=await rpc('tools/call',{name,arguments:args});
   assert.ok(body.result,JSON.stringify(body));
   assert.equal(Boolean(body.result.isError),failure,JSON.stringify(body));
   return body.result.structuredContent;
 }
 try {
  const list=await rpc('tools/list',{});
  await call('minidisc_get_workspace'); await call('minidisc_get_status'); await call('minidisc_get_settings'); await call('minidisc_list_services');
  await call('minidisc_update_settings',{changes:{audioEncoderId:'atracdenc',uploadFormat:{MD:[2,0]}}});
  await call('minidisc_rename_disc',{title:'MCP',fullWidthTitle:'ＭＣＰ'});
  await call('minidisc_rename_tracks',{updates:[{index:0,title:'Renamed',fullWidthTitle:'テスト'}]});
  await call('minidisc_rename_himd_tracks',{updates:[{index:0,artist:'Artist'}]},true);
  await call('minidisc_create_group',{firstTrack:2,trackCount:2,title:'New group'});
  const s=await call('minidisc_get_status');const group=s.snapshot.disc.groups.find((g:any)=>g.title==='New group');
  await call('minidisc_rename_group',{index:group.index,title:'Changed'});
  await call('minidisc_delete_groups',{indexes:[group.index]});
  await call('minidisc_move_track',{sourceIndex:4,destinationIndex:3});
  await call('minidisc_control_playback',{action:'stop'});
  const folder=await mkdtemp(join(tmpdir(),'md-mcp-'));
  const path=join(folder,'test.wav');await writeFile(path,Buffer.alloc(44));
  const added=await call('minidisc_add_imports',{inputs:[{path,metadata:{title:'A',duration:1}},{path,metadata:{title:'B',duration:1}}]});
  const ids=added.importQueue.items.map((item:any)=>item.id);
  await call('minidisc_list_imports');
  await call('minidisc_update_import',{id:ids[0],changes:{title:'C'}});
  await call('minidisc_update_imports',{updates:[{id:ids[1],changes:{artist:'Artist'}}]});
  await call('minidisc_move_import',{id:ids[1],destinationIndex:0});
  await call('minidisc_preview_imports',{format:{codec:'AT3',bitrate:132}});
  const writing=await call('minidisc_write_imports',{format:{codec:'AT3',bitrate:132}});
  await call('minidisc_list_tasks'); await call('minidisc_get_task',{id:writing.task.id});
  await call('minidisc_cancel_task',{id:writing.task.id});
  await call('minidisc_remove_imports',{ids:[ids[0]]}); await call('minidisc_clear_imports');
  await call('minidisc_delete_tracks',{indexes:[4],confirmed:true,reason:'Isolated mock test'});
  await call('minidisc_erase_disc',{confirmed:true,reason:'Isolated mock test'});
  await call('minidisc_format_himd',{confirmed:true,reason:'Unsupported NetMD operation'},true);
  await call('minidisc_flush_device',{},true);
  await call('minidisc_eject_disc');
  assert.deepEqual([...called].sort(),list.result.tools.map((t:any)=>t.name).sort());
 } finally {await http.close();await runtime.close();}
});
