import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
async function main() {
    const [verb,...args]=process.argv.slice(2);
    if(!verb || verb === '--help') { console.log(`MD Studio CLI (desktop app must be open)
status | workspace | imports | tasks
connect [service index]
add <audio paths...>
preview [SP|LP2|LP4|MONO]
write [SP|LP2|LP4|MONO]
command <JSON> | --file <command.json>
Edits/groups: use command with the shared ApplicationCommand schema.
Write records the current queue and waits for completion.`); return; }
    const config=JSON.parse(await readFile(join(process.env.APPDATA || '', 'MD Studio','connection.json'),'utf8'));
    if(new URL(config.url).hostname !== '127.0.0.1') throw new Error('Invalid local connection');
    async function request(body:unknown):Promise<any> {
        const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
        const result=await response.json() as any;
        if(!response.ok || result.ok === false || result.error) throw new Error(JSON.stringify(result));
        return result;
    }
    const modes:Record<string,{codec:string;bitrate:number}>={SP:{codec:'SPS',bitrate:292},LP2:{codec:'AT3',bitrate:132},LP4:{codec:'AT3',bitrate:66},MONO:{codec:'SPM',bitrate:146}};
    const commands:Record<string,string>={status:'disc.refresh',workspace:'workspace.get',imports:'import.list',tasks:'task.list'};
    let result;
    if(verb === 'connect') {
        const serviceIndex=args[0] === undefined ? 0 : Number(args[0]);
        if(!Number.isInteger(serviceIndex) || serviceIndex < 0) throw new Error('Service index must be a non-negative whole number');
        result=await request({command:{type:'device.connect',serviceIndex}});
    }
    else if(verb === 'add') result=await request({action:'add',paths:args});
    else if(verb === 'command' || verb === '--file') result=await request({command:JSON.parse(verb === '--file' ? await readFile(args[0],'utf8') : args.join(' '))});
    else if(verb === 'preview' || verb === 'write') {
        const format=args[0] ? modes[args[0].toUpperCase()] : undefined;
        if(args[0] && !format) throw new Error('Mode must be SP, LP2, LP4 or MONO');
        const queue=await request({command:{type:'import.list'}});
        result=await request({command:{type:'import.preview',format,expectedImportRevision:queue.importQueue.revision}});
        if(verb === 'write') {
            const preview=result.importPreview;
            result=await request({command:{type:'import.write',format,expectedRevision:queue.importQueue.revision,expectedDeviceRevision:preview.deviceRevision,expectedDeviceSessionId:preview.deviceSessionId}});
            while(result.task && ['queued','running'].includes(result.task.status)) {
                await new Promise(resolve => setTimeout(resolve,1000));
                result=await request({command:{type:'task.get',id:result.task.id}});
            }
            if(result.task?.status !== 'succeeded') process.exitCode=1;
        }
    } else if(commands[verb]) result=await request({command:{type:commands[verb]}});
    else throw new Error('Unknown command; run --help');
    console.log(JSON.stringify(result,null,2));
}
main().catch(error => {console.error(String(error));process.exitCode=1;});
