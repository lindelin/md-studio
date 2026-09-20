import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    releaseActiveLocalApplicationBridge,
    replaceActiveLocalApplicationBridge,
    type LocalBridgeHost,
} from '../src/application/local-bridge-lifecycle.ts';

describe('local browser bridge lifecycle', () => {
    it('stops the previous bridge before a hot replacement becomes active', () => {
        const stopped: string[] = [];
        const host: LocalBridgeHost = {};
        const first = { stop: () => stopped.push('first') };
        const second = { stop: () => stopped.push('second') };

        replaceActiveLocalApplicationBridge(host, first);
        replaceActiveLocalApplicationBridge(host, second);
        releaseActiveLocalApplicationBridge(host, second);

        assert.deepEqual(stopped, ['first', 'second']);
    });

    it('does not clear a newer bridge when an older hot module is disposed late', () => {
        const stopped: string[] = [];
        const host: LocalBridgeHost = {};
        const first = { stop: () => stopped.push('first') };
        const second = { stop: () => stopped.push('second') };

        replaceActiveLocalApplicationBridge(host, first);
        replaceActiveLocalApplicationBridge(host, second);
        releaseActiveLocalApplicationBridge(host, first);
        replaceActiveLocalApplicationBridge(host);

        assert.deepEqual(stopped, ['first', 'first', 'second']);
    });
});
