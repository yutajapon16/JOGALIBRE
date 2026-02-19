// JOGALIBRE Service Worker
const CACHE_NAME = 'jogalibre-v1';

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
