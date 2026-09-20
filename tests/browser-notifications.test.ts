import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    getBrowserNotificationPermission,
    requestBrowserNotificationPermission,
    tryCreateBrowserNotification,
} from '../src/frontend/browser-notifications.ts';

describe('browser completion notifications', () => {
    it('reports unsupported environments without requesting permission', async () => {
        assert.equal(getBrowserNotificationPermission(undefined), 'unsupported');
        assert.equal(await requestBrowserNotificationPermission(undefined), 'unsupported');
    });

    it('requests permission only from the browser default state', async () => {
        let requests = 0;
        const api = {
            permission: 'default' as NotificationPermission,
            async requestPermission() {
                requests += 1;
                return 'granted' as NotificationPermission;
            },
        };

        assert.equal(await requestBrowserNotificationPermission(api), 'granted');
        assert.equal(requests, 1);
        api.permission = 'denied';
        assert.equal(await requestBrowserNotificationPermission(api), 'denied');
        assert.equal(requests, 1);
    });

    it('creates notifications only after permission and contains constructor failures', () => {
        const created: string[] = [];
        class FakeNotification {
            static permission: NotificationPermission = 'granted';
            static async requestPermission() { return this.permission; }
            onclick: ((event: Event) => unknown) | null = null;
            constructor(title: string) { created.push(title); }
        }

        const notification = tryCreateBrowserNotification(
            'MiniDisc recording completed',
            undefined,
            FakeNotification as unknown as typeof Notification
        );
        assert.ok(notification);
        assert.deepEqual(created, ['MiniDisc recording completed']);

        FakeNotification.permission = 'default';
        assert.equal(
            tryCreateBrowserNotification('not allowed', undefined, FakeNotification as unknown as typeof Notification),
            null
        );

        class FailingNotification extends FakeNotification {
            static permission: NotificationPermission = 'granted';
            constructor(title: string) {
                super(title);
                throw new Error('notification service unavailable');
            }
        }
        assert.equal(
            tryCreateBrowserNotification('contained', undefined, FailingNotification as unknown as typeof Notification),
            null
        );
    });
});
