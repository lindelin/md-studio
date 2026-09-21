import { createServer, type IncomingMessage } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node';
import type { createBridgeRuntime } from '../bridge/mcp-server';
export async function readJson(req: IncomingMessage) {
    const parts: Buffer[] = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 1024 * 1024) throw new Error('Request too large'); parts.push(part); }
    return JSON.parse(Buffer.concat(parts.map(part => new Uint8Array(part))).toString());
}
export async function startMcpHttp(runtime: ReturnType<typeof createBridgeRuntime>, token: string, port = 47124) {
    const handler = createMcpHandler(runtime.createServer, { responseMode: 'json' });
    const route = `/mcp/${token}`;
    const nodeHandler = toNodeHandler(handler);
    const host = localhostHostValidation(); const origin = localhostOriginValidation();
    const server = createServer((req, res) => {
        if (!host(req, res) || !origin(req, res)) return;
        if (req.url !== route) { res.writeHead(404).end(); return; }
        void nodeHandler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    });
    try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
    catch (error) { await handler.close(); throw error; }
    const address = server.address();
    return { url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}${route}`,
        async close() { await handler.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
