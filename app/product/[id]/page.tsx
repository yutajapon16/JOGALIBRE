'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';


export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUrl = searchParams.get('url');

  const [productId, setProductId] = useState<string>('');
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'es' | 'pt'>('es');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // カルーセル（画像）用のインデックス
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // オファー申請フォームのState
  const [bidForm, setBidForm] = useState({ name: '', maxBid: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 言語リソースの定義
  const translations = {
    es: {
      title: 'Vista de Producto con IA',
      back: 'Volver',
      originalPage: 'Ver página original',
      aiSummaryTitle: '🤖 Resumen de Inteligencia Artificial (IA)',
      specs: 'Especificaciones / Detalles',
      status: 'Estado del producto',
      functioning: 'Funcionamiento',
      accessories: 'Accesorios',
      shipping: 'Envío en Japón',
      makeOffer: 'Hacer Oferta',
      maxBid: 'Tu oferta máxima',
      submit: 'Enviar Oferta',
      loading: 'Obteniendo detalles del producto y generando resumen de IA...',
      errorFetch: 'No se pudo cargar la información del producto.',
      errorUrl: 'URL de producto no válida.',
      warnUsd: '⚠️ Ingrese el monto en USD',
      offerSuccess: '¡Oferta enviada con éxito!',
      offerError: 'Error al enviar la oferta. Por favor, inténtelo de nuevo.',
      disclaimer: '※ Este resumen es generado automáticamente por IA a partir de la descripción en japonés. No se garantiza la precisión al 100%. Verifique también la página original.',
      currentPrice: 'Precio actual (USD)',
      bids: 'Ofertas'
    },
    pt: {
      title: 'Visualização de Produto com IA',
      back: 'Voltar',
      originalPage: 'Ver página original',
      aiSummaryTitle: '🤖 Resumo da Inteligência Artificial (IA)',
      specs: 'Especificações / Detalhes',
      status: 'Estado do produto',
      functioning: 'Funcionamento',
      accessories: 'Acessórios',
      shipping: 'Envio no Japão',
      makeOffer: 'Fazer Oferta',
      maxBid: 'Sua oferta máxima',
      submit: 'Enviar Oferta',
      loading: 'Obtendo detalhes do produto e gerando resumo de IA...',
      errorFetch: 'Não foi possível carregar as informações do produto.',
      errorUrl: 'URL do produto inválida.',
      warnUsd: '⚠️ Insira o valor em USD',
      offerSuccess: '¡Oferta enviada com sucesso!',
      offerError: 'Erro ao enviar a oferta. Por favor, tente novamente.',
      disclaimer: '※ Este resumo é gerado automaticamente por IA a partir da descrição em japonês. Não é garantida a precisão de 100%. Verifique também a página original.',
      currentPrice: 'Preço atual (USD)',
      bids: 'Lances'
    }
  };

  const t = translations[lang];

  useEffect(() => {
    // URLパラメーターの id を解決
    params.then(resolvedParams => {
      setProductId(resolvedParams.id);
    });

    // ローカルストレージなどから言語設定を取得
    const savedLang = localStorage.getItem('lang');
    if (savedLang === 'es' || savedLang === 'pt') {
      setLang(savedLang);
    }

    // 現在のユーザー情報を取得
    getCurrentUser().then(user => {
      setCurrentUser(user);
    });
  }, [params]);

  // ユーザーがロードされたら、名前の初期値をフォームにセット
  useEffect(() => {
    if (currentUser) {
      const defaultName = (currentUser.role === 'customer' && currentUser.agentCustomerId)
        ? (currentUser.agentFullName || '')
        : (currentUser.fullName || '');
      setBidForm(prev => ({ ...prev, name: defaultName }));
    }
  }, [currentUser]);

  // 商品詳細とAI要約の取得
  useEffect(() => {
    if (!targetUrl) {
      setLoading(false);
      return;
    }

    const fetchProduct = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;

        const res = await fetch('/api/yahoo-product', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': accessToken ? `Bearer ${accessToken}` : ''
          },
          body: JSON.stringify({ url: targetUrl, lang })
        });

        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        if (data.product) {
          setProduct(data.product);
        } else {
          throw new Error('No product data');
        }
      } catch (err) {
        console.error('Error fetching product details:', err);
        setMessage({ type: 'error', text: t.errorFetch });
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [targetUrl, lang]);

  // オファー送信処理
  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || submitting) return;

    if (!bidForm.maxBid.trim() || isNaN(Number(bidForm.maxBid))) {
      setMessage({ type: 'error', text: lang === 'es' ? 'Por favor ingrese un monto válido.' : 'Por favor insira um valor válido.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      // 日本円の現在価格からUSD建ての参考落札限界額などを計算
      const res = await fetch('/api/bid-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          productId: product.id,
          productTitle: product.title,
          productUrl: product.url,
          imageUrl: product.imageUrl,
          currentPriceJpy: product.currentPrice,
          maxBidUsd: Number(bidForm.maxBid),
          customerName: bidForm.name,
          language: lang
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: t.offerSuccess });
        setBidForm(prev => ({ ...prev, maxBid: '' }));
      } else {
        setMessage({ type: 'error', text: data.message || t.offerError });
      }
    } catch (err) {
      console.error('Error submitting bid request:', err);
      setMessage({ type: 'error', text: t.offerError });
    } finally {
      setSubmitting(false);
    }
  };

  // カルーセル画像の左右操作
  const nextImage = () => {
    if (!product || !product.images) return;
    setCurrentImageIndex(prev => (prev + 1) % product.images.length);
  };

  const prevImage = () => {
    if (!product || !product.images) return;
    setCurrentImageIndex(prev => (prev - 1 + product.images.length) % product.images.length);
  };

  if (!targetUrl) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow text-center">
          <p className="text-red-500 font-bold mb-4">{t.errorUrl}</p>
          <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg">{t.back}</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 text-center font-medium animate-pulse">{t.loading}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl shadow text-center max-w-md w-full">
          <p className="text-red-500 font-bold mb-4">{message?.text || t.errorFetch}</p>
          <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg w-full">{t.back}</button>
        </div>
      </div>
    );
  }

  // AI要約（aiSummaryEs または aiSummaryPt）の取得、無い場合はGoogle翻訳テキストをフォールバックに
  const aiSummary = lang === 'es' ? product.aiSummaryEs : product.aiSummaryPt;
  const showFallbackDescription = !aiSummary;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* ヘッダー */}
      <header className="bg-white shadow sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← {t.back}
          </button>
          <h1 className="text-sm sm:text-base font-black text-gray-900 truncate max-w-[200px] sm:max-w-sm">
            {product.title}
          </h1>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
            className="bg-gray-100 border border-gray-200 text-gray-700 py-1 px-2 rounded-lg text-xs font-bold"
          >
            <option value="es">Español</option>
            <option value="pt">Português</option>
          </select>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* メッセージ表示 */}
        {message && (
          <div className={`p-4 rounded-xl text-sm font-bold shadow-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 1. 商品画像カルーセル */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative group">
          <div className="relative aspect-video w-full bg-gray-100 flex items-center justify-center">
            {product.images && product.images.length > 0 ? (
              <Image
                src={product.images[currentImageIndex]}
                alt={`${product.title} - Image ${currentImageIndex + 1}`}
                fill
                className="object-contain"
                priority
                sizes="(max-width: 768px) 100vw, 640px"
              />
            ) : (
              <div className="text-gray-400 text-sm font-bold">No Image</div>
            )}

            {/* カルーセル矢印ボタン */}
            {product.images && product.images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-3 top-50% -translate-y-1/2 bg-black/55 hover:bg-black/75 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-md"
                  aria-label="Previous image"
                >
                  ❮
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-3 top-50% -translate-y-1/2 bg-black/55 hover:bg-black/75 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-md"
                  aria-label="Next image"
                >
                  ❯
                </button>
              </>
            )}

            {/* カルーセルページ表示 */}
            {product.images && product.images.length > 1 && (
              <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {currentImageIndex + 1} / {product.images.length}
              </div>
            )}
          </div>
        </div>

        {/* 2. 商品の基本情報 */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
            {product.title}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-bold uppercase">{t.currentPrice}</span>
              <span className="text-lg font-black text-indigo-700 mt-0.5">
                $ {Math.ceil(product.currentPrice / 150)} {/* USD簡易計算 */}
              </span>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-bold uppercase">{t.bids}</span>
              <span className="text-lg font-black text-gray-700 mt-0.5">
                {product.bids || 0}
              </span>
            </div>
          </div>

          {/* 元のヤフオクページへ遷移するボタン */}
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-9 bg-[#ff0033] hover:opacity-90 rounded text-center text-xs text-white font-bold flex items-center justify-center transition shadow-sm"
          >
            {t.originalPage}
          </a>
        </div>

        {/* 3. AI要約翻訳エリア */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <h3 className="font-black text-sm text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            {t.aiSummaryTitle}
          </h3>

          {!showFallbackDescription ? (
            // AIによる構造化された要約
            <div className="text-xs text-gray-700 space-y-3 leading-relaxed whitespace-pre-line font-medium">
              {aiSummary}
            </div>
          ) : (
            // AI要約が無い場合のGoogle翻訳フォールバック
            <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
              {product.translatedDescription || (lang === 'es' ? 'No hay descripción disponible.' : 'Nenhuma descrição disponível.')}
            </div>
          )}

          {/* 免責事項 */}
          <p className="text-[9px] text-gray-400 font-medium leading-normal bg-gray-50 p-2.5 rounded-lg border border-gray-100">
            {t.disclaimer}
          </p>
        </div>

        {/* 4. 直接オファー送信フォーム */}
        {currentUser && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h3 className="font-black text-sm text-indigo-900 flex items-center gap-2">
              📋 {t.makeOffer}
            </h3>

            <form onSubmit={handleOfferSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                  {lang === 'es' ? 'Nombre completo' : 'Nome completo'}
                </label>
                <input
                  type="text"
                  value={bidForm.name}
                  onChange={(e) => setBidForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 h-11 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 font-bold"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-gray-500 uppercase">
                    {t.maxBid}
                  </label>
                  <span className="text-[10px] font-bold text-red-500 animate-pulse">
                    {t.warnUsd}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">$</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={bidForm.maxBid}
                    onChange={(e) => setBidForm(prev => ({ ...prev, maxBid: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl pl-8 pr-4 h-11 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-bold"
                    required
                    min="1"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold rounded-xl transition text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>{t.submit}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
