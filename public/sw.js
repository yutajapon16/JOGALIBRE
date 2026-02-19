// JOGALIBRE Service Worker
const CACHE_NAME = 'jogalibre-v2';

// インストール時
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// アクティベート時（古いキャッシュを削除）
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// ネットワークファースト戦略（APIはキャッシュしない）
self.addEventListener('fetch', (event) => {
    // API リクエストはネットワークのみ
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功したレスポンスをキャッシュ
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // オフライン時はキャッシュから返す
                return caches.match(event.request);
            })
    );
});

// プッシュ通知を受信した時
self.addEventListener('push', (event) => {
    const defaultData = {
        title: 'JOGALIBRE',
        body: '新しい通知があります',
        icon: '/icons/customer-icon.png',
        badge: '/icons/customer-icon.png',
        url: '/',
    };

    let data = defaultData;
    try {
        if (event.data) {
            data = { ...defaultData, ...event.data.json() };
        }
    } catch (e) {
        if (event.data) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icons/customer-icon.png',
        badge: data.badge || '/icons/customer-icon.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || '/' },
        actions: [],
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 通知をクリックした時
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // 既に開いているタブがあればフォーカス
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // なければ新しいタブで開く
                return self.clients.openWindow(url);
            })
    );
});
