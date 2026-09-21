export {};
declare global {
    interface Window { mdDesktop?: {
        bridgeUrl?: string;
        openControls(): Promise<void>;
        runInBackground(): Promise<void>;
        onUsbChoices(callback: (devices: {id:string;name:string;usbId:string;serial:string}[] | null) => void): () => void;
        selectUsbDevice(id:string | null): Promise<void>;
        onOpenControls(callback: () => void): () => void;
        status(): Promise<{enabled:boolean;url:string;cli:string;error?:string}>;
        setMcp(enabled:boolean): Promise<{enabled:boolean;url:string}>;
        drivers(): Promise<{id:string;name:string;service:string;status:string;eligible:boolean}[]>;
        installDriver(id:string): Promise<unknown>;
        copy(value:string): Promise<void>;
        exportSkill(): Promise<string | undefined>;
    } }
}
