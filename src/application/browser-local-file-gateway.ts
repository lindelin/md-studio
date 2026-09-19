export interface ImportPayloadResolver {
    resolve(reference: string): Promise<File>;
}

export interface ExportPayloadSink {
    write(outputHandle: string, name: string, data: Uint8Array): Promise<string | undefined>;
}

export class BrowserLocalFileGateway implements ImportPayloadResolver, ExportPayloadSink {
    private resolver?: ImportPayloadResolver;
    private sink?: ExportPayloadSink;

    attach(endpoint: ImportPayloadResolver & ExportPayloadSink) {
        this.resolver = endpoint;
        this.sink = endpoint;
    }

    canResolve() {
        return this.resolver !== undefined;
    }

    canWrite() {
        return this.sink !== undefined;
    }

    resolve(reference: string) {
        if (!this.resolver) throw new Error('The local import bridge is not connected.');
        return this.resolver.resolve(reference);
    }

    write(outputHandle: string, name: string, data: Uint8Array) {
        if (!this.sink) throw new Error('The local export bridge is not connected.');
        return this.sink.write(outputHandle, name, data);
    }
}
