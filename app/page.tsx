'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { signIn, signUp, signOut, getCurrentUser, resetPassword, updatePassword, updateProfile, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/push-notifications';

const translations = {
  es: {
    title: 'JOGALIBRE',
    subtitle: 'Subastas de Yahoo Japón',
    language: 'Idioma',
    searchPlaceholder: 'Pega la URL del producto de Yahoo Auctions aquí...',
    import: 'Obtener Cotización',
    currentPrice: 'Precio actual',
    shippingCost: 'Costo de envío',
    totalPrice: 'Precio total',
    shippingUnknown: 'El costo de envío se agregará en la contraoferta',
    usdPrice: 'Precio USD',
    bids: 'Ofertas',
    timeLeft: 'Tiempo restante',
    makeOffer: 'Hacer oferta',
    yourName: 'Nombre del cliente',
    maxBid: 'Tu oferta máxima',
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
    yourCounterOffer: 'Tu contraoferta',
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
    offerSuccess: '¡Oferta enviada con éxito!',
    offerError: 'Error al enviar la oferta. Por favor, inténtalo de nuevo.',
    days: 'días',
    hours: 'horas',
    minutes: 'minutos',
    dShort: 'd',
    hShort: 'h',
    mShort: 'm',
    myPage: 'Mi Cuenta',
    profile: 'Perfil',
    fullName: 'Nombre completo',
    whatsapp: 'WhatsApp',
    saveProfile: 'Guardar cambios',
    changePassword: 'Cambiar contraseña',
    newPassword: 'Nueva contraseña',
    confirmNewPassword: 'Confirmar nueva contraseña',
    search: 'Buscar',
    notifications: 'Notificaciones Push',
    enableNotifications: 'Activar notificaciones',
    disableNotifications: 'Desactivar notificaciones',
    notificationsEnabled: 'Notificaciones activadas \u2705',
    notificationsDisabled: 'Notificaciones desactivadas',
    sendComprobante: 'Enviar comprobante de pago',
    searchByUrl: 'Importar por URL',
    searchByKeyword: 'Buscar por Palabra',
    searchByCategories: 'Categorías',
    keywordPlaceholder: 'Buscar productos (ej. reloj, bolso...)',
    searching: 'Buscando...',
    back: 'Volver',
    productDetail: 'Detalle del Producto',
    description: 'Descripción',
    loadingDetail: 'Cargando detalles...',
    previous: 'Anterior',
    next: 'Próximo',
  },
  pt: {
    title: 'JOGALIBRE',
    subtitle: 'Leilões do Yahoo Japão',
    language: 'Idioma',
    searchPlaceholder: 'Cole a URL do produto do Yahoo Auctions aqui...',
    import: 'Obter Cotação',
    currentPrice: 'Preço atual',
    shippingCost: 'Custo de envio',
    totalPrice: 'Preço total',
    shippingUnknown: 'O custo de envio será adicionado na contraoferta',
    usdPrice: 'Preço USD',
    bids: 'Lances',
    timeLeft: 'Tempo restante',
    makeOffer: 'Fazer oferta',
    yourName: 'Nome do cliente',
    maxBid: 'Sua oferta máxima',
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
    won: 'Ganhado',
    lost: 'Perdido',
    rejectReason: 'Razão da rejeição',
    counterOfferAmount: 'Contraoferta',
    yourCounterOffer: 'Sua contraoferta',
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
    offerSuccess: 'Oferta enviada com sucesso!',
    offerError: 'Erro ao enviar oferta. Por favor, tente novamente.',
    days: 'dias',
    hours: 'horas',
    minutes: 'minutos',
    dShort: 'd',
    hShort: 'h',
    mShort: 'm',
    myPage: 'Minha Conta',
    profile: 'Perfil',
    fullName: 'Nome completo',
    whatsapp: 'WhatsApp',
    saveProfile: 'Salvar alterações',
    changePassword: 'Alterar senha',
    newPassword: 'Nova senha',
    confirmNewPassword: 'Confirmar nova senha',
    search: 'Buscar',
    notifications: 'Notifica\u00e7\u00f5es Push',
    enableNotifications: 'Ativar notifica\u00e7\u00f5es',
    disableNotifications: 'Desativar notifica\u00e7\u00f5es',
    notificationsEnabled: 'Notifica\u00e7\u00f5es ativadas \u2705',
    notificationsDisabled: 'Notifica\u00e7\u00f5es desativadas',
    sendComprobante: 'Enviar comprovante de pagamento',
    searchByUrl: 'Importar por URL',
    searchByKeyword: 'Buscar por Palavra',
    searchByCategories: 'Categorias',
    keywordPlaceholder: 'Buscar produtos (ex: relógio, bolsa...)',
    searching: 'Buscando...',
    back: 'Voltar',
    productDetail: 'Detalhes do Produto',
    description: 'Descrição',
    loadingDetail: 'Carregando detalhes...',
    previous: 'Anterior',
    next: 'Próximo',
  }
};

