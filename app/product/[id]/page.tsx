'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { getTimeRemaining, calculateDefaultFobCost, calculateDefaultShippingCost, calculateLocalCost } from '@/lib/utils';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUrl = searchParams.get('url');
  const jcat = searchParams.get('jcat');

  const [productId, setProductId] = useState<string>('');
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'es' | 'pt'>('es');
  
  // ログインユーザー情報をキャッシュから同期的に初期ロード（表示のちらつきや金額計算の不一致を防止）
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('joga_user_cache');
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  
  // 選択された通貨のState (デフォルトはUSD)
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  // 引渡し場所のState (デフォルトはfob)
  const [deliveryLocation, setDeliveryLocation] = useState<'fob' | 'asuncion' | 'encarnacion' | 'pjc'>('fob');
  // 発送方法のState (デフォルトはsea)
  const [shippingMethod, setShippingMethod] = useState<'sea' | 'air'>('sea');
  // 為替レート関連のState
  const [exchangeRate, setExchangeRate] = useState(150);
  const [exchangeRates, setExchangeRates] = useState<{ [key: string]: number }>({});

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
      aiDisclaimer: '🤖 Este resumen ha sido generado automáticamente por Inteligencia Artificial (Gemini) a partir de la descripción original en japonés. No se garantiza la precisión al 100%.',
      googleDisclaimer: '🌐 Esta es una traducción automática de Google del texto original en japonés. Para mayor seguridad, verifique los detalles en la página original.',
      currentPrice: 'Precio actual',
      bids: 'Ofertas:',
      endsIn: 'Termina en:',
      yourName: 'Nombre completo',
      deliveryLocationLabel: 'Lugar de entrega',
      deliveryFob: 'Japón 🇯🇵',
      deliveryAsuncion: 'Asunción 🇵🇾',
      deliveryEncarnacion: 'Encarnación 🇵🇾',
      deliveryPjc: 'Pedro Juan Caballero 🇵🇾',
      localCostLabel: 'Costo Local',
      shippingMethodLabel: 'Método de envío',
      shippingMethodSea: 'Contenedor 🚢',
      shippingMethodAir: 'Avión ✈️'
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
      aiDisclaimer: '🤖 Este resumo foi gerado automaticamente por Inteligência Artificial (Gemini) a partir da descrição original em português (resumido do japonês). Não é garantida a precisão de 100%.',
      googleDisclaimer: '🌐 Esta é uma tradução automática do Google do texto original em japonês. Para maior segurança, verifique os detalhes na página original.',
      currentPrice: 'Preço atual',
      bids: 'Lances:',
      endsIn: 'Termina em:',
      yourName: 'Nome completo',
      deliveryLocationLabel: 'Local de entrega',
      deliveryFob: 'Japão 🇯🇵',
      deliveryAsuncion: 'Assunção 🇵🇾',
      deliveryEncarnacion: 'Encarnação 🇵🇾',
      deliveryPjc: 'Pedro Juan Caballero 🇵🇾',
      localCostLabel: 'Custo Local',
      shippingMethodLabel: 'Método de envio',
      shippingMethodSea: 'Contêiner 🚢',
      shippingMethodAir: 'Avião ✈️'
    }
  };

  const t = translations[lang];

  // プロフィール取得（トップページと同期）
  const fetchUserProfile = async (user = currentUser) => {
    if (!user) return;
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/profile?t=${Date.now()}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        credentials: 'include'
      });

      if (res.ok) {
        const { profile } = await res.json();
        if (profile) {
          setCurrentUser(prev => {
            const nextUser = prev ? {
              ...prev,
              role: profile.role || prev.role,
              fullName: profile.full_name || undefined,
              whatsapp: profile.whatsapp || undefined,
              customerId: profile.customer_id || undefined,
              address: profile.address || undefined,
              zipCode: profile.zip_code || undefined,
              country: profile.country || undefined,
              agentCustomerId: profile.agent_customer_id || undefined,
              agentFullName: profile.agent_full_name || undefined,
              depositAmount: profile.deposit_amount !== undefined && profile.deposit_amount !== null ? Number(profile.deposit_amount) : prev.depositAmount,
              depositConfirmedAt: profile.deposit_confirmed_at || prev.depositConfirmedAt,
              termsAcceptedAt: profile.terms_accepted_at || prev.termsAcceptedAt,
            } : prev;
            return nextUser;
          });
        }
      }
    } catch (error) {
      console.error('Error fetching user profile in detail page:', error);
    }
  };

  useEffect(() => {
    // URLパラメーターの id を解決
    params.then(resolvedParams => {
      setProductId(resolvedParams.id);
    });

    // URLクエリまたはローカルストレージから言語設定を取得
    const queryLang = searchParams.get('lang');
    if (queryLang === 'es' || queryLang === 'pt') {
      setLang(queryLang);
    } else {
      const savedLang = localStorage.getItem('lang');
      if (savedLang === 'es' || savedLang === 'pt') {
        setLang(savedLang);
      }
    }

    // 早期キャッシュ復元 (getCurrentUser完了までのちらつき防止)
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('joga_user_cache');
      if (cached && !currentUser) {
        try {
          const cacheData = JSON.parse(cached);
          setCurrentUser(prev => prev ? prev : { ...cacheData, email: '' } as any);
        } catch {}
      }
    }

    // 初回ロードで現在のユーザー情報を取得
    getCurrentUser().then(user => {
      if (user) {
        setCurrentUser(user);
        fetchUserProfile(user);
      }
    }).catch(err => {
      console.error('Fast failure in initial getCurrentUser:', err);
    });

    // セッションのリアルタイム変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      } else if (session?.user) {
        const user = await getCurrentUser(session.user);
        if (user) {
          let updatedUser = user;
          setCurrentUser(prev => {
            const next = prev ? {
              ...prev,
              ...user,
              customerId: user.customerId || prev.customerId,
              fullName: user.fullName || prev.fullName
            } : user;
            updatedUser = next;
            return next;
          });
          fetchUserProfile(updatedUser);
        }
      }
    });

    // 為替レートの取得
    const fetchExchangeRate = async () => {
      try {
        const res = await fetch('/api/exchange-rate');
        const data = await res.json();
        if (data.usdToJpy) {
          setExchangeRate(data.usdToJpy);
        }
        if (data.rates) {
          setExchangeRates(data.rates);
        }
      } catch (error) {
        console.error('Error fetching exchange rate:', error);
      }
    };
    fetchExchangeRate();

    return () => subscription.unsubscribe();
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
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [targetUrl, lang]);

  // 各種通貨の記号取得
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'BRL': return 'R$';
      case 'PYG': return '₲';
      case 'CLP': return '$';
      case 'BOB': return 'Bs.';
      case 'ARS': return '$';
      default: return '$';
    }
  };

  // 通貨換算の計算ロジック（トップページと完全同期）
  const calculateConvertedPrice = (jpyPrice: number, targetCurrency: string = selectedCurrency) => {
    let productUrlWithCategory = product ? (product.url + (product.categoryId ? (product.url.includes('?') ? '&' : '?') + 'auccat=' + product.categoryId : '')) : '';
    if (jcat) {
      productUrlWithCategory += (productUrlWithCategory.includes('?') ? '&' : '?') + `jcat=${jcat}`;
    }
    const FOB_COST = product ? calculateDefaultFobCost(product.titleJa || product.title, productUrlWithCategory) : 1500;
    const SHIPPING_COST = product ? calculateDefaultShippingCost(product.titleJa || product.title, productUrlWithCategory) : 0;
    const totalJpyPrice = jpyPrice + FOB_COST + SHIPPING_COST;
    
    // B001本人は0.9(10%利益)、B001紐づき顧客は0.5(50%利益)、ブラジルエージェントは0.7(30%利益)、通常エージェントは0.8(20%)、通常顧客は0.6(40%)
    const profitDivisor = (() => {
      if (currentUser?.customerId === 'B001') return 0.9;
      if (currentUser?.agentCustomerId === 'B001') return 0.5;
      if (currentUser?.customerId?.startsWith('A')) {
        const countryLower = currentUser.country?.trim().toLowerCase();
        if (countryLower === 'brasil' || countryLower === 'brazil') {
          return 0.7; // ブラジルエージェント: 30%利益率
        }
        return 0.8; // 通常エージェント: 20%利益率
      }
      return 0.6;
    })();
    
    const priceWithProfit = totalJpyPrice / profitDivisor;
    
    const jpyRate = exchangeRates['JPY'] || exchangeRate || 150;
    const usdPrice = priceWithProfit / jpyRate;
    const roundedUp = Math.ceil(usdPrice / 10) * 10;
    
    if (targetCurrency === 'USD') {
      return roundedUp.toLocaleString('en-US');
    } else {
      const rate = exchangeRates[targetCurrency] || 1;
      const rawConverted = roundedUp * rate;
      
      let finalConverted = rawConverted;
      if (targetCurrency === 'BRL' || targetCurrency === 'BOB') {
        finalConverted = Math.ceil(rawConverted / 10) * 10;
      } else if (targetCurrency === 'PYG' || targetCurrency === 'CLP' || targetCurrency === 'ARS') {
        finalConverted = Math.ceil(rawConverted / 1000) * 1000;
      } else {
        finalConverted = Math.ceil(rawConverted);
      }
      
      return finalConverted.toLocaleString('en-US').replace(/,/g, '.');
    }
  };

  // 引渡し場所に応じた現地費用（USD）を返す関数
  const getLocalCost = (productUrl: string | null): number => {
    if (deliveryLocation === 'fob') return 0;
    const loc = deliveryLocation === 'asuncion' ? 'ASU' : (deliveryLocation === 'encarnacion' ? 'ENC' : 'PJC');
    return calculateLocalCost(loc, { productUrl }, shippingMethod);
  };

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

      // エージェントが紐づく顧客の場合はエージェント名を、それ以外は入力された顧客名を送信
      const finalCustomerName = (currentUser?.role === 'customer' && currentUser?.agentCustomerId)
        ? (currentUser?.agentFullName || '')
        : bidForm.name;

      // 日本円の現在価格からUSD建ての参考落札限界額などを計算
      let finalUrl = product.url + (product.categoryId ? (product.url.includes('?') ? '&' : '?') + 'auccat=' + product.categoryId : '');
      if (jcat) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `jcat=${jcat}`;
      }
      
      const res = await fetch('/api/bid-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          productId: product.id,
          productTitle: product.titleJa || product.title,
          productUrl: finalUrl,
          productImage: product.imageUrl,
          productPrice: product.currentPrice,
          maxBid: Number(bidForm.maxBid),
          customerName: finalCustomerName,
          language: lang,
          deliveryLocation: deliveryLocation === 'fob' ? 'JP' : (deliveryLocation === 'asuncion' ? 'ASU' : (deliveryLocation === 'encarnacion' ? 'ENC' : 'PJC')),
          shippingMethod: deliveryLocation === 'fob' ? 'sea' : shippingMethod
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
          <p className="text-red-500 font-bold mb-4">{t.errorFetch}</p>
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
      {/* ヘッダー (戻る・通貨・言語ドロップダウンを均等に3等分して配置、文言はすべて中央揃え) */}
      <header className="bg-white shadow sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-2 grid grid-cols-3 gap-2 items-center">
          <button
            onClick={() => router.back()}
            className="h-12 w-full bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:scale-[0.98] transition flex items-center justify-center text-xs font-bold text-center"
          >
            {t.back}
          </button>
          
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className="bg-gray-100 border border-gray-200 text-gray-700 h-12 px-2 rounded-lg text-xs font-bold w-full text-center"
            style={{ textAlignLast: 'center', textAlign: 'center' }}
          >
            <option value="USD">USD 🇺🇸</option>
            <option value="BRL">BRL 🇧🇷</option>
            <option value="PYG">PYG 🇵🇾</option>
            <option value="CLP">CLP 🇨🇱</option>
            <option value="BOB">BOB 🇧🇴</option>
            <option value="ARS">ARS 🇦🇷</option>
          </select>

          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
            className="bg-gray-100 border border-gray-200 text-gray-700 h-12 px-2 rounded-lg text-xs font-bold w-full text-center"
            style={{ textAlignLast: 'center', textAlign: 'center' }}
          >
            <option value="es">Español</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2 space-y-2">
          <select
            value={deliveryLocation}
            onChange={(e) => setDeliveryLocation(e.target.value as any)}
            className="w-full h-12 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
          >
            <option value="fob">{t.deliveryFob}</option>
            <option value="asuncion">{t.deliveryAsuncion}</option>
            <option value="encarnacion">{t.deliveryEncarnacion}</option>
            <option value="pjc">{t.deliveryPjc}</option>
          </select>

          {/* 発送方法選択ドロップダウン */}
          {deliveryLocation !== 'fob' && (
            <select
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value as any)}
              className="w-full h-12 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center animate-in fade-in duration-300"
            >
              <option value="sea">{t.shippingMethodSea}</option>
              <option value="air">{t.shippingMethodAir}</option>
            </select>
          )}
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

        {/* 商品タイトル (h-12ボックスから取り出し、他画面と同様に2行まで表示) */}
        <h2 className="text-sm sm:text-base font-bold text-gray-800 line-clamp-2 leading-tight w-full px-1">
          {product.title}
        </h2>

        {/* 2. 商品の基本情報（項目は左揃え、数値は右揃えでスタイリング） */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
          {/* 入札件数 */}
          <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">{t.bids}</span>
            <span className="text-xs sm:text-sm font-bold text-gray-700 bg-white px-2 py-0.5 rounded shadow-sm">
              {product.bids || 0}
            </span>
          </div>

          {/* 終了まで (背景薄い赤、文字赤) */}
          <div className="h-12 px-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between text-red-700 font-semibold">
            <span className="text-xs font-bold">{t.endsIn}</span>
            <span className="text-xs sm:text-sm">
              {getTimeRemaining(product.endTime || '', lang, product.timeLeft)}
            </span>
          </div>

          {/* 通常の価格表示 (1段) */}
          <div className="h-12 px-3 bg-green-50 border border-green-100 rounded-lg flex items-center justify-between text-green-700 font-bold">
            <span className="text-xs">{t.currentPrice}: {selectedCurrency}</span>
            <span className="text-sm sm:text-base font-extrabold">
              {getCurrencySymbol(selectedCurrency)} {calculateConvertedPrice(product.currentPrice)}
            </span>
          </div>
          
          {/* 通常ユーザー用現地費用ボックス（現在価格の下） */}
          {deliveryLocation !== 'fob' && (
            <>
              <div className="h-12 px-3 bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-between text-orange-700 font-bold shadow-sm">
                <span className="text-xs">{t.localCostLabel}</span>
                <span className="text-sm sm:text-base font-extrabold">
                  $ {getLocalCost(product.url)}
                </span>
              </div>
              {/* 発送方法 */}
              <div className="h-12 px-3 bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-between text-orange-700 font-bold shadow-sm">
                <span className="text-xs">{t.shippingMethodLabel}</span>
                <span className="text-sm sm:text-base font-semibold text-gray-700">
                  {shippingMethod === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                </span>
              </div>
            </>
          )}
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

          {/* 注意書き・免責事項の出し分け */}
          <p className={`text-[10px] font-semibold leading-normal p-3 rounded-xl border ${
            !showFallbackDescription 
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
              : 'bg-yellow-50 text-yellow-700 border-yellow-200'
          }`}>
            {!showFallbackDescription ? t.aiDisclaimer : t.googleDisclaimer}
          </p>

          {/* 元のヤフオクページへ遷移するボタン（免責事項の下に配置移動＆h-7化） */}
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-7 bg-[#ff0033] hover:opacity-90 rounded text-center text-xs text-white font-bold flex items-center justify-center transition shadow-sm"
          >
            {t.originalPage}
          </a>
        </div>

        {/* 4. 直接オファー送信フォーム（オファーポップアップと同一スタイル） */}
        {currentUser && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h3 className="font-black text-sm text-indigo-900 flex items-center gap-2">
              📋 {t.makeOffer}
            </h3>

            <form onSubmit={handleOfferSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  {(currentUser?.role === 'customer' && currentUser?.agentCustomerId)
                    ? (lang === 'es' ? 'Tu agente' : 'Seu agente')
                    : t.yourName}
                </label>
                <input
                  type="text"
                  value={
                    (currentUser?.role === 'customer' && currentUser?.agentCustomerId)
                      ? (currentUser?.agentFullName || '')
                      : bidForm.name
                  }
                  onChange={(e) => {
                    if (!(currentUser?.role === 'customer' && currentUser?.agentCustomerId)) {
                      setBidForm(prev => ({ ...prev, name: e.target.value }));
                    }
                  }}
                  readOnly={!!(currentUser?.role === 'customer' && currentUser?.agentCustomerId)}
                  className={`w-full border border-gray-300 rounded-lg px-4 h-12 text-base shadow-sm focus:ring-2 focus:ring-indigo-500 font-bold placeholder:text-gray-300 placeholder:font-normal ${
                    (currentUser?.role === 'customer' && currentUser?.agentCustomerId)
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200'
                      : ''
                  }`}
                  required
                  placeholder={lang === 'es' ? 'Nombre y Apellido del Cliente' : 'Nome e Sobrenome do Cliente'}
                />
              </div>

              <div>
                <label className="flex justify-between items-center text-sm font-semibold mb-2 text-gray-700">
                  <span>{t.maxBid}</span>
                  <span className="text-[10px] sm:text-xs text-red-500 font-bold">
                    {t.warnUsd}
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    placeholder="USD"
                    value={bidForm.maxBid}
                    onChange={(e) => setBidForm(prev => ({ ...prev, maxBid: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg pl-8 pr-4 h-12 text-lg font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300 placeholder:font-normal"
                    required
                    min="1"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`w-full bg-indigo-600 text-white h-12 rounded-lg font-semibold transition flex items-center justify-center ${
                  submitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                }`}
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span>{t.submit}</span>
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
