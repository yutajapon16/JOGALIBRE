'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { updatePassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [sessionReady, setSessionReady] = useState(false);

    useEffect(() => {
        // Supabase がリセットリンクのトークンを自動的に処理するのを待つ
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionReady(true);
            }
        });

        // すでにセッションがある場合（リダイレクト後）
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSessionReady(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres. / A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden. / As senhas não coincidem.');
            return;
        }

        setLoading(true);
        try {
            await updatePassword(newPassword);
            setSuccess(true);
        } catch (err: unknown) {
            console.error('Password update error:', err);
            setError('Error al actualizar la contraseña. / Erro ao atualizar a senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
                <h1 className="text-2xl font-bold text-center mb-2 text-indigo-900">
                    🔑 JOGALIBRE
                </h1>
                <h2 className="text-lg text-center mb-6 text-gray-600">
                    Nueva Contraseña / Nova Senha
                </h2>

                {success ? (
                    <div className="text-center">
                        <div className="text-4xl mb-4">✅</div>
                        <p className="text-green-600 font-semibold mb-2">
                            ¡Contraseña actualizada! / Senha atualizada!
                        </p>
                        <p className="text-sm text-gray-500 mb-6">
                            Ya puedes iniciar sesión con tu nueva contraseña.
                            <br />
                            Agora você pode fazer login com sua nova senha.
                        </p>
                        <Link
                            href="/"
                            className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
                        >
                            Ir al Login / Ir para Login
                        </Link>
                    </div>
                ) : !sessionReady ? (
                    <div className="text-center">
                        <div className="text-4xl mb-4">⏳</div>
                        <p className="text-gray-500">
                            Verificando enlace... / Verificando link...
                        </p>
                        <p className="text-sm text-gray-400 mt-2">
                            Si este mensaje persiste, el enlace puede haber expirado.
                            <br />
                            Se esta mensagem persistir, o link pode ter expirado.
                        </p>
                        <Link
                            href="/"
                            className="inline-block mt-4 text-sm text-indigo-600 hover:underline"
                        >
                            Volver al inicio / Voltar ao início
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Nueva contraseña / Nova senha
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base"
                                required
                                minLength={6}
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Confirmar contraseña / Confirmar senha
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base"
                                required
                                minLength={6}
                            />
                        </div>

                        {error && (
                            <p className="text-red-600 text-sm">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
                        >
                            {loading
                                ? 'Actualizando... / Atualizando...'
                                : 'Actualizar Contraseña / Atualizar Senha'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
