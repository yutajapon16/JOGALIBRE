'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Client Application Error caught by boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-6 text-center border border-gray-100">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Ocorreu um erro / Ha ocurrido un error
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Por favor, tente recarregar a página ou voltar para a tela inicial.
          <br />
          Por favor, intente recargar la página o volver a la pantalla de inicio.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md"
          >
            Recarregar / Recargar
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
          >
            Página Inicial / Inicio
          </button>
        </div>
      </div>
    </div>
  );
}
