// プッシュ通知ユーティリティ（クライアント側）
const VAPID_PUBLIC_KEY = 'BMgO11arVCaq8epmUOq7YtLPY8F2x2dyPl4bUvkx0c-T-6su72j0FR4Nd2CV8qgeEpDlCTCyvi9pfuFnguHkHUs';
export async function requestNotificationPermission(): Promise<string | null> {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.warn('プッシュ通知はこのブラウザでサポートされていません');
        return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        console.warn('通知の許可が拒否されました');
        return null;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
            VAPID_PUBLIC_KEY
        ) as any,
    });

    return JSON.stringify(subscription);
}

// VAPID公開鍵をUint8Arrayに変換
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// 通知の許可状態をチェック
export function getNotificationPermission(): string {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
}
