'use client';

import { useState, useEffect } from 'react';

const translations = {
  es: {
    title: 'JOGALIBRE',
    subtitle: 'Subastas de Yahoo Japón',
    language: 'Idioma',
    searchPlaceholder: 'Pega la URL del producto de Yahoo Auctions aquí...',
    import: 'Importar',
    currentPrice: 'Precio actual',
    shippingCost: 'Costo de envío',
    totalPrice: 'Precio total',
    shippingUnknown: 'El costo de envío se agregará en la contraoferta',
    usdPrice: 'Precio USD',
    bids: 'Ofertas',
    timeLeft: 'Tiempo restante',
    makeOffer: 'Hacer oferta',
    yourName: 'Nombre del cliente',
    maxBid: 'Oferta máxima (USD)',
    submit: 'Enviar solicitud',
    cancel: 'Cancelar',
    login: 'Iniciar sesión',
    email: 'Correo electrónico',
    password: 'Contraseña',
    loginButton: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    myRequests: 'Mis Solicitudes',
    purchasedItems: 'Productos Comprados',
    backToSearch: 'Volver a búsqueda',
    status: 'Estado',
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    counter_offer: 'Contraoferta',
    won: 'Ganado',
    lost: 'Perdido',
    rejectReason: 'Razón de rechazo',
    counterOfferAmount: 'Contraoferta',
    yourCounterOffer: 'Tu contraoferta (USD)',
    accept: 'Aceptar',
    reject: 'Rechazar',
    counterOfferAction: 'Contraoferta',
    confirm: 'Confirmar',
    total: 'Total',
    finalPrice: 'Precio final',
    date: 'Fecha',
    refresh: 'Actualizar',
    confirmedDate: 'Fecha de confirmación',
    sortBy: 'Ordenar por',
    customerName: 'Cliente',
    filterByCustomer: 'Filtrar por',
    allCustomers: 'Todos los clientes',
    endsIn: 'Termina en',
    viewOnYahoo: 'Ver en Yahoo! →',
    exchangeRate: 'Tipo de cambio',
    days: 'días',
    hours: 'horas',
    minutes: 'minutos',
    dShort: 'd',
    hShort: 'h',
    mShort: 'm',
  },
  pt: {
    title: 'JOGALIBRE',
    subtitle: 'Leilões do Yahoo Japão',
    language: 'Idioma',
    searchPlaceholder: 'Cole a URL do produto do Yahoo Auctions aqui...',
    import: 'Importar',
    currentPrice: 'Preço atual',
    shippingCost: 'Custo de envio',
    totalPrice: 'Preço total',
    shippingUnknown: 'O custo de envio será adicionado na contraoferta',
    usdPrice: 'Preço USD',
    bids: 'Lances',
    timeLeft: 'Tempo restante',
    makeOffer: 'Fazer oferta',
    yourName: 'Nome do cliente',
    maxBid: 'Lance máximo (USD)',
    submit: 'Enviar solicitação',
    cancel: 'Cancelar',
    login: 'Entrar',
    email: 'E-mail',
    password: 'Senha',
    loginButton: 'Entrar',
    logout: 'Sair',
    myRequests: 'Minhas Solicitações',
    purchasedItems: 'Produtos Comprados',
    backToSearch: 'Voltar para busca',
    status: 'Estado',
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    counter_offer: 'Contraoferta',
    won: 'Ganho',
    lost: 'Perdido',
    rejectReason: 'Razão da rejeição',
    counterOfferAmount: 'Contraoferta',
    yourCounterOffer: 'Sua contraoferta (USD)',
    accept: 'Aceitar',
    reject: 'Rejeitar',
    counterOfferAction: 'Contraoferta',
    confirm: 'Confirmar',
    total: 'Total',
    finalPrice: 'Preço final',
    date: 'Data',
    refresh: 'Atualizar',
    confirmedDate: 'Data de confirmação',
    sortBy: 'Ordenar por',
    customerName: 'Cliente',
    filterByCustomer: 'Filtrar por',
    allCustomers: 'Todos os clientes',
    endsIn: 'Termina em',
    viewOnYahoo: 'Ver em Yahoo! →',
    exchangeRate: 'Taxa de câmbio',
    days: 'dias',
    hours: 'horas',
    minutes: 'minutos',
    dShort: 'd',
    hShort: 'h',
    mShort: 'm',
  }
};