const CATEGORIES = [
  {
    id: 'jdm',
    es: 'Carros JDM',
    pt: 'Carros JDM',
    sub: [
      { id: 'supra', es: 'TOYOTA SUPRA', pt: 'TOYOTA SUPRA', url: 'https://auctions.yahoo.co.jp/category/list/26360/?auccat=26360&brand_id=40726&o1=d&s1=new' },
      { id: 'skyline', es: 'NISSAN SKYLINE GT-R', pt: 'NISSAN SKYLINE GT-R', url: 'https://auctions.yahoo.co.jp/category/list/26360/?auccat=26360&brand_id=24846&o1=d&s1=new' },
      { id: 'lancer', es: 'MITSUBISHI LANCER EVO', pt: 'MITSUBISHI LANCER EVO', url: 'https://auctions.yahoo.co.jp/category/list/26360/?auccat=26360&brand_id=18389&o1=a&s1=car_model_year' },
      { id: 'rx7', es: 'MAZDA RX-7', pt: 'MAZDA RX-7', url: 'https://auctions.yahoo.co.jp/category/list/26360/?auccat=26360&brand_id=14657&o1=d&s1=new' },
      { id: 'silvia', es: 'NISSAN SILVIA', pt: 'NISSAN SILVIA', url: 'https://auctions.yahoo.co.jp/category/list/26360/?auccat=26360&brand_id=24557&carshift1=91%2C917%2C5379&o1=d&s1=new' },
      { id: 'impreza', es: 'SUBARU IMPREZA', pt: 'SUBARU IMPREZA', url: 'https://auctions.yahoo.co.jp/category/list/26360/?auccat=26360&brand_id=28231&o1=a&s1=car_model_year' },
      { id: 'desarme', es: 'Vehículo para desarme', pt: 'Veículo para desmanche', url: 'https://auctions.yahoo.co.jp/category/list/2084061280/?auccat=2084061280&o1=d&s1=new' },
    ]
  },
  { id: 'moto', es: 'Moto', pt: 'Moto', url: 'https://auctions.yahoo.co.jp/category/list/26316/?s1=new&o1=d' },
  {
    id: 'llantas',
    es: 'Llantas',
    pt: 'Rodas',
    sub: [
      { id: 'll16', es: '16 pulgadas', pt: '16 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084200188/?p=16%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084200188&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d' },
      { id: 'll17', es: '17 pulgadas', pt: '17 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084200189/?p=17%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084200189&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d' },
      { id: 'll18', es: '18 pulgadas', pt: '18 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084200190/?p=18%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084200190&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d' },
    ]
  },
  {
    id: 'aros',
    es: 'Aros',
    pt: 'Aros',
    sub: [
      { id: 'ar16', es: '16 pulgadas', pt: '16 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084008474/?p=16%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084008474&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d&brand_id=118472,118483,118474,119521,118478,118481,115842,102328,120288,119007' },
      { id: 'ar17', es: '17 pulgadas', pt: '17 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084040548/?p=17%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084040548&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d&brand_id=118472%2C118478%2C118474%2C119007%2C119521%2C118481%2C115842%2C159741%2C118483%2C102328' },
      { id: 'ar18', es: '18 pulgadas', pt: '18 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084040547/?p=18%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084040547&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d&brand_id=115842,119007,118474,102328,118472,118483,119521,118478,118481,128485' },
    ]
  },
  { id: 'suspension', es: 'Suspensión', pt: 'Suspensão', url: 'https://auctions.yahoo.co.jp/category/list/2084005257/?p=%E3%82%B5%E3%82%B9%E3%83%9A%E3%83%B3%E3%82%B7%E3%83%A7%E3%83%B3&auccat=2084005257&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d&brand_id=128485,103816,105215,103820,119942,119941,119938' },
  { id: 'asiento', es: 'Asiento', pt: 'Assento', url: 'https://auctions.yahoo.co.jp/category/list/2084005258/?p=%E3%82%B7%E3%83%BC%E3%83%88&auccat=2084005258&istatus=2&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d&brand_id=102214,103815,115842,128485,159741,103823' },
  { id: 'repuesto', es: 'Repuesto', pt: 'Autopeça', url: 'https://auctions.yahoo.co.jp/category/list/26322/?s1=new&o1=d' },
  { id: 'allcats', es: 'Lista de categorías de subasta', pt: 'Lista de categorias de leilão', url: 'https://auctions.yahoo.co.jp/category/list/2084005139/?s1=new&o1=d' },
];

