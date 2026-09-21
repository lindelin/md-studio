import { readFile,writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('../vendor/zadig/manifest.json',import.meta.url),'utf8'));
const response=await fetch(manifest.url);
if(!response.ok)throw new Error(`Driver download failed: ${response.status}`);
const bytes=new Uint8Array(await response.arrayBuffer());
if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw new Error('Driver checksum mismatch');
await writeFile(new URL('../vendor/zadig/zadig-2.9.exe',import.meta.url),bytes);
console.log('Verified Zadig 2.9 prepared. No drivers were installed.');
