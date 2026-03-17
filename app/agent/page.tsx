'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// エージェント登録専用ページ
// サーバーサイドAPI経由でrole='agent'として登録し、customer_idはA001〜が自動付与される
export default function AgentRegister() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    whatsapp: '',
    accessPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      // サーバーサイドAPIを呼び出してエージェント登録（RLSを回避）
      const res = await fetch('/api/agent-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          whatsapp: form.whatsapp,
          accessPassword: form.accessPassword
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess(true);
      setForm({ email: '', password: '', fullName: '', whatsapp: '', accessPassword: '' });
    } catch (error) {
      console.error('Agent sign up error:', error);
      alert('Error al crear cuenta de agente. El email puede estar en uso.\n\nErro ao criar conta de agente. O email pode já estar em uso.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            ¡Cuenta de agente creada! / Conta de agente criada!
          </h2>
          <p className="text-gray-600 mb-6">
            Ya puedes iniciar sesión con tu cuenta.
            <br />
            Você já pode fazer login com sua conta.
          </p>
          <Link
            href="/"
            className="inline-block bg-indigo-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition"
          >
            Iniciar sesión / Fazer login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-800">Registro de Agente</h1>
          <Image src="/icons/customer-icon.png" alt="JOGALIBRE" width={32} height={32} className="rounded" />
        </div>
        <p className="text-gray-500 text-sm mb-6">
          Registro exclusivo para agentes / Registro exclusivo para agentes
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Nombre completo / Nome completo
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Contraseña / Senha
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              WhatsApp
            </label>
            <input
              type="text"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="+55..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Contraseña de registro / Senha de registro *
            </label>
            <input
              type="password"
              value={form.accessPassword}
              onChange={(e) => setForm({ ...form, accessPassword: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="Contraseña de acceso / Senha de acesso"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registrando...' : 'Registrar como Agente'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/" className="text-indigo-600 text-sm hover:underline">
            ← Volver al inicio / Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
