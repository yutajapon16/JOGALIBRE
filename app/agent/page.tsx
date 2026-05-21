'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { COUNTRIES } from '@/lib/constants';

// エージェント登録専用ページ
// サーバーサイドAPI経由でrole='agent'として登録し、customer_idはA001〜が自動付与される
export default function AgentRegister() {
  const [lang, setLang] = useState<'es' | 'pt'>('es');
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    whatsapp: '',
    accessPassword: '',
    address: '',
    zipCode: '',
    country: ''
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
          accessPassword: form.accessPassword,
          address: form.address,
          zipCode: form.zipCode,
          country: form.country
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess(true);
      setForm({ email: '', password: '', fullName: '', whatsapp: '', accessPassword: '', address: '', zipCode: '', country: '' });
    } catch (error) {
      console.error('Agent sign up error:', error);
      alert(lang === 'es'
        ? 'Error al crear cuenta de agent. El email puede estar en uso.'
        : 'Erro ao criar conta de agente. O email pode já estar em uso.');
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
            {lang === 'es' ? '¡Cuenta de agente creada!' : 'Conta de agente criada!'}
          </h2>
          <p className="text-gray-600 mb-6">
            {lang === 'es'
              ? 'Ya puedes iniciar sesión con tu cuenta.'
              : 'Você já pode fazer login com sua conta.'}
          </p>
          <Link
            href="/"
            className="inline-block bg-indigo-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition"
          >
            {lang === 'es' ? 'Iniciar sesión' : 'Fazer login'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-800">
            {lang === 'es' ? 'Registro de Agente' : 'Registro de Agente'}
          </h1>
          <Image src="/icons/customer-icon.png" alt="JOGALIBRE" width={32} height={32} className="rounded" />
        </div>
        <p className="text-gray-500 text-sm mb-6">
          {lang === 'es' ? 'Registro exclusivo para agentes' : 'Registro exclusivo para agentes'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {lang === 'es' ? 'Idioma' : 'Idioma'}
            </label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white"
            >
              <option value="es">Español</option>
              <option value="pt">Português</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {lang === 'es' ? 'Nombre completo' : 'Nome completo'}
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
              {lang === 'es' ? 'Contraseña' : 'Senha'}
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
              {lang === 'es' ? 'País' : 'País'}
            </label>
            <select
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white"
              required
            >
              <option value="" disabled>
                {lang === 'es' ? 'Seleccionar país' : 'Selecionar país'}
              </option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={lang === 'es' ? c.es : c.pt}>
                  {lang === 'es' ? c.es : c.pt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {lang === 'es' ? 'Código Postal' : 'Código Postal'}
            </label>
            <input
              type="text"
              value={form.zipCode}
              onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="12345-678"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {lang === 'es' ? 'Dirección' : 'Endereço'}
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder={lang === 'es' ? 'Calle, Número, Ciudad' : 'Rua, Número, Cidade'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {lang === 'es' ? 'Contraseña de registro *' : 'Senha de registro *'}
            </label>
            <input
              type="password"
              value={form.accessPassword}
              onChange={(e) => setForm({ ...form, accessPassword: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder={lang === 'es' ? 'Contraseña de acceso' : 'Senha de acesso'}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registrando...' : (lang === 'es' ? 'Registrar como Agente' : 'Registrar como Agente')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/" className="text-indigo-600 text-sm hover:underline">
            {lang === 'es' ? '← Volver al inicio' : '← Voltar ao início'}
          </Link>
        </div>
      </div>
    </div>
  );
}
