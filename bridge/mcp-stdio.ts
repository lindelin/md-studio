import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createBridgeRuntime } from './mcp-server';
const runtime = createBridgeRuntime({
    host: process.env.MINIDISC_BRIDGE_HOST,
    port: process.env.MINIDISC_BRIDGE_PORT ? Number(process.env.MINIDISC_BRIDGE_PORT) : undefined,
    token: process.env.MINIDISC_BRIDGE_TOKEN,
    allowedOrigins: process.env.MINIDISC_ALLOWED_ORIGINS?.split(',').map(value => value.trim()),
});
async function main() {
    await runtime.bridge.ready;
    const stdio = serveStdio(runtime.createServer);
    process.on('SIGINT', () => void Promise.allSettled([stdio.close(), runtime.close()]).then(() => process.exit(0)));
    console.error(`MD Studio bridge on ${runtime.bridge.host}:${runtime.bridge.port}`);
}
main().catch(async error => { console.error(error); await runtime.close(); process.exitCode = 1; });
