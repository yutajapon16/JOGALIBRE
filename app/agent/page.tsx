'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { COUNTRIES, BRAZIL_STATES } from '@/lib/constants';

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
    country: '',
    cpf: '',
    state: '',
    city: ''
  });
  const [cities, setCities] = useState<{ id: number; nome: string }[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  // 州変更時に市名を取得
  useEffect(() => {
    if (form.country === 'Brasil' && form.state) {
      setCitiesLoading(true);
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${form.state}/municipios`)
        .then(res => res.json())
        .then(data => {
          setCities(data || []);
          setCitiesLoading(false);
        })
        .catch(err => {
          console.error(err);
          setCitiesLoading(false);
        });
    } else {
      setCities([]);
    }
  }, [form.state, form.country]);

  // CEP自動補完処理
  const handleCepChange = async (cepVal: string) => {
    const cleanCep = cepVal.replace(/\D/g, '');
    setForm(prev => ({ ...prev, zipCode: cepVal }));
    if (cleanCep.length === 8 && form.country === 'Brasil') {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(prev => ({
            ...prev,
            state: data.uf,
            city: data.localidade,
            address: `${data.logradouro || ''}${data.logradouro && data.bairro ? ', ' : ''}${data.bairro || ''}`
          }));
        }
      } catch (e) {
        console.error('Error fetching ViaCEP:', e);
      }
    }
  };
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
          country: form.country,
          cpf: form.cpf,
          state: form.state,
          city: form.city
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess(true);
      setForm({ email: '', password: '', fullName: '', whatsapp: '', accessPassword: '', address: '', zipCode: '', country: '', cpf: '', state: '', city: '' });
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
              onChange={(e) => setForm({ ...form, country: e.target.value, state: '', city: '', zipCode: '', address: '', cpf: '' })}
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

          {form.country === 'Brasil' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                CPF
              </label>
              <input
                type="text"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="000.000.000-00"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              {form.country === 'Brasil' ? 'CEP' : (lang === 'es' ? 'Código Postal' : 'Código Postal')}
            </label>
            <input
              type="text"
              value={form.zipCode}
              onChange={(e) => {
                if (form.country === 'Brasil') {
                  handleCepChange(e.target.value);
                } else {
                  setForm({ ...form, zipCode: e.target.value });
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder={form.country === 'Brasil' ? '00000-000' : '12345-678'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {lang === 'es' ? 'Estado' : 'Estado'}
            </label>
            {form.country === 'Brasil' ? (
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value, city: '' })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white"
                required
              >
                <option value="" disabled>
                  {lang === 'es' ? 'Seleccionar estado' : 'Selecionar estado'}
                </option>
                {BRAZIL_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.state || ''}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder={lang === 'es' ? 'Provincia / Estado' : 'Província / Estado'}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {lang === 'es' ? 'Ciudad' : 'Cidade'}
            </label>
            {form.country === 'Brasil' ? (
              <select
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white"
                required
                disabled={citiesLoading}
              >
                <option value="" disabled>
                  {citiesLoading 
                    ? (lang === 'es' ? 'Cargando...' : 'Carregando...') 
                    : (lang === 'es' ? 'Seleccionar ciudad' : 'Selecionar cidade')}
                </option>
                {cities.find(c => c.nome === form.city) === undefined && form.city && (
                  <option value={form.city}>{form.city}</option>
                )}
                {cities.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.city || ''}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder={lang === 'es' ? 'Ciudad' : 'Cidade'}
              />
            )}
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
              placeholder={lang === 'es' ? 'Calle, Número, Barrio' : 'Rua, Número, Bairro'}
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
