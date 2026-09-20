import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retryRemoteRequest } from '../src/services/remote-request.ts';

describe('bounded remote requests', () => {
    it('retries transient failures and returns the successful result', async () => {
        let attempts = 0;
        const result = await retryRemoteRequest(
            'Library test request',
            async () => {
                attempts += 1;
                if (attempts === 1) throw new Error('temporary network error');
                return 'ready';
            },
            { attempts: 2, timeoutMs: 100 }
        );

        assert.equal(result, 'ready');
        assert.equal(attempts, 2);
    });

    it('bounds silent requests and reports the final timeout', async () => {
        let attempts = 0;
        await assert.rejects(
            retryRemoteRequest(
                'Library test request',
                (signal) =>
                    new Promise((_resolve, reject) => {
                        attempts += 1;
                        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
                    }),
                { attempts: 2, timeoutMs: 5 }
            ),
            /failed after 2 attempts\. Timed out after 5 ms\./
        );
        assert.equal(attempts, 2);
    });

    it('preserves the last server error and rejects invalid retry settings', async () => {
        await assert.rejects(
            retryRemoteRequest('Library test request', async () => {
                throw new Error('HTTP 503.');
            }, { attempts: 2, timeoutMs: 100 }),
            /failed after 2 attempts\. HTTP 503\./
        );
        await assert.rejects(
            retryRemoteRequest('Library test request', async () => 'unused', { attempts: 0 }),
            /attempts must be a whole number from 1 to 10/
        );
    });
});
