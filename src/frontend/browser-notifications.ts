export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

type NotificationPermissionApi = Pick<typeof Notification, 'permission' | 'requestPermission'>;

type NotificationConstructorApi = NotificationPermissionApi & {
    new (title: string, options?: NotificationOptions): Notification;
};

function browserNotificationApi(): NotificationConstructorApi | undefined {
    if (typeof window === 'undefined' || !('Notification' in window)) return undefined;
    return window.Notification as NotificationConstructorApi;
}

export function getBrowserNotificationPermission(
    api: NotificationPermissionApi | undefined = browserNotificationApi()
): BrowserNotificationPermission {
    return api?.permission ?? 'unsupported';
}

export async function requestBrowserNotificationPermission(
    api: NotificationPermissionApi | undefined = browserNotificationApi()
): Promise<BrowserNotificationPermission> {
    if (!api) return 'unsupported';
    if (api.permission !== 'default') return api.permission;
    return api.requestPermission();
}

export function tryCreateBrowserNotification(
    title: string,
    options?: NotificationOptions,
    api: NotificationConstructorApi | undefined = browserNotificationApi()
): Notification | null {
    if (!api || api.permission !== 'granted') return null;
    try {
        return new api(title, options);
    } catch {
        return null;
    }
}
