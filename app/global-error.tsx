'use client';

import { useEffect, useState } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<'pt' | 'es'>('pt');

  useEffect(() => {
    console.error('Global Error caught:', error);

    // エラー情報を管理者通知APIへ非同期報告
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message || 'Unknown Global Error',
          stack: error.stack,
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
        })
      }).catch(() => {});
    } catch {}

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

  const isEs = lang === 'es';

  return (
    <html lang={lang}>
      <body className="bg-gray-50 flex items-center justify-center min-h-screen p-4">
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
            {isEs ? 'Error en la aplicación' : 'Erro no aplicativo'}
          </h2>

          <p className="text-sm text-gray-600 mb-6">
            {isEs
              ? 'Ha ocurrido un error inesperado. Haga clic abajo para intentar de nuevo.'
              : 'Ocorreu um erro inesperado. Clique abaixo para tentar novamente.'}
          </p>

          <button
            onClick={() => {
              if (typeof localStorage !== 'undefined') {
                localStorage.clear();
              }
              if (typeof window !== 'undefined') {
                window.location.href = `/?_t=${Date.now()}`;
              } else {
                reset();
              }
            }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md cursor-pointer"
          >
            {isEs ? 'Limpiar Caché y Recargar' : 'Limpar Cache e Recarregar'}
          </button>
        </div>
      </body>
    </html>
  );
}

