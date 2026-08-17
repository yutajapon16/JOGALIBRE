'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global Error caught:', error);
  }, [error]);

  return (
    <html lang="pt">
      <body className="bg-gray-50 flex items-center justify-center min-h-screen p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-6 text-center border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Erro no aplicativo / Error en la aplicación
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Ocorreu um erro inesperado. Clique abaixo para tentar novamente.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md"
          >
            Recarregar / Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
