import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DevicesIds } from 'netmd-js/dist/netmd';
const exec = promisify(execFile);
export interface DriverDevice { id: string; name: string; service: string; status: string; eligible: boolean }
export function classifyDevice(row: { PNPDeviceID: string; Name: string; Service: string; Status: string }): DriverDevice | null {
    const match = /USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(row.PNPDeviceID);
    if (!match) return null;
    const device = DevicesIds.find(item => item.vendorId === parseInt(match[1],16) && item.deviceId === parseInt(match[2],16));
    if (!device) return null;
    // Never replace mass-storage or composite-parent drivers through this helper.
    const service = row.Service || '';
    return { id: row.PNPDeviceID, name: device.name || row.Name, service, status: row.Status,
        eligible: !['winusb','usbstor','uaspstor','usbccgp','usbhub','usbhub3'].includes(service.toLowerCase()) && !/&MI_/i.test(row.PNPDeviceID) };
}
export async function scanDrivers(): Promise<DriverDevice[]> {
    const script = "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like 'USB\\VID_*' } | Select-Object PNPDeviceID,Name,Service,Status) | ConvertTo-Json -Compress";
    const { stdout } = await exec('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { windowsHide:true, timeout:30000, maxBuffer:2*1024*1024 });
    const parsed = JSON.parse(stdout.trim() || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).map(classifyDevice).filter((value): value is DriverDevice => value !== null);
}
