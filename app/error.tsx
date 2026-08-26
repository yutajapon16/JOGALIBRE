'use client';

import { useEffect, useState } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<'pt' | 'es'>('pt');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    console.error('Client Application Error caught by boundary:', error);

    // エラー情報を管理者通知APIへ非同期報告
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message || 'Client Boundary Error',
          stack: error.stack,
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
        })
      }).catch(() => {});
    } catch {}

    // ユーザーの言語設定またはブラウザ言語を判定
    if (typeof localStorage !== 'undefined') {
      const savedLang = localStorage.getItem('lang');
      if (savedLang === 'es' || savedLang === 'pt') {
        setLang(savedLang);
        return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      if (navigator.language.toLowerCase().startsWith('es')) {
        setLang('es');
      } else {
        setLang('pt');
      }
    }
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

  const isEs = lang === 'es';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-6 text-center border border-gray-100 relative">
        {/* 言語切り替えトグル */}
        <div className="absolute top-4 right-4 flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setLang('pt')}
            className={`px-2 py-1 rounded-md transition ${lang === 'pt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            PT
          </button>
          <button
            type="button"
            onClick={() => setLang('es')}
            className={`px-2 py-1 rounded-md transition ${lang === 'es' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
          >
            ES
          </button>
        </div>

        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          ⚠️
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {isEs ? 'Ha ocurrido un error' : 'Ocorreu um erro'}
        </h2>

        <p className="text-sm text-gray-600 mb-5">
          {isEs 
            ? 'Por favor, intente recargar la página o limpiar la memoria caché para restaurar el sistema.'
            : 'Por favor, tente recarregar a página ou limpar a memória cache para restaurar o sistema.'}
        </p>

        {/* エラー概要（サポート・診断用） */}
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
              <span>{isEs ? 'Limpiando...' : 'Limpando...'}</span>
            ) : (
              <span>{isEs ? 'Limpiar Caché y Recargar' : 'Limpar Cache e Recarregar'}</span>
            )}
          </button>
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition cursor-pointer text-sm"
          >
            {isEs ? 'Recargar' : 'Recarregar'}
          </button>
        </div>
      </div>
    </div>
  );
}


