const ACTIVE_LOCAL_BRIDGE_KEY = '__minidiscWorkspaceLocalBridge__' as const;

type LocalBridgeLifecycle = {
    stop(): void;
};

export type LocalBridgeHost = {
    [ACTIVE_LOCAL_BRIDGE_KEY]?: LocalBridgeLifecycle;
};

export function replaceActiveLocalApplicationBridge(host: LocalBridgeHost, next?: LocalBridgeLifecycle) {
    const previous = host[ACTIVE_LOCAL_BRIDGE_KEY];
    if (previous && previous !== next) previous.stop();
    if (next) host[ACTIVE_LOCAL_BRIDGE_KEY] = next;
    else delete host[ACTIVE_LOCAL_BRIDGE_KEY];
}

export function releaseActiveLocalApplicationBridge(host: LocalBridgeHost, bridge?: LocalBridgeLifecycle) {
    if (!bridge) return;
    bridge.stop();
    if (host[ACTIVE_LOCAL_BRIDGE_KEY] === bridge) delete host[ACTIVE_LOCAL_BRIDGE_KEY];
}
