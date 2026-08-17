'use client';

import { useEffect, useState } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    console.error('Client Application Error caught by boundary:', error);
  }, [error]);

  const handleClearCacheAndReload = async () => {
    setClearing(true);
    try {
      // 1. ローカルストレージとセッションストレージを全クリア
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }

      // 2. ServiceWorker のキャッシュを破棄
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }

      // 3. ServiceWorker を登録解除
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }
    } catch (e) {
      console.warn('Error clearing cache:', e);
    }

    // 4. キャッシュバスターを付けてハードリロード
    if (typeof window !== 'undefined') {
      window.location.href = `/?_t=${Date.now()}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-6 text-center border border-gray-100">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Ocorreu um erro / Ha ocurrido un error
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Por favor, tente recarregar a página ou limpar o cache.
          <br />
          Por favor, intente recargar la página o limpiar la caché.
        </p>

        {/* エラー概要（サポート用） */}
        {error?.message && (
          <div className="mb-5 p-3 bg-gray-50 rounded-lg text-left border border-gray-100">
            <p className="text-[11px] font-mono text-gray-500 break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleClearCacheAndReload}
            disabled={clearing}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {clearing ? (
              <span>Limpando / Limpiando...</span>
            ) : (
              <span>Limpar Cache e Recarregar / Limpiar Caché y Recargar</span>
            )}
          </button>
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition cursor-pointer text-sm"
          >
            Recarregar / Recargar
          </button>
        </div>
      </div>
    </div>
  );
}