export default function Home() {
  const [lang, setLang] = useState<'es' | 'pt'>('es');
  const [searchUrl, setSearchUrl] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [bidForm, setBidForm] = useState({ name: '', maxBid: '' });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [showMyRequests, setShowMyRequests] = useState(false);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [showPurchased, setShowPurchased] = useState(false);
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [purchasedTotal, setPurchasedTotal] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [sortPurchasedBy, setSortPurchasedBy] = useState<'date' | 'name'>('date');
  const [exchangeRate, setExchangeRate] = useState(150);

  const t = translations[lang];

  useEffect(() => {
    fetchExchangeRate();
  }, []);

  useEffect(() => {
    if (currentUser && showMyRequests) {
      fetchMyRequests();
      const interval = setInterval(fetchMyRequests, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser, showMyRequests]);

  const fetchExchangeRate = async () => {
    try {
      const res = await fetch('/api/exchange-rate');
      const data = await res.json();
      if (data.usdToJpy) {
        setExchangeRate(data.usdToJpy);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  };

  const fetchPurchasedItems = async () => {
    try {
      const res = await fetch(`/api/bid-request?email=${currentUser?.email}&purchased=true`);
      const data = await res.json();
      
      // スネークケースからキャメルケースに変換
      const convertedItems = (data.purchasedItems || []).map((item: any) => ({
        id: item.id,
        productTitle: item.product_title,
        productImage: item.product_image,
        productUrl: item.product_url,
        finalPrice: item.final_price,
        customerEmail: item.customer_email,
        customerName: item.customer_name,
        confirmedAt: item.confirmed_at
      }));
      
      setPurchasedItems(convertedItems);
      setPurchasedTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching purchased items:', error);
    }
  };

  const getCustomerList = () => {
    const uniqueCustomers = new Map<string, string>();
    purchasedItems.forEach(item => {
      if (!uniqueCustomers.has(item.customerName)) {
        uniqueCustomers.set(item.customerName, item.customerName);
      }
    });
    return Array.from(uniqueCustomers.values()).sort((a, b) => a.localeCompare(b));
  };

  const getFilteredItems = () => {
    if (selectedCustomer === 'all') {
      return purchasedItems;
    }
    return purchasedItems.filter(item => item.customerName === selectedCustomer);
  };

  const getCustomerTotal = (customerName: string) => {
    return purchasedItems
      .filter(item => item.customerName === customerName)
      .reduce((sum, item) => sum + (item.finalPrice || 0), 0);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/bid-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          email: loginForm.email,
          password: loginForm.password
        })
      });

      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        setLoginForm({ email: '', password: '' });
      } else {
        alert('Invalid credentials');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setShowMyRequests(false);
    setShowPurchased(false);
  };

  const handleBidRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      alert('Please login first');
      return;
    }

    try {
      const res = await fetch('/api/bid-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          productTitle: selectedProduct.title,
          productUrl: selectedProduct.url,
          productImage: selectedProduct.imageUrl,
          productPrice: selectedProduct.currentPrice,
          productEndTime: selectedProduct.endTime,
          maxBid: parseFloat(bidForm.maxBid),
          customerName: bidForm.name,
          currentEmail: currentUser.email,
          language: lang
        })
      });

      if (res.ok) {
        setSelectedProduct(null);
        setBidForm({ name: '', maxBid: '' });
        setProducts(products.filter(p => p.id !== selectedProduct.id));
        alert('Bid request submitted successfully!');
      }
    } catch (error) {
      console.error('Error submitting bid request:', error);
    }
  };

  const calculateUSDPrice = (jpyPrice: number, shippingCost: number = 0) => {
    const FOB_COST = 1350;
    const totalJpyPrice = jpyPrice + shippingCost + FOB_COST;
    const priceWithProfit = totalJpyPrice / 0.8;
    const usdPrice = priceWithProfit / exchangeRate;
    const roundedUp = Math.ceil(usdPrice / 10) * 10;
    return roundedUp.toLocaleString('en-US');
  };

  const fetchMyRequests = async () => {
    try {
      const res = await fetch(`/api/bid-request?email=${currentUser?.email}`);
      const data = await res.json();
      
      // スネークケースからキャメルケースに変換
      const convertedRequests = (data.bidRequests || []).map((req: any) => ({
        id: req.id,
        productId: req.product_id,
        productTitle: req.product_title,
        productUrl: req.product_url,
        productImage: req.product_image,
        productPrice: req.product_price,
        productEndTime: req.product_end_time,
        maxBid: req.max_bid,
        customerName: req.customer_name,
        customerEmail: req.customer_email,
        language: req.language,
        status: req.status,
        createdAt: req.created_at,
        approvedAt: req.approved_at,
        rejectReason: req.reject_reason,
        counterOffer: req.counter_offer,
        shippingCostJpy: req.shipping_cost_jpy,
        customerCounterOffer: req.customer_counter_offer,
        customerCounterOfferUsed: req.customer_counter_offer_used,
        finalStatus: req.final_status,
        finalPrice: req.final_price,
        customerConfirmed: req.customer_confirmed,
        customerMessage: req.customer_message,
        adminNeedsConfirm: req.admin_needs_confirm
      }));
      
      setMyRequests(convertedRequests);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleImport = async () => {
    if (!searchUrl.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/yahoo-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: searchUrl })
      });

      const data = await res.json();
      console.log('Imported product data:', data.product);
      if (data.product) {
        setProducts([data.product]);
      }
    } catch (error) {
      console.error('Error importing product:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'counter_offer': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getFinalStatusColor = (finalStatus: string) => {
    switch (finalStatus) {
      case 'won': return 'bg-green-100 text-green-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCounterOfferResponse = async (requestId: string, action: 'accept' | 'reject' | 'counter', counterAmount?: number) => {
    try {
      if (action === 'accept') {
        await fetch('/api/bid-request', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: requestId,
            customerAction: 'accept_counter'
          })
        });
      } else if (action === 'reject') {
        await fetch('/api/bid-request', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: requestId,
            customerAction: 'reject_counter'
          })
        });
      } else if (action === 'counter' && counterAmount) {
        await fetch('/api/bid-request', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: requestId,
            customerCounterOffer: counterAmount
          })
        });
      }

      fetchMyRequests();
    } catch (error) {
      console.error('Error responding to counter offer:', error);
    }
  };

  const handleFinalStatusConfirm = async (requestId: string, message?: string) => {
    try {
      await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requestId,
          customerConfirmed: true,
          customerMessage: message || ''
        })
      });

      fetchMyRequests();
    } catch (error) {
      console.error('Error confirming:', error);
    }
  };

  const getTimeRemaining = (endTime: string) => {
    if (!endTime) return '0m';
    
    const now = new Date().getTime();
    const end = new Date(endTime).getTime();
    const diff = end - now;
    
    console.log('Time calculation:', { endTime, now: new Date(now).toISOString(), end: new Date(end).toISOString(), diff });
    
    if (diff <= 0) return '0m';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}${t.dShort} ${hours}${t.hShort}`;
    if (hours > 0) return `${hours}${t.hShort} ${minutes}${t.mShort}`;
    return `${minutes}${t.mShort}`;
  };
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-black mb-2">{t.title}</h1>
          <p className="text-gray-600 mb-6">{t.subtitle}</p>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">{t.language}</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
            >
              <option value="es">Español</option>
              <option value="pt">Português</option>
            </select>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.email}</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.password}</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              {t.loginButton}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-black">{t.title}</h1>
              <p className="text-sm sm:text-base text-gray-600">{t.subtitle}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800 whitespace-nowrap ml-4"
            >
              {t.logout}
            </button>
          </div>
          
          <div className="flex flex-col gap-2 mb-3">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              <option value="es">Español</option>
              <option value="pt">Português</option>
            </select>
            
            {!showMyRequests && !showPurchased && (
              <>
                <button
                  onClick={() => { setShowMyRequests(true); fetchMyRequests(); }}
                  className="bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition text-sm w-full"
                >
                  {t.myRequests}
                </button>
                <button
                  onClick={() => { setShowPurchased(true); fetchPurchasedItems(); }}
                  className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition text-sm w-full"
                >
                  {t.purchasedItems}
                </button>
              </>
            )}
            
            {(showMyRequests || showPurchased) && (
              <>
                <button
                  onClick={() => {
                    if (showMyRequests) fetchMyRequests();
                    if (showPurchased) fetchPurchasedItems();
                  }}
                  className="bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition text-sm w-full"
                >
                  {t.refresh}
                </button>
                <button
                  onClick={() => {
                    setShowMyRequests(false);
                    setShowPurchased(false);
                  }}
                  className="bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 transition text-sm w-full"
                >
                  {t.backToSearch}
                </button>
              </>
            )}
          </div>
          
          <div className="text-xs sm:text-sm text-gray-600">
            {t.exchangeRate}: <span className="font-semibold">USD 1 = JPY {exchangeRate.toFixed(2)}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {showMyRequests ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-6">{t.myRequests}</h2>

            {myRequests.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>No hay solicitudes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4">
                    <div className="flex gap-4 mb-3">
                      {request.productImage && (
                        <img 
                          src={request.productImage} 
                          alt={request.productTitle}
                          className="w-32 h-32 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{request.productTitle}</h3>
                        <a
                          href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(request.productUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-sm mb-2 inline-block"
                        >
                          {t.viewOnYahoo}
                        </a>
                        <div className="flex gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(request.status)}`}>
                            {t[request.status as keyof typeof t] || request.status}
                          </span>
                          {request.finalStatus && (
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getFinalStatusColor(request.finalStatus)}`}>
                              {t[request.finalStatus as keyof typeof t]}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {t.maxBid}: ${Math.round(request.maxBid).toLocaleString('en-US')}
                        </p>
                        {request.productEndTime && (
                          <p className="text-xs text-gray-500 mt-1">
                            {t.endsIn}: <span className="font-semibold text-red-600">{getTimeRemaining(request.productEndTime)}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {request.rejectReason && (
                      <div className="mb-3 p-3 bg-red-50 rounded">
                        <p className="text-sm text-gray-600">{t.rejectReason}:</p>
                        <p className="font-semibold text-red-700">{request.rejectReason}</p>
                      </div>
                    )}

                    {request.counterOffer && !request.customerCounterOfferUsed && request.status === 'counter_offer' && (
                      <div className="mb-3 p-3 bg-blue-50 rounded">
                        <p className="text-sm text-gray-600">{t.counterOfferAmount}:</p>
                        <p className="font-semibold text-blue-700 text-xl mb-3">
                          ${Math.round(request.counterOffer).toLocaleString('en-US')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCounterOfferResponse(request.id, 'accept')}
                            className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                          >
                            {t.accept}
                          </button>
                          <button
                            onClick={() => {
                              const amount = prompt(t.yourCounterOffer);
                              if (amount) {
                                handleCounterOfferResponse(request.id, 'counter', parseFloat(amount));
                              }
                            }}
                            className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
                          >
                            {t.counterOfferAction}
                          </button>
                          <button
                            onClick={() => handleCounterOfferResponse(request.id, 'reject')}
                            className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
                          >
                            {t.reject}
                          </button>
                        </div>
                      </div>
                    )}

                    {request.customerCounterOffer && (
                      <div className="mb-3 p-3 bg-purple-50 rounded">
                        <p className="text-sm text-gray-600">{t.yourCounterOffer}:</p>
                        <p className="font-semibold text-purple-700">${Math.round(request.customerCounterOffer).toLocaleString('en-US')}</p>
                      </div>
                    )}

                    {request.finalStatus === 'won' && (
                      <div className="mb-3 p-3 bg-green-50 rounded">
                        <p className="text-sm text-gray-600">{t.finalPrice}:</p>
                        <p className="text-4xl font-bold text-green-600">
                          ${Math.round(request.finalPrice).toLocaleString('en-US')}
                        </p>
                        <button
                          onClick={() => handleFinalStatusConfirm(request.id)}
                          className="mt-3 w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                        >
                          {t.confirm}
                        </button>
                      </div>
                    )}

                    {request.finalStatus === 'lost' && (
                      <div className="mb-3 p-3 bg-red-50 rounded">
                        <p className="font-semibold text-red-700">{t.lost}</p>
                        <button
                          onClick={() => handleFinalStatusConfirm(request.id)}
                          className="mt-3 w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
                        >
                          {t.confirm}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : showPurchased ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">{t.purchasedItems}</h2>
            
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap w-28">{t.filterByCustomer}:</span>
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-3 text-base flex-1"
                >
                  <option value="all">{t.allCustomers}</option>
                  {getCustomerList().map(customerName => (
                    <option key={customerName} value={customerName}>
                      {customerName} - ${Math.round(getCustomerTotal(customerName)).toLocaleString('en-US')}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap w-28">{t.sortBy}:</span>
                <select
                  value={sortPurchasedBy}
                  onChange={(e) => setSortPurchasedBy(e.target.value as 'date' | 'name')}
                  className="border border-gray-300 rounded px-3 py-3 text-base flex-1"
                >
                  <option value="date">{t.date}</option>
                  <option value="name">{t.customerName}</option>
                </select>
              </div>
            </div>

            {purchasedItems.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>No hay productos comprados</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {getFilteredItems()
                    .sort((a, b) => {
                      if (sortPurchasedBy === 'name') {
                        return a.customerName.localeCompare(b.customerName);
                      }
                      return new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime();
                    })
                    .map((item, index) => (
                    <div key={`purchased-${index}-${item.id}`} className="border rounded-lg p-4">
                      {item.productImage && (
                        <img 
                          src={item.productImage} 
                          alt={item.productTitle}
                          className="w-full aspect-square object-cover rounded mb-3"
                        />
                      )}
                      <h3 className="text-sm font-semibold mb-3">{item.productTitle}</h3>
                      <div className="space-y-2 text-xs mb-3">
                          <div>
                            <span className="text-gray-600">Cliente: </span>
                            <span className="font-semibold">{item.customerName}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">{t.confirmedDate}</span>
                            <span className="font-semibold">{formatDateTime(item.confirmedAt)}</span>
                          </div>
                        </div>
                        <a

                          href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(item.productUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-xs inline-block mb-3"
                        >
                          {t.viewOnYahoo}
                        </a>
                      
                      <div className="text-right pt-3 border-t">
                        <p className="text-xl font-bold text-green-600">
                          ${Math.round(item.finalPrice).toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold">
                      {t.total}{selectedCustomer !== 'all' && ' del cliente'}:
                    </span>
                    <span className="text-3xl font-bold text-indigo-600">
                      ${Math.round(
                        selectedCustomer === 'all' 
                          ? purchasedTotal 
                          : getCustomerTotal(selectedCustomer)
                      ).toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
                >
                  {loading ? '...' : t.import}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {products.map((product) => {
                console.log('Rendering product:', product);
                console.log('Product endTime:', product.endTime);
                return (
                <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="aspect-square w-full overflow-hidden">
                    <img 
                      src={product.imageUrl} 
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 sm:p-4">
                    <h3 className="text-sm sm:text-base font-semibold mb-2 line-clamp-2">{product.title}</h3>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{t.currentPrice}:</span>
                        <span className="font-semibold">¥{product.currentPrice.toLocaleString()}</span>
                      </div>
                      {product.shippingCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{t.shippingCost}:</span>
                          <span className="font-semibold">¥{product.shippingCost.toLocaleString()}</span>
                        </div>
                      )}
                      {product.shippingCost > 0 && (
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span className="text-gray-600 font-semibold">{t.totalPrice}:</span>
                          <span className="font-bold">¥{(product.currentPrice + product.shippingCost).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">{t.usdPrice}:</span>
                        <span className="text-2xl font-bold text-indigo-600">
                          ${calculateUSDPrice(product.currentPrice, product.shippingCost || 0)}
                        </span>
                      </div>
                      {product.shippingUnknown && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                          <p className="text-xs text-yellow-800">⚠️ {t.shippingUnknown}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between text-sm mb-4">
                      <span className="text-gray-600">{t.bids}: {product.bids}</span>
                      <span className="text-gray-600">{t.timeLeft}: <span className="font-semibold text-red-600">{getTimeRemaining(product.endTime)}</span></span>
                    </div>

                    <a
                      href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(product.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline text-sm mb-3 inline-block"
                    >
                      {t.viewOnYahoo}

                    </a>

                    <button
                      onClick={() => setSelectedProduct(product)}
                      className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition text-sm sm:text-base"
                    >
                      {t.makeOffer}
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </>
        )}
      </main>

      {selectedProduct && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold mb-4">{t.makeOffer}</h2>
            
            <div className="flex gap-4 mb-6">
              <img 
                src={selectedProduct.imageUrl} 
                alt={selectedProduct.title}
                className="w-32 h-32 object-cover rounded"
              />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">{selectedProduct.title}</h3>
                <p className="text-sm text-gray-600">
                  {t.currentPrice}: ¥{selectedProduct.currentPrice.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  USD: ${calculateUSDPrice(selectedProduct.currentPrice, selectedProduct.shippingCost || 0)}
                </p>
                <a
                  href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(selectedProduct.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline text-sm"
                >
                  {t.viewOnYahoo}
                </a>
              </div>
            </div>

            <form onSubmit={handleBidRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t.yourName}</label>
                <input
                  type="text"
                  value={bidForm.name}
                  onChange={(e) => setBidForm({ ...bidForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t.maxBid}</label>
                <input
                  type="number"
                  value={bidForm.maxBid}
                  onChange={(e) => setBidForm({ ...bidForm, maxBid: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setBidForm({ name: '', maxBid: '' });
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
                >
                  {t.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}