export default function Home() {
  const [lang, setLang] = useState<'es' | 'pt'>('es');
  const [searchUrl, setSearchUrl] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [bidForm, setBidForm] = useState({ name: '', maxBid: '' });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    fullName: '',
    whatsapp: ''
  });
  const [activeTab, setActiveTab] = useState<'search' | 'requests' | 'purchased' | 'mypage'>('search');
  const [searchType, setSearchType] = useState<'url' | 'keyword' | 'categories'>('categories');
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<any | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [nextPageExists, setNextPageExists] = useState(false);
  const [activeCategoryUrl, setActiveCategoryUrl] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  // マイページ用state
  const [profileForm, setProfileForm] = useState({ fullName: '', whatsapp: '' });
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'loading' | 'enabled' | 'disabled' | 'unsupported'>('loading');
  const [purchasedTotal, setPurchasedTotal] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [purchasedPeriod, setPurchasedPeriod] = useState<'all' | '7days' | '30days' | '90days'>('all');
  const [exchangeRate, setExchangeRate] = useState(150);
  const [showCounterModal, setShowCounterModal] = useState(false);  // ← 追加
  const [selectedRequestForCounter, setSelectedRequestForCounter] = useState<any>(null);  // ← 追加
  const [customerCounterAmount, setCustomerCounterAmount] = useState('');  // ← 追加
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  const t = translations[lang];

  useEffect(() => {
    fetchExchangeRate();
  }, []);

  useEffect(() => {
    // 初回セッション復元
    getCurrentUser().then(user => {
      if (user?.role === 'customer') {
        setCurrentUser(user);
        // 通知状態を初期化
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            fetch(`/api/push-subscribe?userId=${user.id}`)
              .then(r => r.ok ? setNotificationStatus('enabled') : setNotificationStatus('disabled'))
              .catch(() => setNotificationStatus('disabled'));
          } else {
            setNotificationStatus('disabled');
          }
        } else {
          setNotificationStatus('unsupported');
        }
      }
    });

    // セッション変更を監視（トークンリフレッシュ時の自動復元のみ）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // トークンリフレッシュ時のみセッション復元（ログイン処理との競合を防止）
        const user = await getCurrentUser();
        if (user?.role === 'customer') {
          setCurrentUser(user);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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

  const sendWhatsAppNotification = async () => {
    setIsSendingNotification(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/notify-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          userType: 'customer',
          email: currentUser?.email
        })
      });

      const data = await res.json();

      if (data.outsideWindow) {
        // 24時間ウィンドウ外エラー
        alert(lang === 'es'
          ? '⚠️ No se pudo enviar la notificación.\n\nEl administrador necesita reactivar WhatsApp Sandbox.\n\nPasos:\n1. Enviar un mensaje a +1 415 523 8886 en WhatsApp\n2. Escribir "join" seguido del código del Sandbox\n3. Intentar de nuevo'
          : '⚠️ Não foi possível enviar a notificação.\n\nO administrador precisa reativar o WhatsApp Sandbox.\n\nPassos:\n1. Enviar uma mensagem para +1 415 523 8886 no WhatsApp\n2. Escrever "join" seguido do código do Sandbox\n3. Tentar novamente');
      } else if (data.success && data.notificationsSent > 0) {
        alert(lang === 'es'
          ? '✅ Notificación enviada al administrador'
          : '✅ Notificação enviada ao administrador');
      } else if (data.success && data.notificationsSent === 0) {
        alert(lang === 'es'
          ? '⚠️ No se pudo enviar. El administrador puede necesitar reactivar el Sandbox de WhatsApp.'
          : '⚠️ Não foi possível enviar. O administrador pode precisar reativar o Sandbox do WhatsApp.');
      } else {
        alert(data.message || (lang === 'es' ? 'Error al enviar' : 'Erro ao enviar'));
      }
    } catch (error) {
      console.error('Notification error:', error);
      alert(lang === 'es' ? 'Error al enviar notificación' : 'Erro ao enviar notificação');
    } finally {
      setIsSendingNotification(false);
    }
  };

  const fetchPurchasedItems = async () => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?email=${currentUser?.email}&purchased=true`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
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
        customerFullName: item.customer_full_name,
        customerWhatsapp: item.customer_whatsapp,
        language: item.language,
        confirmedAt: item.created_at,  // confirmed_at の代わりに created_at を使用
        customerCounterOffer: item.customer_counter_offer,
        customerCounterOfferUsed: item.customer_counter_offer_used,
        paid: item.paid || false
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



  const getCustomerTotal = (customerName: string) => {
    return purchasedItems
      .filter(item => item.customerName === customerName)
      .reduce((sum, item) => sum + (item.finalPrice || 0), 0);
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';

    // タイムゾーン情報がない場合、UTC として扱う
    let date: Date;
    if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
      date = new Date(dateString + 'Z');
    } else {
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) return dateString;

    // ローカルタイムゾーンの取得
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // 略称の取得
    let localLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: localTimeZone,
      timeZoneName: 'short'
    }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';

    // GMT-3 などのオフセット表示を BRT 等の略称にマッピング
    if (localTimeZone === 'America/Sao_Paulo' || localLabel.includes('GMT-3')) {
      localLabel = 'BRT';
    } else if (localTimeZone === 'Asia/Tokyo' || localLabel.includes('GMT+9')) {
      localLabel = 'JST';
    }

    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: localTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return `${formatter.format(date)} ${localLabel}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(loginForm.email, loginForm.password);
      const user = await getCurrentUser();
      setCurrentUser(user);
      setLoginForm({ email: '', password: '', fullName: '', whatsapp: '' });
    } catch (error) {
      console.error('Login error:', error);
      alert(lang === 'es'
        ? 'Error al iniciar sesión. Verifica tu email y contraseña.'
        : 'Erro ao fazer login. Verifique seu email e senha.');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signUp(
        loginForm.email,
        loginForm.password,
        'customer',
        loginForm.fullName,
        loginForm.whatsapp
      );

      // メール確認が必要な場合は成功メッセージを表示
      alert(lang === 'es'
        ? '¡Cuenta creada! Por favor, revisa tu correo electrónico para confirmar tu cuenta.'
        : 'Conta criada! Por favor, verifique seu e-mail para confirmar sua conta.');

      setLoginForm({ email: '', password: '', fullName: '', whatsapp: '' });
      setShowSignUp(false);
    } catch (error) {
      console.error('Sign up error:', error);
      alert(lang === 'es'
        ? 'Error al crear cuenta. El email puede estar en uso.'
        : 'Erro ao criar conta. O email pode já estar em uso.');
    }
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);

    // ログアウト時にデータをクリア
    setSearchUrl('');
    setProducts([]);
    setSelectedProduct(null);
    setBidForm({ name: '', maxBid: '' });
    setMyRequests([]);
    setPurchasedItems([]);
    setPurchasedTotal(0);
    setActiveTab('search');
    setLoginForm({ email: '', password: '', fullName: '', whatsapp: '' });
  };

  // ← ここに追加！
  const getFilteredPurchasedItems = () => {
    let filtered = purchasedItems;

    // 顧客名でフィルタリング
    if (selectedCustomer && selectedCustomer !== 'all') {
      filtered = filtered.filter(item => item.customerName === selectedCustomer);
    }

    // 期間でフィルタリング
    if (purchasedPeriod !== 'all') {
      const now = new Date();
      const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
      const days = (daysMap as any)[purchasedPeriod];
      const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(item =>
        new Date(item.confirmedAt).getTime() >= cutoffDate.getTime()
      );
    }

    return filtered;
  };

  const handleBidRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct || !bidForm.name || !bidForm.maxBid) return;

    // 10件制限チェック
    if (myRequests.length >= 10) {
      alert(lang === 'es'
        ? 'Has alcanzado el límite máximo de 10 solicitudes. Por favor, espera a que se procesen las actuales.'
        : 'Você atingiu o limite máximo de 10 solicitações. Aguarde o processamento das atuais.');
      return;
    }

    try {
      // 念のためセッションから最新のトークンを取得
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      console.log('=== API Fetch Debug ===');
      console.log('Token exists:', !!accessToken);
      console.log('Session user:', clientSession?.user?.email);

      const res = await fetch('/api/bid-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          productTitle: selectedProduct.title,
          productUrl: selectedProduct.url,
          productImage: selectedProduct.imageUrl,
          productPrice: selectedProduct.currentPrice,
          productEndTime: selectedProduct.endTime,
          maxBid: parseFloat(bidForm.maxBid),
          customerName: bidForm.name,
          customerEmail: currentUser?.email,
          language: lang
        })
      });

      if (res.ok) {
        // 管理者へ通知
        if (currentUser) {
          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sendToAdmins: true,
              title: 'JOGALIBRE',
              body: `更新通知： ${currentUser.fullName || bidForm.name}`,
              url: '/admin'
            })
          }).catch(e => console.error('Admin push error', e));
        }

        alert(t.offerSuccess);
        setSelectedProduct(null);
        setBidForm({ name: '', maxBid: '' });
        setSearchUrl('');  // URLをクリア
        setProducts([]);   // 商品リストをクリア
        fetchMyRequests();
      } else {
        alert(t.offerError);
      }
    } catch (error) {
      console.error('Error submitting bid request:', error);
      alert(t.offerError);
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
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?email=${currentUser?.email}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
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

  const fetchProductDetailForOffer = async (url: string) => {
    setLoading(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/yahoo-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ url, lang })
      });
      const data = await res.json();
      if (data.product) {
        setSelectedProduct(data.product);
      }
    } catch (error) {
      console.error('Error fetching product for offer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!searchUrl.trim()) return;

    setLoading(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/yahoo-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
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

  const handleKeywordSearch = async (e?: React.FormEvent, page: number = 1) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) return;

    setIsSearching(true);
    setLoading(true);
    setSearchPage(page);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(keyword)}&lang=${lang}&page=${page}`);
      const data = await res.json();
      if (data.items) {
        setProducts(data.items);
        setNextPageExists(data.nextPage || false);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
      setLoading(false);
    }
  };

  const fetchCategoryItems = async (url: string, page: number = 1) => {
    setIsSearching(true);
    setLoading(true);
    setSearchPage(page);
    setActiveCategoryUrl(url);
    try {
      const res = await fetch(`/api/search?url=${encodeURIComponent(url)}&page=${page}`);
      const data = await res.json();
      if (data.items) {
        setProducts(data.items);
        setNextPageExists(data.nextPage || false);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
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
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      if (action === 'accept') {
        await fetch('/api/bid-request', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': accessToken ? `Bearer ${accessToken}` : ''
          },
          body: JSON.stringify({
            id: requestId,
            customerAction: 'accept_counter'
          })
        });
      } else if (action === 'reject') {
        await fetch('/api/bid-request', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': accessToken ? `Bearer ${accessToken}` : ''
          },
          body: JSON.stringify({
            id: requestId,
            customerAction: 'reject_counter'
          })
        });
      } else if (action === 'counter' && counterAmount) {
        await fetch('/api/bid-request', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': accessToken ? `Bearer ${accessToken}` : ''
          },
          body: JSON.stringify({
            id: requestId,
            customerCounterOffer: counterAmount
          })
        });
      }

      // 管理者へ通知
      if (currentUser) {
        fetch('/api/push-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sendToAdmins: true,
            title: 'JOGALIBRE',
            body: `更新通知： ${currentUser.fullName || currentUser.email}`,
            url: '/admin'
          })
        }).catch(e => console.error('Admin push error', e));
      }

      fetchMyRequests();
    } catch (error) {
      console.error('Error responding to counter offer:', error);
    }
  };

  const handleFinalStatusConfirm = async (requestId: string, message?: string) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
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

  // ← ここに追加！
  const confirmRejection = async (requestId: string) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?id=${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });

      if (res.ok) {
        fetchMyRequests();
      }
    } catch (error) {
      console.error('Error confirming rejection:', error);
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
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-black">{t.title}</h1>
            <img src="/icons/customer-icon.png" alt="JOGALIBRE" className="w-10 h-10 rounded" />
          </div>
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

          <form onSubmit={showSignUp ? handleSignUp : handleLogin} className="space-y-4">
            {showSignUp && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {lang === 'es' ? 'Nombre completo' : 'Nome completo'}
                  </label>
                  <input
                    type="text"
                    value={loginForm.fullName}
                    onChange={(e) => setLoginForm({ ...loginForm, fullName: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">WhatsApp</label>
                  <input
                    type="tel"
                    value={loginForm.whatsapp}
                    onChange={(e) => setLoginForm({ ...loginForm, whatsapp: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="+55 11 98765-4321"
                    required
                  />
                </div>
              </>
            )}
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
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              {showSignUp ? (lang === 'es' ? 'Crear Cuenta' : 'Criar Conta') : t.loginButton}
            </button>
          </form>

          {!showSignUp && !showResetPassword && (
            <div className="mt-3 text-center">
              <button
                onClick={() => setShowResetPassword(true)}
                className="text-sm text-gray-500 hover:underline"
              >
                {lang === 'es' ? '¿Olvidaste tu contraseña?' : 'Esqueceu sua senha?'}
              </button>
            </div>
          )}

          {showResetPassword && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-gray-700 mb-3">
                {lang === 'es'
                  ? 'Ingresa tu email para recibir un enlace de recuperación:'
                  : 'Digite seu e-mail para receber um link de recuperação:'}
              </p>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={lang === 'es' ? 'tu@email.com' : 'seu@email.com'}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!resetEmail.trim()) return;
                    try {
                      await resetPassword(resetEmail);
                      alert(lang === 'es'
                        ? 'Se envió un enlace de recuperación a tu email.'
                        : 'Um link de recuperação foi enviado para seu e-mail.');
                      setShowResetPassword(false);
                      setResetEmail('');
                    } catch (error) {
                      console.error('Reset password error:', error);
                      alert(lang === 'es'
                        ? 'Error al enviar el enlace. Verifica tu email.'
                        : 'Erro ao enviar o link. Verifique seu e-mail.');
                    }
                  }}
                  className="flex-1 bg-yellow-500 text-white py-2 rounded-lg font-semibold hover:bg-yellow-600 transition text-sm"
                >
                  {lang === 'es' ? 'Enviar enlace' : 'Enviar link'}
                </button>
                <button
                  onClick={() => { setShowResetPassword(false); setResetEmail(''); }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400 transition text-sm"
                >
                  {lang === 'es' ? 'Cancelar' : 'Cancelar'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => { setShowSignUp(!showSignUp); setShowResetPassword(false); }}
              className="text-sm text-indigo-600 hover:underline"
            >
              {showSignUp
                ? (lang === 'es' ? '¿Ya tienes cuenta? Inicia sesión' : 'Já tem conta? Faça login')
                : (lang === 'es' ? '¿No tienes cuenta? Regístrate' : 'Não tem conta? Cadastre-se')
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 sm:px-6 lg:px-8">
          {/* 1行目: ロゴ + ログアウト/言語切り替え */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-black">{t.title}</h1>
              <img src="/icons/customer-icon.png" alt="JOGALIBRE" className="w-8 h-8 sm:w-10 sm:h-10 rounded" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-800 whitespace-nowrap"
              >
                {t.logout}
              </button>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-40"
              >
                <option value="es">Español</option>
                <option value="pt">Português</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* WhatsApp + プッシュ通知ボタン（半幅ずつ） */}
            <div className="flex gap-2">
              <button
                onClick={sendWhatsAppNotification}
                disabled={isSendingNotification}
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition text-sm sm:text-base disabled:bg-gray-400"
              >
                {isSendingNotification ? '...' : '📱 WhatsApp'}
              </button>
              <button
                onClick={async () => {
                  if (!currentUser) return;
                  const permission = getNotificationPermission();
                  if (permission === 'unsupported') {
                    alert(lang === 'es' ? 'Tu navegador no soporta notificaciones push.' : 'Seu navegador não suporta notificações push.');
                    return;
                  }
                  if (permission === 'granted') {
                    try {
                      const res = await fetch(`/api/push-subscribe?userId=${currentUser.id}`);
                      if (res.ok) {
                        await fetch('/api/push-subscribe', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: currentUser.id }),
                        });
                        setNotificationStatus('disabled');
                        alert(lang === 'es' ? 'Notificaciones desactivadas' : 'Notificações desativadas');
                        return;
                      }
                    } catch { }
                  }
                  try {
                    const subscription = await requestNotificationPermission();
                    if (subscription) {
                      await fetch('/api/push-subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser.id, subscription }),
                      });
                      setNotificationStatus('enabled');
                      alert(lang === 'es' ? '¡Notificaciones activadas!' : 'Notificações ativadas!');
                    }
                  } catch (err) {
                    console.error('Push error:', err);
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg transition text-sm sm:text-base ${notificationStatus === 'enabled'
                  ? 'bg-gray-500 text-white hover:bg-gray-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
              >
                {notificationStatus === 'enabled' ? '🔔 Push ✅' : '🔔 Push'}
              </button>
            </div>

            {/* 更新ボタン（全幅） */}
            <button
              onClick={() => {
                if (activeTab === 'requests') fetchMyRequests();
                else if (activeTab === 'purchased') fetchPurchasedItems();
                else { fetchExchangeRate(); }
              }}
              className="bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base w-full"
            >
              🔁 {t.refresh}
            </button>

            <div className="text-xs sm:text-sm text-gray-600">
              {t.exchangeRate}: <span className="font-semibold">USD 1 = JPY {exchangeRate.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* タブナビゲーション */}
      <nav className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex">
            {[
              { key: 'search' as const, label: t.search, icon: '🔍' },
              { key: 'requests' as const, label: t.myRequests, icon: '📋' },
              { key: 'purchased' as const, label: t.purchasedItems, icon: '🛒' },
              { key: 'mypage' as const, label: t.myPage, icon: '👤' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key === 'requests') fetchMyRequests();
                  if (tab.key === 'purchased') fetchPurchasedItems();
                  if (tab.key === 'mypage' && currentUser) {
                    setProfileForm({ fullName: currentUser.fullName || '', whatsapp: currentUser.whatsapp || '' });
                    // 通知状態をチェック
                    const permission = getNotificationPermission();
                    if (permission === 'unsupported') {
                      setNotificationStatus('unsupported');
                    } else if (permission === 'granted') {
                      // サブスクリプションがDBにあるか確認
                      fetch(`/api/push-subscribe?userId=${currentUser.id}`)
                        .then(r => r.ok ? setNotificationStatus('enabled') : setNotificationStatus('disabled'))
                        .catch(() => setNotificationStatus('disabled'));
                    } else {
                      setNotificationStatus('disabled');
                    }
                  }
                }}
                className={`flex-1 py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition ${activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <span className="block text-lg">{tab.icon}</span>
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === 'requests' ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-6">{t.myRequests}</h2>

            {myRequests.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>No hay solicitudes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myRequests
                  .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                  .map((request) => (
                    <div key={request.id} className="border rounded-lg p-4">
                      <div className="flex gap-4 mb-3">
                        {request.productImage && (
                          <img
                            src={request.productImage}
                            alt={request.productTitle}
                            className="w-32 h-32 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-h-[128px] flex flex-col py-0.5 min-w-0">
                          <h3 className="text-sm font-semibold mb-1 line-clamp-2 overflow-hidden text-ellipsis leading-tight">{request.productTitle}</h3>
                          <div className="flex flex-col gap-0.5">
                            <div className="text-xs">
                              <span className="text-gray-600">{lang === 'es' ? 'Cliente: ' : 'Cliente: '}</span>
                              <span className="font-semibold">{request.customerName}</span>
                            </div>
                            <p className="text-xs text-gray-600">
                              {t.maxBid}: <span className="font-bold text-blue-600">${Math.round(request.maxBid).toLocaleString('en-US')}</span>
                            </p>
                            {request.productEndTime && (
                              <p className="text-[10px] text-gray-500">
                                {t.endsIn}: <span className="font-semibold text-red-600">{getTimeRemaining(request.productEndTime)}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex flex-row flex-wrap gap-1 mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold flex items-center justify-center ${getStatusColor(request.status)}`}>
                              {t[request.status as keyof typeof t] || request.status}
                            </span>
                            {request.finalStatus && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold flex items-center justify-center ${getFinalStatusColor(request.finalStatus)}`}>
                                {t[request.finalStatus as keyof typeof t]}
                              </span>
                            )}
                            {request.adminNeedsConfirm && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold flex items-center justify-center bg-red-100 text-red-800`}>
                                {lang === 'es' ? 'Rechazado' : 'Rejeitado'}
                              </span>
                            )}
                          </div>
                          <a
                            href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(request.productUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline text-xs inline-block mt-auto"
                          >
                            {t.viewOnYahoo}
                          </a>
                        </div>
                      </div>

                      {request.status === 'rejected' && !request.customerCounterOffer && (
                        <div className="mb-2 p-3 bg-red-50 rounded">
                          {request.rejectReason && (
                            <>
                              <p className="text-sm text-gray-600">{t.rejectReason}:</p>
                              <p className="text-red-700 mb-2">{request.rejectReason}</p>
                            </>
                          )}
                          <button
                            onClick={() => confirmRejection(request.id)}
                            className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
                          >
                            {t.confirm}
                          </button>
                        </div>
                      )}

                      {/* ケース1: 最初の管理者カウンターオファー（顧客未返答） */}
                      {request.counterOffer && request.status === 'counter_offer' && !request.customerCounterOffer && !request.adminNeedsConfirm && (
                        <div className="mb-2 p-3 bg-blue-50 rounded">
                          <p className="text-sm text-gray-600">Contraoferta:</p>
                          <p className="font-semibold text-blue-700 text-base mb-2">
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
                                setSelectedRequestForCounter(request);
                                setShowCounterModal(true);
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

                      {/* ケース2: 顧客がカウンターオファー送信済み（管理者返答待ち） */}
                      {request.customerCounterOffer && !request.adminNeedsConfirm && !request.customerCounterOfferUsed && request.status === 'counter_offer' && (
                        <div className="mb-2 p-3 bg-blue-50 rounded">
                          <p className="text-sm text-gray-600">Contraoferta:</p>
                          <p className="font-semibold text-blue-700 text-base">
                            ${Math.round(request.counterOffer).toLocaleString('en-US')}
                          </p>
                        </div>
                      )}

                      {/* ケース3A: 管理者が顧客のカウンターオファーを承認 (Fabio) */}
                      {request.customerCounterOffer && !request.customerCounterOfferUsed && request.status === 'approved' && !request.finalStatus && (
                        <>
                          <div className="mb-2 p-3 bg-blue-50 rounded">
                            <p className="text-sm text-gray-600">Contraoferta:</p>
                            <p className="font-semibold text-blue-700 text-base">
                              ${Math.round(request.counterOffer).toLocaleString('en-US')}
                            </p>
                          </div>
                          <div className="mb-2 p-3 bg-purple-50 rounded">
                            <p className="text-sm text-gray-600">{t.yourCounterOffer}:</p>
                            <p className="font-semibold text-purple-700 text-base mb-1">${Math.round(request.customerCounterOffer).toLocaleString('en-US')}</p>
                            <p className="text-xs text-red-600 mb-1">
                              {lang === 'es' ? 'Tu contraoferta fue aceptada.' : 'Sua contraoferta foi aceita.'}
                            </p>
                            <p className="text-xs text-gray-600">
                              {lang === 'es' ? 'Esperando resultado de la subasta.' : 'Aguardando resultado do leilão.'}
                            </p>
                          </div>
                        </>
                      )}

                      {/* ケース3B: 顧客が管理者のカウンターオファーを承認 (Carlos系: 顧客カウンターあり) */}
                      {request.customerCounterOffer && request.customerCounterOfferUsed && request.status === 'approved' && !request.finalStatus && (
                        <>
                          <div className="mb-2 p-3 bg-blue-50 rounded">
                            <p className="text-sm text-gray-600">Contraoferta:</p>
                            <p className="font-semibold text-blue-700 text-base mb-1">${Math.round(request.counterOffer).toLocaleString('en-US')}</p>
                            <p className="text-xs text-red-600 mb-1">
                              {lang === 'es' ? 'Tú aceptaste la contraoferta del administrador.' : 'Você aceitou a contraoferta do administrador.'}
                            </p>
                            <p className="text-xs text-gray-600">
                              {lang === 'es' ? 'Esperando resultado de la subasta.' : 'Aguardando resultado do leilão.'}
                            </p>
                          </div>
                          <div className="mb-2 p-3 bg-purple-50 rounded">
                            <p className="text-sm text-gray-600">{t.yourCounterOffer}:</p>
                            <p className="font-semibold text-purple-700 text-base mb-1">${Math.round(request.customerCounterOffer).toLocaleString('en-US')}</p>
                            <p className="text-xs text-red-600">
                              {lang === 'es' ? 'Rechazado por el administrador.' : 'Rejeitado pelo administrador.'}
                            </p>
                          </div>
                        </>
                      )}

                      {/* ケース3C: 顧客が管理者のカウンターオファーを直接承認 (顧客カウンターなし) */}
                      {!request.customerCounterOffer && request.counterOffer && request.status === 'approved' && !request.finalStatus && (
                        <div className="mb-2 p-3 bg-blue-50 rounded">
                          <p className="text-sm text-gray-600">Contraoferta:</p>
                          <p className="font-semibold text-blue-700 text-base mb-1">${Math.round(request.counterOffer).toLocaleString('en-US')}</p>
                          <p className="text-xs text-red-600 mb-1">
                            {lang === 'es' ? 'Tú aceptaste la contraoferta del administrador.' : 'Você aceitou a contraoferta do administrador.'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {lang === 'es' ? 'Esperando resultado de la subasta.' : 'Aguardando resultado do leilão.'}
                          </p>
                        </div>
                      )}

                      {/* ケース4A: 顧客が最初のカウンターオファーを却下 → 削除確認待ち */}
                      {request.adminNeedsConfirm && !request.customerCounterOffer && (
                        <div className="mb-2">
                          <div className="p-3 bg-blue-50 rounded mb-3">
                            <p className="text-sm text-gray-600">Contraoferta:</p>
                            <p className="font-semibold text-blue-700 text-base">
                              ${Math.round(request.counterOffer).toLocaleString('en-US')}
                            </p>
                          </div>
                          <button
                            onClick={() => confirmRejection(request.id)}
                            className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
                          >
                            {t.confirm}
                          </button>
                        </div>
                      )}

                      {/* ケース4B: 管理者が顧客カウンターオファーを却下 → 最初のオファー承諾可能 */}
                      {request.status === 'rejected' && request.customerCounterOffer && (
                        <div className="mb-2">
                          <button
                            onClick={() => confirmRejection(request.id)}
                            className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 mb-3"
                          >
                            {t.confirm}
                          </button>

                          <div className="p-3 bg-blue-50 rounded mb-2">
                            <p className="text-sm text-gray-600">Contraoferta:</p>
                            <p className="font-semibold text-blue-700 text-base mb-2">
                              ${Math.round(request.counterOffer).toLocaleString('en-US')}
                            </p>
                            <button
                              onClick={() => handleCounterOfferResponse(request.id, 'accept')}
                              className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                            >
                              {t.accept}
                            </button>
                          </div>

                          <div className="p-3 bg-purple-50 rounded">
                            <p className="text-sm text-gray-600">{t.yourCounterOffer}:</p>
                            <p className="font-semibold text-purple-700 text-base">
                              ${Math.round(request.customerCounterOffer).toLocaleString('en-US')}
                            </p>
                            <p className="text-xs text-red-600">
                              {lang === 'es' ? 'Rechazado por el administrador.' : 'Rejeitado pelo administrador.'}
                            </p>
                          </div>
                        </div>
                      )}

                      {request.customerCounterOffer && !request.adminNeedsConfirm && !request.customerCounterOfferUsed && request.status === 'counter_offer' && (
                        <div className="mb-2 p-3 bg-purple-50 rounded">
                          <p className="text-sm text-gray-600">{t.yourCounterOffer}:</p>
                          <p className="font-semibold text-purple-700 text-base">${Math.round(request.customerCounterOffer).toLocaleString('en-US')}</p>
                        </div>
                      )}
                      {/* (以前重複していたブロックを削除しました) */}

                      {request.finalStatus === 'won' && !request.customerConfirmed && (
                        <div className="mb-2 p-3 bg-green-50 rounded">
                          <p className="text-sm text-gray-600">{t.finalPrice}:</p>
                          <p className="text-base font-semibold text-green-600">
                            ${Math.round(
                              request.finalPrice ||
                              (request.customerCounterOffer && !request.customerCounterOfferUsed ? request.customerCounterOffer : (request.counterOffer || request.maxBid))
                            ).toLocaleString('en-US')}
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
                        <div className="mb-2 p-3 bg-red-50 rounded">
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
        ) : activeTab === 'purchased' ? (
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
                <span className="text-sm text-gray-600 whitespace-nowrap w-28">{lang === 'es' ? 'Período:' : 'Período:'}</span>
                <select
                  value={purchasedPeriod}
                  onChange={(e) => setPurchasedPeriod(e.target.value as 'all' | '7days' | '30days' | '90days')}
                  className="border border-gray-300 rounded px-3 py-3 text-base flex-1"
                >
                  <option value="all">{lang === 'es' ? 'Todos' : 'Todos'}</option>
                  <option value="7days">{lang === 'es' ? 'Últimos 7 días' : 'Últimos 7 dias'}</option>
                  <option value="30days">{lang === 'es' ? 'Últimos 30 días' : 'Últimos 30 dias'}</option>
                  <option value="90days">{lang === 'es' ? 'Últimos 90 días' : 'Últimos 90 dias'}</option>
                </select>
              </div>
            </div>

            {/* WhatsApp 支払い証明書送信ボタン */}
            <div className="mb-6">
              <a
                href="https://wa.me/817013476721"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                <span>{lang === 'es' ? 'Enviar comprobante de pago' : 'Enviar comprovante de pagamento'}</span>
              </a>
            </div>

            {purchasedItems.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>No hay productos comprados</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {getFilteredPurchasedItems()
                    .sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime())
                    .map((item, index) => (
                      <div key={`purchased-${index}-${item.id}`} className="border rounded-lg p-4">
                        <div className="flex gap-4 mb-3">
                          {item.productImage && (
                            <img
                              src={item.productImage}
                              alt={item.productTitle}
                              className="w-32 h-32 object-cover rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold mb-2 line-clamp-2 overflow-hidden text-ellipsis leading-tight">{item.productTitle}</h3>
                            <a
                              href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(item.productUrl)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:underline text-xs inline-block"
                            >
                              {t.viewOnYahoo}
                            </a>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3 p-3 bg-gray-50 rounded text-xs">
                          <div>
                            <p className="text-gray-600">{lang === 'es' ? 'Nombre' : 'Nome'}</p>
                            <p className="font-semibold">{item.customerFullName || item.customerName}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">WhatsApp</p>
                            <p className="font-semibold">{item.customerWhatsapp || '-'}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{lang === 'es' ? 'Correo' : 'E-mail'}</p>
                            <p className="font-semibold break-all">{item.customerEmail}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{lang === 'es' ? 'Idioma' : 'Idioma'}</p>
                            <p className="font-semibold">{item.language === 'es' ? 'Español' : 'Português'}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{lang === 'es' ? 'Cliente' : 'Cliente'}</p>
                            <p className="font-semibold">{item.customerName}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{t.confirmedDate}</p>
                            <p className="font-semibold">{formatDateTime(item.confirmedAt)}</p>
                          </div>
                        </div>

                        <div className="text-right pt-3 border-t">
                          <div className="flex items-center justify-end gap-3">
                            {item.paid && (
                              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                                ✓ {lang === 'es' ? 'Pagado' : 'Pago'}
                              </span>
                            )}
                            <p className={`text-xl font-bold ${item.paid ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                              ${Math.round(
                                item.finalPrice ||
                                (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0))
                              ).toLocaleString('en-US')}
                            </p>
                          </div>
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
                        getFilteredPurchasedItems()
                          .filter(item => !item.paid)  // ← 支払済を除外
                          .reduce((sum, item) => sum + (item.finalPrice || 0), 0)
                      ).toLocaleString('en-US')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 text-right mt-1">
                    {lang === 'es' ? 'Solo productos sin pagar' : 'Apenas produtos não pagos'} /
                    {lang === 'es' ? ' Pagados: ' : ' Pagos: '}{getFilteredPurchasedItems().filter(item => item.paid).length}
                  </p>
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'mypage' ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-6">{t.myPage}</h2>

            {/* プロフィール編集 */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">{t.profile}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t.email}</label>
                  <input
                    type="email"
                    value={currentUser?.email || ''}
                    disabled
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.fullName}</label>
                  <input
                    type="text"
                    value={profileForm.fullName}
                    onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.whatsapp}</label>
                  <input
                    type="tel"
                    value={profileForm.whatsapp}
                    onChange={(e) => setProfileForm({ ...profileForm, whatsapp: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                    placeholder="+55 11 98765-4321"
                  />
                </div>
                <button
                  onClick={async () => {
                    setProfileSaving(true);
                    try {
                      await updateProfile(profileForm.fullName, profileForm.whatsapp);
                      const user = await getCurrentUser();
                      setCurrentUser(user);
                      alert(lang === 'es' ? '¡Perfil actualizado!' : 'Perfil atualizado!');
                    } catch (error) {
                      console.error('Profile update error:', error);
                      alert(lang === 'es' ? 'Error al actualizar perfil.' : 'Erro ao atualizar perfil.');
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                  disabled={profileSaving}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
                >
                  {profileSaving ? '...' : t.saveProfile}
                </button>
              </div>
            </div>

            {/* パスワード変更 */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">{t.changePassword}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t.newPassword}</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                    minLength={6}
                    placeholder={lang === 'es' ? 'Mínimo 6 caracteres' : 'Mínimo 6 caracteres'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.confirmNewPassword}</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3"
                    minLength={6}
                  />
                </div>
                <button
                  onClick={async () => {
                    if (passwordForm.newPassword.length < 6) {
                      alert(lang === 'es' ? 'La contraseña debe tener al menos 6 caracteres.' : 'A senha deve ter pelo menos 6 caracteres.');
                      return;
                    }
                    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                      alert(lang === 'es' ? 'Las contraseñas no coinciden.' : 'As senhas não coincidem.');
                      return;
                    }
                    setPasswordSaving(true);
                    try {
                      await updatePassword(passwordForm.newPassword);
                      setPasswordForm({ newPassword: '', confirmPassword: '' });
                      alert(lang === 'es' ? '¡Contraseña actualizada!' : 'Senha atualizada!');
                    } catch (error) {
                      console.error('Password update error:', error);
                      alert(lang === 'es' ? 'Error al cambiar contraseña.' : 'Erro ao alterar senha.');
                    } finally {
                      setPasswordSaving(false);
                    }
                  }}
                  disabled={passwordSaving}
                  className="w-full bg-yellow-500 text-white py-3 rounded-lg font-semibold hover:bg-yellow-600 transition disabled:bg-gray-400"
                >
                  {passwordSaving ? '...' : t.changePassword}
                </button>
              </div>
            </div>

            {/* ログアウト */}
            <div className="border-t pt-6 mt-6">
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition"
              >
                {t.logout}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              {/* 商品URLインポート (最上部に常設) */}
              <div className="mb-8 border-b pb-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {lang === 'es' ? 'OBTENER COTIZACIÓN POR URL' : 'OBTER COTAÇÃO POR URL'}
                </h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchUrl}
                    onChange={(e) => setSearchUrl(e.target.value)}
                    className="flex-1 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-gray-800 text-sm"
                  />
                  <button
                    onClick={handleImport}
                    disabled={loading}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 transition disabled:bg-indigo-300 whitespace-nowrap text-sm shadow-sm"
                  >
                    {loading ? '...' : t.import}
                  </button>
                </div>
              </div>

              {/* 検索タイプ切り替え (カテゴリ / ワード) */}
              <div className="flex border-b mb-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <button
                  onClick={() => {
                    setSearchType('categories');
                    setProducts([]);
                  }}
                  className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition ${searchType === 'categories' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}
                >
                  {t.searchByCategories}
                </button>
                <button
                  onClick={() => {
                    setSearchType('keyword');
                    setProducts([]);
                  }}
                  className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition ${searchType === 'keyword' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}
                >
                  {t.searchByKeyword}
                </button>
              </div>

              {searchType === 'categories' ? (
                <div>
                  {currentCategory && (
                    <button
                      onClick={() => setCurrentCategory(null)}
                      className="mb-4 flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold text-sm"
                    >
                      ← {t.back} ({lang === 'es' ? currentCategory.es : currentCategory.pt})
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(currentCategory ? currentCategory.sub : CATEGORIES).map((cat: any) => (
                      <button
                        key={cat.id}
                        onClick={async () => {
                          if (cat.sub) {
                            setCurrentCategory(cat);
                          } else if (cat.url) {
                            fetchCategoryItems(cat.url, 1);
                          }
                        }}
                        className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition group shadow-sm bg-gray-50/30"
                      >
                        <span className="text-sm font-semibold text-gray-700 group-hover:text-indigo-600">
                          {lang === 'es' ? cat.es : cat.pt}
                        </span>
                        <span className="text-gray-400 group-hover:text-indigo-600 font-bold">
                          {cat.sub ? '→' : '↓'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder={t.keywordPlaceholder}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                      className="flex-1 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-gray-800 text-sm"
                    />
                    <button
                      onClick={handleKeywordSearch}
                      disabled={loading || isSearching}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-indigo-700 transition disabled:bg-indigo-300 text-sm shadow-sm"
                    >
                      {isSearching ? '...' : t.search}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition cursor-pointer"
                  onClick={() => fetchProductDetailForOffer(product.url)}
                >
                  <div className="aspect-square w-full overflow-hidden bg-gray-50">
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="p-3 sm:p-4">
                    <h3 className="text-sm font-semibold mb-2 line-clamp-2 h-10">{product.title}</h3>
                    <div className="space-y-1 mb-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{t.currentPrice}:</span>
                        <span className="font-bold text-gray-900">¥{product.currentPrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-end pt-1 border-t border-gray-100">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase">USD aprox:</span>
                        <span className="text-lg font-bold text-indigo-600">
                          ${calculateUSDPrice(product.currentPrice, product.shippingCost || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>{t.bids}: {product.bids}</span>
                      <span className="underline">View Detail →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ページネーション */}
            {(products.length > 0) && (
              <div className="mt-8 flex justify-center items-center gap-4">
                <button
                  disabled={searchPage === 1 || loading}
                  onClick={() => {
                    const nextP = searchPage - 1;
                    if (searchType === 'keyword') handleKeywordSearch(undefined, nextP);
                    else if (activeCategoryUrl) fetchCategoryItems(activeCategoryUrl, nextP);
                  }}
                  className="px-4 py-2 border rounded-lg text-sm font-bold disabled:opacity-30"
                >
                  ← {t.previous}
                </button>
                <span className="text-sm font-bold text-gray-500">Page {searchPage}</span>
                <button
                  disabled={!nextPageExists || loading}
                  onClick={() => {
                    const nextP = searchPage + 1;
                    if (searchType === 'keyword') handleKeywordSearch(undefined, nextP);
                    else if (activeCategoryUrl) fetchCategoryItems(activeCategoryUrl, nextP);
                  }}
                  className="px-4 py-2 border rounded-lg text-sm font-bold disabled:opacity-30"
                >
                  {t.next} →
                </button>
              </div>
            )}
          </>
        )}
      </main>


      {selectedProduct && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold mb-4">{t.makeOffer}</h2>

            <div className="flex gap-3 mb-4">
              <img
                src={selectedProduct.imageUrl}
                alt={selectedProduct.title}
                className="w-32 h-32 object-cover rounded flex-shrink-0"
              />
              <div className="flex-1 flex flex-col py-0.5 overflow-hidden">
                <h3 className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">{selectedProduct.title}</h3>
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-gray-600">
                    {t.currentPrice}: ¥{selectedProduct.currentPrice.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-600">
                    USD: ${calculateUSDPrice(selectedProduct.currentPrice, selectedProduct.shippingCost || 0)}
                  </p>
                </div>
                <a
                  href={`https://translate.google.com/translate?sl=ja&tl=${lang}&u=${encodeURIComponent(selectedProduct.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline text-xs inline-block mt-auto"
                >
                  {t.viewOnYahoo}
                </a>
              </div>
            </div>

            {/* 商品説明の追加 */}
            {selectedProduct.translatedDescription && (
              <div className="mt-4 mb-4 p-4 bg-gray-50 rounded-lg max-h-40 overflow-y-auto border border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.description}</h4>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {selectedProduct.translatedDescription}
                </p>
              </div>
            )}

            <form onSubmit={handleBidRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">{t.yourName}</label>
                <input
                  type="text"
                  value={bidForm.name}
                  onChange={(e) => setBidForm({ ...bidForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{t.maxBid}</label>
                <input
                  type="number"
                  value={bidForm.maxBid}
                  onChange={(e) => setBidForm({ ...bidForm, maxBid: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
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
      {showCounterModal && selectedRequestForCounter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">{t.counterOfferAction}</h2>
            <p className="text-sm text-gray-600 mb-2">
              {lang === 'es' ? 'Contraoferta actual:' : 'Contraoferta atual:'} ${Math.round(selectedRequestForCounter.counterOffer).toLocaleString('en-US')}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">{t.yourCounterOffer}</label>
              <input
                type="number"
                value={customerCounterAmount}
                onChange={(e) => setCustomerCounterAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="USD"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCounterModal(false);
                  setSelectedRequestForCounter(null);
                  setCustomerCounterAmount('');
                }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  if (customerCounterAmount && !isNaN(parseFloat(customerCounterAmount))) {
                    handleCounterOfferResponse(selectedRequestForCounter.id, 'counter', parseFloat(customerCounterAmount));
                    setShowCounterModal(false);
                    setSelectedRequestForCounter(null);
                    setCustomerCounterAmount('');
                  }
                }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700"
              >
                {lang === 'es' ? 'Enviar' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}