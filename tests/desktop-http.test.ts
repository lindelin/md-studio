import assert from 'node:assert/strict';
import { request } from 'node:http';
import { it } from 'node:test';
import { McpServer } from '@modelcontextprotocol/server';
import { startMcpHttp } from '../desktop/http';
import { classifyDevice } from '../desktop/drivers';
it('serves MCP only at its private route and rejects foreign origins', async () => {
    const runtime = {createServer:()=>new McpServer({name:'test',version:'1'})};
    const server=await startMcpHttp(runtime as Parameters<typeof startMcpHttp>[0], 'test-secret',0);
    try {
        assert.equal((await fetch(server.url.replace('test-secret','wrong'))).status,404);
        assert.equal((await fetch(server.url,{headers:{Origin:'https://evil.example'}})).status,403);
        assert.equal(await new Promise(resolve => { const req=request(server.url,{headers:{Host:'evil.example'}}, res => { res.resume(); resolve(res.statusCode); }); req.end(); }),403);
        const response=await fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}})});
        assert.equal(response.status,200);
        const body=await response.text();
        const result=JSON.parse(body.startsWith('event:') ? body.split('\n').find(line => line.startsWith('data:'))!.slice(5) : body);
        assert.equal(result.result.serverInfo.name,'test');
    } finally {await server.close();}
    await assert.rejects(fetch(server.url));
});
it('driver assistant excludes unrelated USB, working WinUSB, storage and composite interfaces', () => {
    const row={PNPDeviceID:'USB\\VID_054C&PID_0084\\123',Name:'Sony',Service:'',Status:'Error'};
    assert.equal(classifyDevice(row)?.eligible,true);
    for(const Service of ['WinUSB','USBSTOR','usbccgp','UASPStor']) assert.equal(classifyDevice({...row,Service})?.eligible,false);
    assert.equal(classifyDevice({...row,PNPDeviceID:'USB\\VID_054C&PID_0084&MI_00\\123'})?.eligible,false);
    assert.equal(classifyDevice({...row,PNPDeviceID:'USB\\VID_FFFF&PID_FFFF\\123'}),null);
});
