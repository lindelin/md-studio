import { WebSocketServer, type WebSocket } from 'ws';
import { LocalBridgeBroker } from './broker.ts';

export interface LocalBridgeServerOptions {
    host?: string;
    port?: number;
    token?: string;
    allowedOrigins?: string[];
}

const defaultAllowedOrigins = [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export function startLocalBridgeServer(broker: LocalBridgeBroker, options: LocalBridgeServerOptions = {}) {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? 47123;
    const allowedOrigins = options.allowedOrigins?.map((origin) => new RegExp(`^${escapeRegExp(origin)}$`)) ?? defaultAllowedOrigins;
    const server = new WebSocketServer({
        host,
        port,
        verifyClient(info, done) {
            const originAllowed = Boolean(info.origin && allowedOrigins.some((pattern) => pattern.test(info.origin)));
            const requestUrl = new URL(info.req.url ?? '/', `http://${host}:${port}`);
            const tokenAllowed = !options.token || requestUrl.searchParams.get('token') === options.token;
            done(originAllowed && tokenAllowed, originAllowed ? 401 : 403);
        },
    });

    server.on('connection', (socket: WebSocket) => {
        const detach = broker.attach(socket);
        socket.on('message', (data) => {
            try {
                broker.handleMessage(socket, data.toString());
            } catch (error) {
                console.error('Rejected invalid browser bridge message:', error);
                socket.close(1008, 'Invalid bridge message');
            }
        });
        socket.on('close', detach);
        socket.on('error', (error) => console.error('Browser bridge socket error:', error));
    });

    return {
        host,
        port,
        close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
