'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signIn, signUp, signOut, getCurrentUser, resetPassword, updatePassword, updateProfile, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/push-notifications';
import { formatDateTime, formatDateOnly, getTimeRemaining, parseAnyDateTime, parseDbDateTime, parseJstDateTime, calculateLocalCost, calculateJapanSendAmount, calculateDefaultFobCost, calculateDefaultShippingCost, deliveryLocations, getCountryNameJa, getCityNameJa, extractAuctionId, getLocalOfferedIds, addLocalOfferedId, removeLocalOfferedId, syncLocalOfferedIds, copyToClipboardSafe } from '@/lib/utils';
import { getOptimizedImageUrl } from '@/lib/image-cache';
import { BidRequest, SearchItem } from '@/lib/types';
import { COUNTRIES, BRAZIL_STATES } from '@/lib/constants';

interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  type?: string;
}

// BRLクレジットカード決済の受付フラグ (false: 準備中/停止, true: 受付中/再開)
// 将来クレジットカード決済を再開する際はここを true に切り替えるだけで復旧可能です
const ENABLE_CREDIT_CARD_PAYMENT = false;

const translations = {
  es: {
    title: 'JOGALIBRE',
    subtitle: 'Compra y Subasta Directa de Japón',
    language: 'Idioma',
    searchPlaceholder: 'Pega la URL del producto de Yahoo Auctions aquí...',
    import: 'Importar',
    currentPrice: 'Precio actual',
    shippingCost: 'Costo de envío',
    totalPrice: 'Precio total',
    shippingUnknown: 'El costo de envío se agregará en la contraoferta',
    usdPrice: 'USD Aprox:',
    bids: 'Oferta',
    bidsLabel: 'Ofertas',
    timeLeft: 'Termina en:',
    endsInHeader: 'Termina en:',
    makeOffer: 'Hacer oferta',
    search: 'Buscar',
    yourName: 'Nombre del cliente',
    maxBid: 'Tu oferta máxima',
    submit: 'Enviar solicitud',
    cancel: 'Cancelar',
    login: 'Iniciar sesión',
    email: 'Correo electrónico',
    password: 'Contraseña',
    loginButton: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    myRequests: 'Solicitudes',
    purchasedItems: 'Comprados',
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
    deleteCard: 'Borrar',
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
    viewOnYahoo: 'Ver producto',
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
    notifications: 'Notificaciones Push',
    enableNotifications: 'Activar notificaciones',
    disableNotifications: 'Desactivar notificaciones',
    notificationsEnabled: 'Notificaciones activadas \u2705',
    notificationsDisabled: 'Notificaciones desactivadas',
    sendComprobante: 'Enviar comprobante de pago',
    whatsappGroup: 'Entrar al Grupo WhatsApp',
    sendPaymentProof: 'Enviar Comprovante WhatsApp',
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
    categoriesTab: 'Categoría',
    searchTab: 'Palabra',
    searchBottomTab: 'Busca',
    searchAction: 'Buscar',
    urlTab: 'URL',
    favoritesTab: 'Favoritos',
    addedToFavorites: 'Añadido a favoritos',
    removedFromFavorites: 'Eliminado de favoritos',
    condAll: 'Todos',
    condNew: 'Nuevo',
    condUsed: 'Usado',
    depositsTab: 'Depósitos',
    shippingTab: 'Envíos',
    deliveryLocationLabel: 'Lugar de entrega',
    deliveryFob: 'Japón 🇯🇵',
    deliveryAsuncion: 'Asunción 🇵🇾',
    deliveryCde: 'Ciudad del Este 🇵🇾',
    deliveryEncarnacion: 'Encarnación 🇵🇾',
    deliveryPjc: 'Pedro Juan Caballero 🇵🇾',
    localCostLabel: 'Costo Local',
    shippingMethodLabel: 'Método de envío',
    shippingMethodSea: 'Contenedor 🚢',
    shippingMethodAir: 'Avión ✈️',
    shippingStatusLabel: 'Estado de envío',
    shippingDateLabel: 'Fecha de envío',
    carrierLabel: 'Transportista',
    trackingNumberLabel: 'Número de seguimiento',
    trackingUrlButton: 'Ver Tracking 🔍',
    estimatedArrivalLabel: 'Fecha estimada de llegada',
    arrivalLabel: 'Fecha de llegada',
    deliveryCompleteLabel: 'Fecha de entrega',
    statusNotShipped: 'No enviado',
    statusArrivedJp: 'Llegado al almacén de Japón',
    statusInTransit: 'En tránsito',
    statusArrivedLocal: 'Llegado al destino',
    statusReadyForDelivery: 'Listo para retiro',
    statusDelivered: 'Entregado',
    featuredTitle: 'Destacados de Japón',
    quickTagsTitle: 'Marcas Populares',
    categoriesTitle: 'Categorias',
    offerMade: 'Oferta enviada',
  },
  pt: {
    title: 'JOGALIBRE',
    subtitle: 'Compra e Leilão Direto do Japão',
    language: 'Idioma',
    searchPlaceholder: 'Cole a URL do produto do Yahoo Auctions aqui...',
    import: 'Importar',
    currentPrice: 'Preço atual',
    shippingCost: 'Custo de envio',
    totalPrice: 'Preço total',
    shippingUnknown: 'O custo de envio será adicionado na contraoferta',
    usdPrice: 'USD Aprox:',
    bids: 'Oferta',
    bidsLabel: 'Lances',
    timeLeft: 'Termina em:',
    endsInHeader: 'Termina em:',
    viewOnYahoo: 'Ver produto',
    makeOffer: 'Fazer oferta',
    search: 'Buscar',
    yourName: 'Nome do cliente',
    maxBid: 'Sua oferta máxima',
    submit: 'Enviar solicitação',
    cancel: 'Cancelar',
    login: 'Entrar',
    email: 'E-mail',
    password: 'Senha',
    loginButton: 'Entrar',
    logout: 'Sair',
    myRequests: 'Solicitações',
    purchasedItems: 'Comprados',
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
    deleteCard: 'Excluir',
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
    exchangeRate: 'Taxa de câmbio',
    offerSuccess: 'Oferta enviada com sucesso!',
    offerError: 'Erro ao enviar oferta. Por favor, tente novamente.',
    days: 'dias',
    hours: 'horas',
    minutes: 'minutos',
    mShort: 'm',
    myPage: 'Minha Conta',
    profile: 'Perfil',
    fullName: 'Nome completo',
    whatsapp: 'WhatsApp',
    saveProfile: 'Salvar alterações',
    changePassword: 'Alterar senha',
    newPassword: 'Nova senha',
    confirmNewPassword: 'Confirmar nova senha',
    notifications: 'Notificações Push',
    enableNotifications: 'Ativar notificações',
    disableNotifications: 'Desativar notificações',
    notificationsEnabled: 'Notificações ativadas \u2705',
    notificationsDisabled: 'Notificações desativadas',
    sendComprobante: 'Enviar comprovante de pagamento',
    whatsappGroup: 'Entrar no Grupo WhatsApp',
    sendPaymentProof: 'Enviar Comprovante WhatsApp',
    searchByUrl: 'Importar por URL',
    searchByKeyword: 'Buscar por Palavra',
    searchByCategories: 'Categorias',
    keywordPlaceholder: 'Buscar produtos (ex. relógio, bolsa...)',
    searching: 'Buscando...',
    back: 'Voltar',
    productDetail: 'Detalhe do Produto',
    description: 'Descrição',
    loadingDetail: 'Carregando detalhes...',
    previous: 'Anterior',
    next: 'Próximo',
    categoriesTab: 'Categoria',
    searchTab: 'Palavra',
    searchBottomTab: 'Busca',
    searchAction: 'Buscar',
    urlTab: 'URL',
    favoritesTab: 'Favoritos',
    addedToFavorites: 'Adicionado aos favoritos',
    removedFromFavorites: 'Removido dos favoritos',
    condAll: 'Todos',
    condNew: 'Novo',
    condUsed: 'Usado',
    depositsTab: 'Depósitos',
    shippingTab: 'Envios',
    deliveryLocationLabel: 'Local de entrega',
    deliveryFob: 'Japão 🇯🇵',
    deliveryAsuncion: 'Assunção 🇵🇾',
    deliveryCde: 'Ciudad del Este 🇵🇾',
    deliveryEncarnacion: 'Encarnação 🇵🇾',
    deliveryPjc: 'Pedro Juan Caballero 🇵🇾',
    localCostLabel: 'Custo Local',
    shippingMethodLabel: 'Método de envio',
    shippingMethodSea: 'Contêiner 🚢',
    shippingMethodAir: 'Avião ✈️',
    shippingStatusLabel: 'Status de envio',
    shippingDateLabel: 'Data de envio',
    carrierLabel: 'Transportadora',
    trackingNumberLabel: 'Número de rastreamento',
    trackingUrlButton: 'Rastrear Envio 🔍',
    estimatedArrivalLabel: 'Data estimada de chegada',
    arrivalLabel: 'Data de chegada',
    deliveryCompleteLabel: 'Data de entrega',
    statusNotShipped: 'Não enviado',
    statusArrivedJp: 'Chegou ao armazém do Japão',
    statusInTransit: 'Em trânsito',
    statusArrivedLocal: 'Chegou ao destino',
    statusReadyForDelivery: 'Pronto para retirada',
    statusDelivered: 'Entregue',
    featuredTitle: 'Destaques do Japão',
    quickTagsTitle: 'Marcas Populares',
    categoriesTitle: 'Categorias',
    offerMade: 'Oferta enviada',
  }
};

const bankLabels = {
  es: {
    name: 'NOMBRE DE BANCO',
    sucursal: 'SUCURSAL',
    swift: 'CÓDIGO SWIFT',
    address_bank: 'DIRECCIÓN DE BANCO',
    account_number: 'NÚMERO DE CUENTA',
    account_name: 'NOMBRE DE CUENTA',
    address_joga: 'DIRECCIÓN',
    telefono: 'TELÉFONO',
    intermediary_bank: 'BANCO INTERMEDIARIO',
    intermediary_swift: 'SWIFT INTERMEDIARIO'
  },
  pt: {
    name: 'NOME DO BANCO',
    sucursal: 'AGÊNCIA',
    swift: 'CÓDIGO SWIFT',
    address_bank: 'ENDEREÇO DO BANCO',
    account_number: 'NÚMERO DA CONTA',
    account_name: 'NOME DA CONTA',
    address_joga: 'ENDEREÇO',
    telefono: 'TELEFONE',
    intermediary_bank: 'BANCO INTERMEDIÁRIO',
    intermediary_swift: 'SWIFT INTERMEDIÁRIO'
  }
};


interface Category {
  id: string;
  es: string;
  pt: string;
  url?: string;
  sub?: Category[];
  brand?: string;
}

// 顧客画面のナビゲーション状態（検索結果・カテゴリ階層・タブ・スクロール位置）のセッションキャッシュ
const SEARCH_NAV_CACHE_KEY = 'jogalibre_search_nav_state';

interface SearchNavState {
  activeTab?: 'search' | 'favorites' | 'requests' | 'purchased' | 'mypage' | 'deposits' | 'shipping';
  searchType?: 'url' | 'keyword' | 'categories';
  categoryHistory?: Category[];
  activeCategoryUrl?: string | null;
  keyword?: string;
  searchCondition?: 'all' | 'new' | 'used';
  sortOrder?: 'featured' | 'price_asc' | 'price_desc' | 'bids_desc' | 'new';
  searchPage?: number;
  nextPageExists?: boolean;
  products?: SearchItem[];
  scrollY?: number;
}

const getStoredNavState = (): SearchNavState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SEARCH_NAV_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to read search nav state:', e);
  }
  return null;
};

const saveNavState = (state: Partial<SearchNavState>) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredNavState() || {};
    const updated = {
      ...existing,
      ...state,
      scrollY: typeof window !== 'undefined' ? window.scrollY : (state.scrollY ?? existing.scrollY ?? 0)
    };
    sessionStorage.setItem(SEARCH_NAV_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save search nav state:', e);
  }
};

// B001傘下顧客およびブラジルエージェント（ブラジル在住）の判定関数
const isBrlDefaultUser = (user: any): boolean => {
  if (!user) return false;
  if (user.agentCustomerId === 'B001' || user.agent_customer_id === 'B001') return true;
  if (user.customerId === 'B001' || user.customer_id === 'B001') return true;
  const country = (user.country || '').trim().toLowerCase();
  if (country === 'brasil' || country === 'brazil') return true;
  if (user.role === 'agent' && (country === 'brasil' || country === 'brazil')) return true;
  return false;
};

const BRAND_LOGOS: Record<string, React.ReactNode> = {
  toyota: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current text-[#111111] mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3.848C5.223 3.848 0 7.298 0 12c0 4.702 5.224 8.152 12 8.152S24 16.702 24 12c0-4.702-5.223-8.152-12-8.152zm7.334 3.839c0 1.08-1.725 1.913-4.488 2.246-.26-2.58-1.005-4.279-1.963-4.913 2.948.184 6.45 1.227 6.45 2.667zM12 16.401c-.96 0-1.746-1.5-1.808-4.389.577.047 1.18.072 1.808.072.628 0 1.23-.025 1.807-.072-.061 2.89-.847 4.389-1.807 4.389zm0-6.308c-.59 0-1.155-.019-1.69-.054.261-1.728.92-3.15 1.69-3.15.77 0 1.428 1.422 1.689 3.15-.535.034-1.099.054-1.689.054zm-.882-5.075c-.956.633-1.706 2.333-1.964 4.915C6.391 9.6 4.665 8.767 4.665 7.687c0-1.44 3.504-2.49 6.453-2.669zM2.037 11.68a5.265 5.265 0 011.048-3.164c.27 1.547 2.522 2.881 5.972 3.37V12c0 3.772.879 6.203 2.087 6.97-5.107-.321-9.107-3.48-9.107-7.29zm10.823 7.29c1.207-.767 2.087-3.198 2.087-6.97v-.115c3.447-.488 5.704-1.826 5.972-3.37a5.26 5.26 0 011.049 3.165c-.004 3.81-4.008 6.969-9.109 7.29z"/>
    </svg>
  ),
  nissan: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current text-[#111111] mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.576 14.955l-.01.028c-1.247 3.643-4.685 6.086-8.561 6.086-3.876 0-7.32-2.448-8.562-6.09l-.01-.029H.71v.329l1.133.133c.7.08.847.39 1.038.78l.048.096c1.638 3.495 5.204 5.752 9.08 5.752 3.877 0 7.443-2.257 9.081-5.747l.048-.095c.19-.39.338-.7 1.038-.781l1.134-.134v-.328zM3.443 9.012c1.247-3.643 4.686-6.09 8.562-6.09 3.876 0 7.319 2.447 8.562 6.09l.01.028h2.728v-.328l-1.134-.133c-.7-.081-.847-.39-1.038-.781l-.047-.096C19.448 4.217 15.88 1.96 12.005 1.96c-3.881 0-7.443 2.257-9.081 5.752l-.048.095c-.19.39-.338.7-1.038.781l-1.133.133v.329h2.724zm13.862 1.586l-1.743 2.795h.752l.31-.5h2.033l.31.5h.747l-1.743-2.795zm1.033 1.766h-1.395l.7-1.124zm2.81-1.066l2.071 2.095H24v-2.795h-.614v2.085l-2.062-2.085h-.795v2.795h.619zM0 13.393h.619v-2.095l2.076 2.095h.781v-2.795h-.619v2.085L.795 10.598H0zm4.843-2.795h.619v2.795h-.62zm4.486 2.204c-.02.005-.096.005-.124.005H6.743v.572h2.5c.019 0 .167 0 .195-.005.51-.048.743-.472.743-.843 0-.381-.243-.79-.705-.833-.09-.01-.166-.01-.2-.01H7.643a.83.83 0 0 1-.181-.014c-.129-.034-.176-.148-.176-.243 0-.086.047-.2.18-.238a.68.68 0 0 1 .172-.014h2.357v-.562H7.6c-.1 0-.176.004-.238.014a.792.792 0 0 0-.695.805c0 .343.214.743.685.81.086.009.205.009.258.009H9.2c.029 0 .1 0 .114.005.181.023.243.157.243.276a.262.262 0 0 1-.228.266zm4.657 0c-.02.005-.096.005-.129.005H11.4v.572h2.5c.019 0 .167 0 .195-.005.51-.048.743-.472.743-.843 0-.381-.243-.79-.705-.833-.09-.01-.166-.01-.2-.01H12.3a.83.83 0 0 1-.181-.014c-.129-.034-.176-.148-.176-.243 0-.086.047-.2.18-.238a.68.68 0 0 1 .172-.014h2.357v-.562h-2.395c-.1 0-.176.004-.238.014a.792.792 0 0 0-.695.805c0 .343.214.743.686.81.085.009.204.009.257.009h1.59c.029 0 .1 0 .114.005.181.023.243.157.243.276a.267.267 0 0 1-.228.266Z"/>
    </svg>
  ),
  mitsubishi: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current text-[#E60012] mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 22.38H0l4-6.92h8zm8 0h8l-4-6.92h-8zm0-13.84l-4-6.92-4 6.92 4 6.92Z"/>
    </svg>
  ),
  mazda: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current text-[#111111] mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.999 12.876c-.036 0-.105-.046-.222-.26a7.531 7.531 0 00-1.975-2.353A8.255 8.255 0 007.7 9.065a17.945 17.945 0 00-.345-.136c-1.012-.4-2.061-.813-3.035-1.377A8.982 8.982 0 014 7.362c.194-.34.42-.665.67-.962a6.055 6.055 0 011.253-1.131 7.126 7.126 0 011.618-.806c1.218-.434 2.677-.647 4.458-.649 1.783.002 3.241.215 4.459.65a7.097 7.097 0 011.619.805c.471.319.892.699 1.253 1.13.25.298.475.623.67.963-.103.064-.212.129-.32.192-.976.564-2.023.977-3.037 1.376l-.345.136a8.26 8.26 0 00-2.1 1.198 7.519 7.519 0 00-1.975 2.354c-.117.213-.187.259-.224.259m0 7.072c-1.544-.002-2.798-.129-3.83-.387-1.013-.252-1.855-.64-2.576-1.188a5.792 5.792 0 01-1.392-1.537 7.607 7.607 0 01-.81-1.768 10.298 10.298 0 01-.467-2.983c0-.674.047-1.313.135-1.901 1.106.596 2.153.895 3.08 1.16l.215.06c1.29.371 2.314.857 3.135 1.488.475.368.89.793 1.23 1.264.369.508.663 1.088.877 1.725.096.289.2.468.403.468.207 0 .308-.18.405-.468a6.124 6.124 0 012.107-2.988c.82-.632 1.845-1.118 3.135-1.489l.216-.06c.926-.265 1.973-.564 3.078-1.16.09.589.136 1.227.136 1.9 0 .458-.046 1.664-.465 2.984a7.626 7.626 0 01-.809 1.768 5.789 5.789 0 01-1.396 1.537c-.723.548-1.565.936-2.574 1.188-1.035.258-2.288.385-3.833.387m9.692-14.556c-1.909-2.05-4.99-2.99-9.692-2.995-4.7.005-7.781.944-9.69 2.994C.89 6.913 0 9.018 0 11.874c0 1.579.39 5.6 3.564 7.676 1.9 1.242 4.354 2.046 8.435 2.052 4.083-.006 6.536-.81 8.437-2.052C23.609 17.474 24 13.452 24 11.874c0-2.848-.897-4.968-2.31-6.483Z"/>
    </svg>
  ),
  subaru: (
    <svg viewBox="0 0 24 24" className="w-7 h-7 mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      {/* ブルーのベース楕円 */}
      <ellipse cx="12" cy="12" rx="11" ry="6.5" fill="#003893" />
      {/* シルバーのフチと星（公式プレアデス六連星の正確なパス） */}
      <path fill="#C0C0C0" d="M12 4.983c3.004 0 6.224.612 8.786 2.239C22.451 8.286 24 9.9 24 12.002c0 2.456-2.097 4.242-4.106 5.287-2.391 1.238-5.216 1.728-7.894 1.728-3.003 0-6.217-.605-8.78-2.238C1.556 15.714 0 14.101 0 12.003 0 9.536 2.092 7.757 4.106 6.71 6.504 5.474 9.323 4.983 12 4.983zm-.025.746c-2.793 0-5.802.523-8.225 1.983-1.524.912-3.03 2.347-3.03 4.253 0 2.239 2.04 3.806 3.864 4.706 2.258 1.102 4.897 1.53 7.391 1.53 2.798 0 5.809-.523 8.232-1.983 1.517-.918 3.029-2.346 3.029-4.253 0-2.243-2.035-3.813-3.864-4.705-2.258-1.104-4.898-1.53-7.397-1.53zm-10.54 4.686l4.597-.784 1.384-3.003L8.794 9.63l4.596.784-4.596.792-1.378 3.01-1.384-3.01zm10.106 2.289l2.028-.356.605-1.359.606 1.359 2.028.356-2.028.35-.606 1.36-.605-1.36zm4.196-3.621l2.028-.35.605-1.365.606 1.364 2.028.35-2.028.357-.606 1.36-.606-1.36zM13.57 15.51l2.02-.35.607-1.365.612 1.365 2.027.35-2.027.357-.612 1.36-.606-1.36zm-6.23.491l2.028-.35.612-1.366.605 1.366 2.028.35-2.028.357-.605 1.359-.612-1.359zm10.196-3.353l2.022-.357.605-1.359.612 1.359 2.028.357-2.028.35-.612 1.357-.606-1.357Z" />
    </svg>
  ),
  wrench: (
    <svg viewBox="0 0 512 512" className="w-7 h-7 fill-current text-[#4B5563] mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      {/* 斜め45度のソリッドなスパナ（Font Awesome 5 の非常にシンプルで視認性の高いレンチ） */}
      <path d="M507.73 109.1c-2.24-9.03-13.54-12.09-20.12-5.51l-74.36 74.36-67.88-11.31-11.31-67.88 74.36-74.36c6.62-6.62 3.43-17.9-5.66-20.16-47.38-11.74-99.55.91-136.58 37.93-39.64 39.64-50.55 97.1-34.05 147.2L18.74 402.76c-24.99 24.99-24.99 65.51 0 90.5 24.99 24.99 65.51 24.99 90.5 0l213.21-213.21c50.12 16.71 107.47 5.68 147.37-34.22 37.07-37.07 49.7-89.32 37.91-136.73zM64 472c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
};

const CATEGORIES: Category[] = [
  {
    id: 'vehiculo',
    es: 'Vehículo',
    pt: 'Veículo',
    url: 'https://auctions.yahoo.co.jp/category/list/26360/',
    sub: [
      {
        id: 'jdm',
        es: 'Carros JDM',
        pt: 'Carros JDM',
        url: 'https://auctions.yahoo.co.jp/category/list/26360/',
        sub: [
          { id: 'supra', es: 'TOYOTA SUPRA', pt: 'TOYOTA SUPRA', brand: 'toyota', url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%82%B9%E3%83%BC%E3%83%97%E3%83%A9&auccat=26360&va=%E3%82%B9%E3%83%BC%E3%83%97%E3%83%A9&b=1&n=50' },
          { id: 'skyline', es: 'NISSAN SKYLINE GT-R', pt: 'NISSAN SKYLINE GT-R', brand: 'nissan', url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%82%B9%E3%82%AB%E3%82%A4%E3%83%A9%E3%82%A4%E3%83%B3+GT-R&auccat=26360&va=%E3%82%B9%E3%82%AB%E3%82%A4%E3%83%A9%E3%82%A4%E3%83%B3+GT-R&b=1&n=50' },
          { id: 'lancer', es: 'MITSUBISHI LANCER EVO', pt: 'MITSUBISHI LANCER EVO', brand: 'mitsubishi', url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%83%A9%E3%83%B3%E3%82%B5%E3%83%BC%E3%82%A8%E3%83%9C%E3%83%AA%E3%83%A5%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3&auccat=26360&va=%E3%83%A9%E3%83%B3%E3%82%B5%E3%83%BC%E3%82%A8%E3%83%9C%E3%83%AA%E3%83%A5%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3&b=1&n=50' },
          { id: 'rx7', es: 'MAZDA RX-7', pt: 'MAZDA RX-7', brand: 'mazda', url: 'https://auctions.yahoo.co.jp/search/search?p=RX-7&auccat=26360&va=RX-7&b=1&n=50' },
          { id: 'silvia', es: 'NISSAN SILVIA', pt: 'NISSAN SILVIA', brand: 'nissan', url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%82%B7%E3%83%AB%E3%83%9B%E3%82%A2&auccat=26360&va=%E3%82%B7%E3%83%AB%E3%83%9B%E3%82%A2&b=1&n=50' },
          { id: 'impreza', es: 'SUBARU IMPREZA', pt: 'SUBARU IMPREZA', brand: 'subaru', url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%82%A4%E3%83%B3%E3%83%97%E3%83%AC%E3%83%83%E3%82%B5+STI&auccat=26360&va=%E3%82%A4%E3%83%B3%E3%83%97%E3%83%AC%E3%83%83%E3%82%B5+STI&b=1&n=50' },
          { id: 'desarme', es: 'Vehiculo Para Desarme', pt: 'Veículo Para Desmanche', brand: 'wrench', url: 'https://auctions.yahoo.co.jp/category/list/2084061280/?o1=d&s1=new&exflg=1&b=1&n=50' },
        ]
      },
      { id: 'moto', es: 'Moto', pt: 'Moto', url: 'https://auctions.yahoo.co.jp/category/list/26316/?s1=new&o1=d' },
      { id: 'bicicleta', es: 'Bicicleta', pt: 'Bicicleta', url: 'https://auctions.yahoo.co.jp/category/list/26246/?p=%E8%BB%8A%E4%BD%93&auccat=26246&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=new&o1=d' }
    ]
  },
  {
    id: 'autopartes',
    es: 'Autopartes',
    pt: 'Autopeças',
    url: 'https://auctions.yahoo.co.jp/list1/26322-category.html',
    sub: [
      {
        id: 'motor',
        es: 'Motor',
        pt: 'Motor',
        url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%B3%E6%9C%AC%E4%BD%93+-%E3%82%BF%E3%83%BC%E3%83%93%E3%83%B3+-%E3%82%BF%E3%83%BC%E3%83%9C%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%83%A3%E3%83%BC+-%E3%83%A9%E3%82%B8%E3%82%A8%E3%82%BF+-%E7%87%83%E6%96%99%E3%83%9D%E3%83%B3%E3%83%97+-%E3%82%BB%E3%83%AB%E3%83%A2%E3%83%BC%E3%82%BF%E3%83%BC+-%E3%82%BF%E3%82%A4%E3%83%9F%E3%83%B3%E3%82%B0%E3%83%81%E3%82%A7%E3%83%BC%E3%83%B3+-%E3%82%A8%E3%82%A2%E3%83%95%E3%83%AD&auccat=2084200282&va=%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%B3%E6%9C%AC%E4%BD%93&ve=%E3%82%BF%E3%83%BC%E3%83%93%E3%83%B3+%E3%82%BF%E3%83%BC%E3%83%9C%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%83%A3%E3%83%BC+%E3%83%A9%E3%82%B8%E3%82%A8%E3%82%BF+%E7%87%83%E6%96%99%E3%83%9D%E3%83%B3%E3%83%97+%E3%82%BB%E3%83%AB%E3%83%A2%E3%83%BC%E3%82%BF%E3%83%BC+%E3%82%BF%E3%82%A4%E3%83%9F%E3%83%B3%E3%82%B0%E3%83%81%E3%82%A7%E3%83%BC%E3%83%B3+%E3%82%A8%E3%82%A2%E3%83%95%E3%83%AD&istatus=1%2C4%2C5%2C6&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=score2&o1=d&mode=1'
      },
      {
        id: 'transmision',
        es: 'Transmisión',
        pt: 'Transmissão',
        url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%83%88%E3%83%A9%E3%83%B3%E3%82%B9%E3%83%9F%E3%83%83%E3%82%B7%E3%83%A7%E3%83%B3&auccat=2084008426&va=%E3%83%88%E3%83%A9%E3%83%B3%E3%82%B9%E3%83%9F%E3%83%83%E3%82%B7%E3%83%A7%E3%83%B3&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=score2&o1=d&mode=1&rc_ng=1'
      },
      {
        id: 'llantas',
        es: 'Llantas',
        pt: 'Rodas',
        url: 'https://auctions.yahoo.co.jp/category/list/2084200183/',
        sub: [
          { id: 'll16', es: '16 pulgadas', pt: '16 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084200188/?p=16%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084200183&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&mode=1' },
          { id: 'll17', es: '17 pulgadas', pt: '17 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084200189/?p=17%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084200183&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&mode=1' },
          { id: 'll18', es: '18 pulgadas', pt: '18 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084200190/?p=18%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084200183&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&mode=1' },
        ]
      },
      {
        id: 'aros',
        es: 'Aros',
        pt: 'Aros',
        url: 'https://auctions.yahoo.co.jp/category/list/2084005140/',
        sub: [
          { id: 'ar16', es: '16 pulgadas', pt: '16 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084008474/?p=16%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084008474&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&o1=d&mode=1&brand_id=118472%2C118483%2C118474%2C119521%2C118478%2C118481%2C115842%2C102328%2C120288%2C119007' },
          { id: 'ar17', es: '17 pulgadas', pt: '17 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084040548/?p=17%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084040548&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&o1=d&mode=1&brand_id=118472%2C118478%2C118474%2C119007%2C119521%2C118481%2C115842%2C159741%2C118483%2C102328' },
          { id: 'ar18', es: '18 pulgadas', pt: '18 polegadas', url: 'https://auctions.yahoo.co.jp/category/list/2084040547/?p=18%E3%82%A4%E3%83%B3%E3%83%81&auccat=2084040547&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&o1=d&mode=1&brand_id=115842%2C119007%2C118474%2C102328%2C118472%2C118483%2C119521%2C118478%2C118481%2C128485' },
        ]
      },
      { id: 'suspension', es: 'Suspensión', pt: 'Suspensão', url: 'https://auctions.yahoo.co.jp/category/list/2084005257/?p=%E3%82%B5%E3%82%B9%E3%83%9A%E3%83%B3%E3%82%B7%E3%83%A7%E3%83%B3&auccat=2084005257&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&o1=d&mode=1&brand_id=128485%2C103816%2C105215%2C103820%2C119942%2C119941%2C119938' },
      { id: 'asiento', es: 'Asiento', pt: 'Assento', url: 'https://auctions.yahoo.co.jp/category/list/2084005258/?p=%E3%82%B7%E3%83%BC%E3%83%88&auccat=2084005258&is_postage_mode=1&dest_pref_code=8&b=1&n=50&s1=featured&o1=d&mode=1&brand_id=102214%2C103815%2C115842%2C128485%2C159741%2C103823' },
      {
        id: 'barras',
        es: 'Barras',
        pt: 'Barras',
        url: 'https://auctions.yahoo.co.jp/category/list/2084008461/?p=%E3%82%BF%E3%83%AF%E3%83%BC%E3%83%90%E3%83%BC%E3%80%81%E3%83%AD%E3%83%BC%E3%83%AB%E3%83%90%E3%83%BC&auccat=2084008461&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&o1=d&mode=1'
      },
      {
        id: 'freno',
        es: 'Freno',
        pt: 'Freio',
        url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%83%96%E3%83%AC%E3%83%B3%E3%83%9C&auccat=2084005259&va=%E3%83%96%E3%83%AC%E3%83%B3%E3%83%9C&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&o1=d&mode=1&brand_id=125435%2C128479%2C128488'
      },
      {
        id: 'caraudio',
        es: 'Car Audio',
        pt: 'Som Automotivo',
        url: 'https://auctions.yahoo.co.jp/category/list/23852/',
        sub: [
          {
            id: 'reproductor',
            es: 'Reproductor',
            pt: 'Player',
            url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%83%97%E3%83%AC%E3%83%BC%E3%83%A4%E3%83%BC&auccat=23852&va=%E3%83%97%E3%83%AC%E3%83%BC%E3%83%A4%E3%83%BC&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&o1=d&mode=1'
          },
          {
            id: 'amplificador',
            es: 'Amplificador',
            pt: 'Amplificador',
            url: 'https://auctions.yahoo.co.jp/category/list/2084005294/?p=%E3%82%A2%E3%83%B3%E3%83%97&auccat=23852&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&mode=1'
          },
          {
            id: 'subwoofer',
            es: 'Subwoofer',
            pt: 'Subwoofer',
            url: 'https://auctions.yahoo.co.jp/category/list/2084048322/'
          },
          {
            id: 'altavoz',
            es: 'Altavoces',
            pt: 'Alto-falantes',
            url: 'https://auctions.yahoo.co.jp/category/list/23864/'
          }
        ]
      }
    ]
  },
  {
    id: 'fashion',
    es: 'Moda',
    pt: 'Moda',
    url: 'https://auctions.yahoo.co.jp/category/list/23000/',
    sub: [
      {
        id: 'nike',
        es: 'NIKE',
        pt: 'NIKE',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=101319',
        sub: [
          { id: 'nike_men_shoes', es: 'Zapatos para Hombre', pt: 'Tênis Masculino', url: 'https://auctions.yahoo.co.jp/category/list/23200/?brand_id=101319' },
          { id: 'nike_men_clothing', es: 'Ropa para Hombre', pt: 'Roupas Masculinas', url: 'https://auctions.yahoo.co.jp/category/list/2084030289/?brand_id=101319' },
          { id: 'nike_women_shoes', es: 'Zapatos para Mujer', pt: 'Tênis Feminino', url: 'https://auctions.yahoo.co.jp/category/list/23312/?brand_id=101319' },
          { id: 'nike_women_clothing', es: 'Ropa para Mujer', pt: 'Roupas Femininas', url: 'https://auctions.yahoo.co.jp/category/list/2084292283/?brand_id=101319' }
        ]
      },
      {
        id: 'adidas',
        es: 'adidas',
        pt: 'adidas',
        url: 'https://auctions.yahoo.co.jp/category/list/2084048648/?brand_id=100149',
        sub: [
          { id: 'adidas_men_shoes', es: 'Zapatos para Hombre', pt: 'Tênis Masculino', url: 'https://auctions.yahoo.co.jp/category/list/2084005488/?brand_id=100149' },
          { id: 'adidas_men_clothing', es: 'Ropa para Hombre', pt: 'Roupas Masculinas', url: 'https://auctions.yahoo.co.jp/category/list/2084030308/?brand_id=100149' },
          { id: 'adidas_women_shoes', es: 'Zapatos para Mujer', pt: 'Tênis Feminino', url: 'https://auctions.yahoo.co.jp/category/list/2084007243/?brand_id=100149' },
          { id: 'adidas_women_clothing', es: 'Ropa para Mujer', pt: 'Roupas Femininas', url: 'https://auctions.yahoo.co.jp/category/list/2084242607/?brand_id=100149' }
        ]
      },
      {
        id: 'newbalance',
        es: 'New Balance',
        pt: 'New Balance',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=101352',
        sub: [
          { id: 'nb_men_shoes', es: 'Zapatos para Hombre', pt: 'Tênis Masculino', url: 'https://auctions.yahoo.co.jp/category/list/2084005490/?brand_id=101352' },
          { id: 'nb_men_clothing', es: 'Ropa para Hombre', pt: 'Roupas Masculinas', url: 'https://auctions.yahoo.co.jp/category/list/23176/?brand_id=101352' },
          { id: 'nb_women_shoes', es: 'Zapatos para Mujer', pt: 'Tênis Feminino', url: 'https://auctions.yahoo.co.jp/category/list/2084007245/?brand_id=101352' },
          { id: 'nb_women_clothing', es: 'Ropa para Mujer', pt: 'Roupas Femininas', url: 'https://auctions.yahoo.co.jp/category/list/23288/?brand_id=101352' }
        ]
      },
      {
        id: 'ape',
        es: 'A BATHING APE',
        pt: 'A BATHING APE',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=104488'
      },
      {
        id: 'abercrombie',
        es: 'Abercrombie & Fitch',
        pt: 'Abercrombie & Fitch',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=100174'
      },
      {
        id: 'converse',
        es: 'CONVERSE',
        pt: 'CONVERSE',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=100794'
      },
      {
        id: 'diesel',
        es: 'DIESEL',
        pt: 'DIESEL',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=101204'
      },
      {
        id: 'gap',
        es: 'GAP',
        pt: 'GAP',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=100612'
      },
      {
        id: 'lacoste',
        es: 'LACOSTE',
        pt: 'LACOSTE',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=102087'
      },
      {
        id: 'michaelkors',
        es: 'MICHAEL KORS',
        pt: 'MICHAEL KORS',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=106286'
      },
      {
        id: 'puma',
        es: 'PUMA',
        pt: 'PUMA',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=101611'
      },
      {
        id: 'tommyhilfiger',
        es: 'TOMMY HILFIGER',
        pt: 'TOMMY HILFIGER',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=101297'
      },
      {
        id: 'uniqlo',
        es: 'UNIQLO',
        pt: 'UNIQLO',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=102052'
      },
      {
        id: 'vans',
        es: 'VANS',
        pt: 'VANS',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=101501'
      },
      {
        id: 'zara',
        es: 'ZARA',
        pt: 'ZARA',
        url: 'https://auctions.yahoo.co.jp/category/list/23000/?brand_id=100831'
      },
    ]
  },
  {
    id: 'relojes',
    es: 'Relojes',
    pt: 'Relógios',
    url: 'https://auctions.yahoo.co.jp/category/list/23260/',
    sub: [
      {
        id: 'casio',
        es: 'CASIO',
        pt: 'CASIO',
        url: 'https://auctions.yahoo.co.jp/category/list/2084032114/'
      },
      {
        id: 'seiko',
        es: 'SEIKO',
        pt: 'SEIKO',
        url: 'https://auctions.yahoo.co.jp/category/list/2084024503/'
      },
      {
        id: 'citizen',
        es: 'CITIZEN',
        pt: 'CITIZEN',
        url: 'https://auctions.yahoo.co.jp/category/list/2084024505/'
      }
    ]
  },
  {
    id: 'deportes',
    es: 'Deportes',
    pt: 'Esportes',
    url: 'https://auctions.yahoo.co.jp/category/list/24698/',
    sub: [
      {
        id: 'futbol',
        es: 'Fútbol',
        pt: 'Futebol',
        url: 'https://auctions.yahoo.co.jp/category/list/25344/',
        sub: [
          {
            id: 'zapatos_futbol',
            es: 'Zapatos de Fútbol',
            pt: 'Chuteiras',
            url: 'https://auctions.yahoo.co.jp/category/list/2084032296/',
            sub: [
              {
                id: 'spikes',
                es: 'Botines',
                pt: 'Chuteiras',
                url: 'https://auctions.yahoo.co.jp/category/list/2084062860/'
              },
              {
                id: 'training',
                es: 'Society',
                pt: 'Society',
                url: 'https://auctions.yahoo.co.jp/category/list/2084062862/'
              },
              {
                id: 'futsal',
                es: 'Futsal',
                pt: 'Futsal',
                url: 'https://auctions.yahoo.co.jp/category/list/2084062861/'
              }
            ]
          }
        ]
      },
      {
        id: 'running',
        es: 'Running',
        pt: 'Corrida',
        url: 'https://auctions.yahoo.co.jp/category/list/2084230277/',
        sub: [
          {
            id: 'running_men_shoes',
            es: 'Zapatos para Hombre',
            pt: 'Tênis Masculino',
            url: 'https://auctions.yahoo.co.jp/category/list/2084230278/'
          },
          {
            id: 'running_men_clothing',
            es: 'Ropa de Running para Hombre',
            pt: 'Roupas de Corrida Masculinas',
            url: 'https://auctions.yahoo.co.jp/category/list/2084285323/'
          },
          {
            id: 'running_women_shoes',
            es: 'Zapatos para Mujer',
            pt: 'Tênis Feminino',
            url: 'https://auctions.yahoo.co.jp/category/list/2084230279/'
          },
          {
            id: 'running_women_clothing',
            es: 'Ropa de Running para Mujer',
            pt: 'Roupas de Corrida Femininas',
            url: 'https://auctions.yahoo.co.jp/category/list/2084285330/'
          }
        ]
      },
      {
        id: 'camping',
        es: 'Artículos para Camping',
        pt: 'Equipamentos de Camping',
        url: 'https://auctions.yahoo.co.jp/category/list/24702/'
      },
      {
        id: 'pesca',
        es: 'Artículos de Pesca',
        pt: 'Equipamentos de Pesca',
        url: 'https://auctions.yahoo.co.jp/category/list/25180/'
      }
    ]
  },
  {
    id: 'hobby',
    es: 'Hobby',
    pt: 'Hobby',
    url: 'https://auctions.yahoo.co.jp/category/list/24242/',
    sub: [
      {
        id: 'rccar',
        es: 'Carros RC',
        pt: 'Carros RC',
        url: 'https://auctions.yahoo.co.jp/category/list/2084251212/',
        sub: [
          {
            id: 'rc_engine',
            es: 'Combustión (Engine)',
            pt: 'Combustão (Engine)',
            url: 'https://auctions.yahoo.co.jp/category/list/2084251214/'
          },
          {
            id: 'rc_electric',
            es: 'Eléctrico',
            pt: 'Elétrico',
            url: 'https://auctions.yahoo.co.jp/category/list/2084251215/'
          }
        ]
      },
      {
        id: 'figure',
        es: 'Figuras',
        pt: 'Figuras',
        url: 'https://auctions.yahoo.co.jp/category/list/25888/',
        sub: [
          {
            id: 'gundam',
            es: 'Gundam',
            pt: 'Gundam',
            url: 'https://auctions.yahoo.co.jp/category/list/2084023728/'
          },
          {
            id: 'onepiece',
            es: 'ONE PIECE',
            pt: 'ONE PIECE',
            url: 'https://auctions.yahoo.co.jp/category/list/2084040581/'
          },
          {
            id: 'miku',
            es: 'Hatsune Miku',
            pt: 'Hatsune Miku',
            url: 'https://auctions.yahoo.co.jp/category/list/2084239888/'
          },
          {
            id: 'madoka',
            es: 'Madoka Magica',
            pt: 'Madoka Magica',
            url: 'https://auctions.yahoo.co.jp/category/list/2084305382/'
          },
          {
            id: 'dragonball',
            es: 'Dragon Ball',
            pt: 'Dragon Ball',
            url: 'https://auctions.yahoo.co.jp/category/list/2084040584/'
          },
          {
            id: 'nendoroid',
            es: 'Nendoroid',
            pt: 'Nendoroid',
            url: 'https://auctions.yahoo.co.jp/search/search?p=%E3%81%AD%E3%82%93%E3%81%A9%E3%82%8D%E3%81%84%E3%81%A9&auccat=25888&va=%E3%81%AD%E3%82%93%E3%81%A9%E3%82%8D%E3%81%84%E3%81%A9&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&o1=d&mode=1&nockie=1'
          }
        ]
      }
    ]
  },
  {
    id: 'electronics',
    es: 'Electrónicos',
    pt: 'Eletrônicos',
    url: 'https://auctions.yahoo.co.jp/list3/23336-category.html',
    sub: [
      {
        id: 'iphone',
        es: 'iPhone',
        pt: 'iPhone',
        url: 'https://auctions.yahoo.co.jp/category/list/2084317599/?p=iPhone&auccat=2084317599&shp_spec_id=S_C%3A29231%3A186373&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&mode=1'
      },
      {
        id: 'ipad',
        es: 'iPad',
        pt: 'iPad',
        url: 'https://auctions.yahoo.co.jp/category/list/2084259337/'
      },
      {
        id: 'smartwatch',
        es: 'Smartwatch',
        pt: 'Smartwatch',
        url: 'https://auctions.yahoo.co.jp/category/list/2084316075/?p=%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%82%A6%E3%82%A9%E3%83%83%E3%83%81%E6%9C%AC%E4%BD%93&auccat=2084316075&is_postage_mode=1&dest_pref_code=8&b=1&n=100&s1=featured&mode=1&brand_id=100011,116064,115831,100061,117584,116183,135431,104487'
      }
    ]
  },
  {
    id: 'pc_parts',
    es: 'Componentes de PC',
    pt: 'Componentes de PC',
    url: 'https://auctions.yahoo.co.jp/list3/2084039480-category.html',
    sub: [
      {
        id: 'cpu',
        es: 'CPU',
        pt: 'CPU',
        url: 'https://auctions.yahoo.co.jp/category/list/23400/'
      },
      {
        id: 'memory',
        es: 'Memoria RAM',
        pt: 'Memória RAM',
        url: 'https://auctions.yahoo.co.jp/category/list/2084039543/'
      },
      {
        id: 'gpu',
        es: 'Tarjeta Gráfica (GPU)',
        pt: 'Placa de Vídeo (GPU)',
        url: 'https://auctions.yahoo.co.jp/category/list/23461/'
      }
    ]
  },
  {
    id: 'camera',
    es: 'Cámaras',
    pt: 'Câmeras',
    url: 'https://auctions.yahoo.co.jp/category/list/23636/',
    sub: [
      {
        id: 'digital_camera',
        es: 'Cámaras Digitales',
        pt: 'Câmeras Digitais',
        url: 'https://auctions.yahoo.co.jp/category/list/2084261633/',
        sub: [
          {
            id: 'dslr',
            es: 'Réflex Digital (DSLR)',
            pt: 'Reflex Digital (DSLR)',
            url: 'https://auctions.yahoo.co.jp/category/list/2084261634/'
          },
          {
            id: 'mirrorless',
            es: 'Cámaras Mirrorless',
            pt: 'Câmeras Mirrorless',
            url: 'https://auctions.yahoo.co.jp/category/list/2084305443/'
          },
          {
            id: 'compact_digital',
            es: 'Cámaras Compactas',
            pt: 'Câmeras Compactas',
            url: 'https://auctions.yahoo.co.jp/category/list/2084261642/'
          }
        ]
      },
      {
        id: 'lens',
        es: 'Lentes',
        pt: 'Lentes',
        url: 'https://auctions.yahoo.co.jp/category/list/23684/'
      }
    ]
  },
  {
    id: 'instrumentos',
    es: 'Instrumentos Musicales',
    pt: 'Instrumentos Musicais',
    url: 'https://auctions.yahoo.co.jp/category/list/22436/',
    sub: [
      {
        id: 'guitarra',
        es: 'Guitarras',
        pt: 'Guitarras',
        url: 'https://auctions.yahoo.co.jp/category/list/22476/'
      },
      {
        id: 'bajo',
        es: 'Bajos',
        pt: 'Baixos',
        url: 'https://auctions.yahoo.co.jp/category/list/22480/'
      },
      {
        id: 'viento',
        es: 'Instrumentos de Viento',
        pt: 'Instrumentos de Sopro',
        url: 'https://auctions.yahoo.co.jp/category/list/22440/'
      },
      {
        id: 'dj',
        es: 'Equipos de DJ',
        pt: 'Equipamentos de DJ',
        url: 'https://auctions.yahoo.co.jp/category/list/2084261081/'
      }
    ]
  },
  {
    id: 'home_equipment',
    es: 'Equipamiento del Hogar',
    pt: 'Equipamentos Residenciais',
    url: 'https://auctions.yahoo.co.jp/category/list/24198/',
    sub: [
      {
        id: 'washlet',
        es: 'Bidet Electrónico (Washlet)',
        pt: 'Assento Sanitário Eletrônico (Washlet)',
        url: 'https://auctions.yahoo.co.jp/category/list/2084304456/'
      }
    ]
  }
];

// プロモーションスライダーバナーの定義（言語別 5スライド × 2言語 ＝ 計10枚）
const PROMO_BANNERS = [
  {
    id: 'b_jdm',
    imagePt: '/images/banners/banner_jdm_pt.jpg',
    imageEs: '/images/banners/banner_jdm_es.jpg',
    titlePt: 'Peças JDM Exclusivas',
    titleEs: 'Piezas JDM Exclusivas',
    subtitlePt: 'Rodas forjadas, freios Brembo e motores direto do Japão',
    subtitleEs: 'Ruedas forjadas, frenos Brembo y motores directo de Japón',
    targetCatId: 'autopartes'
  },
  {
    id: 'b_pesca',
    imagePt: '/images/banners/banner_fishing_pt.jpg',
    imageEs: '/images/banners/banner_fishing_es.jpg',
    titlePt: 'Equipamentos de Pesca',
    titleEs: 'Equipos de Pesca',
    subtitlePt: 'Molinetes Shimano Stella, Daiwa e varas de alta precisão',
    subtitleEs: 'Carretes Shimano Stella, Daiwa y cañas de alta precisión',
    targetCatId: 'pesca'
  },
  {
    id: 'b_instrumentos',
    imagePt: '/images/banners/banner_instruments_pt.jpg',
    imageEs: '/images/banners/banner_instruments_es.jpg',
    titlePt: 'Instrumentos Japoneses',
    titleEs: 'Instrumentos Japoneses',
    subtitlePt: 'Saxofones Yamaha, guitarras e áudio profissional',
    subtitleEs: 'Saxofones Yamaha, guitarras y audio profesional',
    targetCatId: 'instrumentos'
  },
  {
    id: 'b_figure',
    imagePt: '/images/banners/banner_figure_pt.jpg',
    imageEs: '/images/banners/banner_figure_es.jpg',
    titlePt: 'Figures & Colecionáveis',
    titleEs: 'Figuras de Anime',
    subtitlePt: 'Dragon Ball, One Piece, Gundam 100% originais do Japão',
    subtitleEs: 'Dragon Ball, One Piece, Gundam 100% originales de Japón',
    targetCatId: 'hobby'
  },
  {
    id: 'b_shipping',
    imagePt: '/images/banners/banner_shipping_pt.jpg',
    imageEs: '/images/banners/banner_shipping_es.jpg',
    titlePt: 'Envio Seguro Direto do Japão',
    titleEs: 'Envío Seguro Directo de Japón',
    subtitlePt: 'Embalagem reforçada, frete aéreo e marítimo com rastreamento total',
    subtitleEs: 'Embalaje reforzado, flete aéreo y marítimo con rastreo total'
    // ※安心配送はタップ遷移なし
  }
];

// カテゴリIDから親〜子までの階層配列を再帰的に取得するヘルパー関数
function findCategoryPath(cats: any[], targetId: string, currentPath: any[] = []): any[] | null {
  for (const cat of cats) {
    const newPath = [...currentPath, cat];
    if (cat.id === targetId) {
      return newPath;
    }
    if (cat.sub && Array.isArray(cat.sub)) {
      const found = findCategoryPath(cat.sub, targetId, newPath);
      if (found) return found;
    }
  }
  return null;
}

// 人気ブランド・クイックタグ定義
const QUICK_BRAND_TAGS = [
  { name: 'BBS', keyword: 'BBS', emoji: '🏎️', targetCatId: 'llantas' },
  { name: 'SHIMANO', keyword: 'SHIMANO', emoji: '🎣', targetCatId: 'pesca' },
  { name: 'YAMAHA', keyword: 'YAMAHA', emoji: '🎷', targetCatId: 'viento' },
  { name: 'G-SHOCK', keyword: 'G-SHOCK', emoji: '⌚', targetCatId: 'casio' },
  { name: 'GUNDAM', emoji: '🤖', targetCatId: 'gundam' },
  { name: 'POKEMON', keyword: 'Pokemon', emoji: '⚡' },
];

// カテゴリ・サブカテゴリのビジュアル情報（全白背景スタジオ画像・ロゴ・サブテキスト）
const CATEGORY_VISUALS: Record<string, { image: string; tagPt: string; tagEs: string }> = {
  // 1. 自動車
  vehiculo: { image: '/images/categories/vehiculo.jpg', tagPt: 'Carros, Motos & Bicicletas', tagEs: 'Carros, Motos & Bicicletas' },
  jdm: { image: '/images/categories/jdm.jpg', tagPt: 'Supra, RX-7, Skyline GT-R', tagEs: 'Supra, RX-7, Skyline GT-R' },
  supra: { image: '/images/categories/supra.jpg', tagPt: 'Supra JZA80 2JZ', tagEs: 'Supra JZA80 2JZ' },
  skyline: { image: '/images/categories/skyline.jpg', tagPt: 'Skyline GT-R R32/R33/R34', tagEs: 'Skyline GT-R R32/R33/R34' },
  lancer: { image: '/images/categories/lancer.jpg', tagPt: 'Lancer Evolution', tagEs: 'Lancer Evolution' },
  rx7: { image: '/images/categories/rx7.jpg', tagPt: 'RX-7 FD3S', tagEs: 'RX-7 FD3S' },
  silvia: { image: '/images/categories/silvia.jpg', tagPt: 'Silvia S13/S14/S15 SR20', tagEs: 'Silvia S13/S14/S15 SR20' },
  impreza: { image: '/images/categories/impreza.jpg', tagPt: 'Impreza WRX STI EJ20', tagEs: 'Impreza WRX STI EJ20' },
  desarme: { image: '/images/categories/desarme.jpg', tagPt: 'Veículos para Desmanche', tagEs: 'Vehículos para Desarme' },
  moto: { image: '/images/categories/moto.jpg', tagPt: 'Kawasaki, Honda, Yamaha', tagEs: 'Kawasaki, Honda, Yamaha' },
  bicicleta: { image: '/images/categories/bicicleta.jpg', tagPt: 'Shimano, Carbon Road Bikes', tagEs: 'Shimano, Bicicletas de Ruta' },

  // 2. 自動車パーツ
  autopartes: { image: '/images/categories/autopartes.jpg', tagPt: 'Rodas, Suspensão, Motores', tagEs: 'Ruedas, Suspensión, Motores' },
  motor: { image: '/images/categories/motor.jpg', tagPt: 'RB26, 2JZ, 13B, SR20', tagEs: 'RB26, 2JZ, 13B, SR20' },
  transmision: { image: '/images/categories/transmision.jpg', tagPt: 'Automatico, Manual, CVT', tagEs: 'Automatico, Manual, CVT' },
  llantas: { image: '/images/categories/llantas.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  ll16: { image: '/images/categories/ll16.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  ll17: { image: '/images/categories/ll17.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  ll18: { image: '/images/categories/ll18.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  aros: { image: '/images/categories/aros.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  ar16: { image: '/images/categories/ar16.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  ar17: { image: '/images/categories/ar17.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  ar18: { image: '/images/categories/ar18.jpg', tagPt: 'BBS, RAYS, WORK, ENKEI', tagEs: 'BBS, RAYS, WORK, ENKEI' },
  suspension: { image: '/images/categories/suspension.jpg', tagPt: 'TEIN, HKS, CUSCO', tagEs: 'TEIN, HKS, CUSCO' },
  asiento: { image: '/images/categories/asiento.jpg', tagPt: 'RECARO, BRIDE, STI', tagEs: 'RECARO, BRIDE, STI' },
  barras: { image: '/images/categories/barras.jpg', tagPt: 'TEIN, CUSCO, STI', tagEs: 'TEIN, CUSCO, STI' },
  freno: { image: '/images/categories/freno.jpg', tagPt: 'BREMBO. ENDLESS', tagEs: 'BREMBO. ENDLESS' },
  caraudio: { image: '/images/categories/caraudio.jpg', tagPt: 'PIONEER,CARROZZERIA, ALPINE', tagEs: 'PIONEER,CARROZZERIA, ALPINE' },
  reproductor: { image: '/images/categories/reproductor.jpg', tagPt: 'CD, Bluetooth, Radio', tagEs: 'CD, Bluetooth, Radio' },
  amplificador: { image: '/images/categories/amplificador.jpg', tagPt: 'CARROZZERIA, ONKYO', tagEs: 'CARROZZERIA, ONKYO' },
  subwoofer: { image: '/images/categories/subwoofer.jpg', tagPt: 'ALPINE, JVC', tagEs: 'ALPINE, JVC' },
  altavoz: { image: '/images/categories/altavoz.jpg', tagPt: 'BOSE, KENWOOD, PIONEER', tagEs: 'BOSE,  KENWOOD, PIONEER' },

  // 3. ファッション
  fashion: { image: '/images/categories/fashion.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  nike: { image: '/images/categories/nike.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  nike_men_shoes: { image: '/images/categories/nike_men_shoes.jpg', tagPt: 'Jordan, Dunk, Air Force1', tagEs: 'Jordan, Dunk, Air Force1' },
  nike_men_clothing: { image: '/images/categories/nike_men_clothing.jpg', tagPt: 'Camiseta, Short', tagEs: 'Camiseta, Short' },
  nike_women_shoes: { image: '/images/categories/nike_women_shoes.jpg', tagPt: 'Tênis Femininos', tagEs: 'Zapatillas Femininas' },
  nike_women_clothing: { image: '/images/categories/nike_women_clothing.jpg', tagPt: 'Blusa, Tops', tagEs: 'Blusa, Tops' },

  adidas: { image: '/images/categories/adidas.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  adidas_men_shoes: { image: '/images/categories/adidas_men_shoes.jpg', tagPt: 'Samba, Superstar', tagEs: 'Samba, Superstar' },
  adidas_men_clothing: { image: '/images/categories/adidas_men_clothing.jpg', tagPt: 'Camiseta, Short', tagEs: 'Camiseta, Short' },
  adidas_women_shoes: { image: '/images/categories/adidas_women_shoes.jpg', tagPt: 'Tênis Femininos', tagEs: 'Zapatillas Femininas' },
  adidas_women_clothing: { image: '/images/categories/adidas_women_clothing.jpg', tagPt: 'Blusa, Tops', tagEs: 'Blusa, Tops' },

  newbalance: { image: '/images/categories/newbalance.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  nb_men_shoes: { image: '/images/categories/nb_men_shoes.jpg', tagPt: 'Tênis Masculinos', tagEs: 'Zapatillas Masculinos' },
  nb_men_clothing: { image: '/images/categories/nb_men_clothing.jpg', tagPt: 'Camiseta, Short', tagEs: 'Camiseta, Short' },
  nb_women_shoes: { image: '/images/categories/nb_women_shoes.jpg', tagPt: 'Tênis Femininos', tagEs: 'Zapatillas Femininas' },
  nb_women_clothing: { image: '/images/categories/nb_women_clothing.jpg', tagPt: 'Blusa, Tops', tagEs: 'Blusa, Tops' },

  ape: { image: '/images/categories/ape.jpg', tagPt: 'BAPE', tagEs: 'BAPE' },
  abercrombie: { image: '/images/categories/abercrombie.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  converse: { image: '/images/categories/converse.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  diesel: { image: '/images/categories/diesel.jpg', tagPt: 'Jeans, Camiseta', tagEs: 'Jeans, Camiseta' },
  gap: { image: '/images/categories/gap.jpg', tagPt: 'Básicos', tagEs: 'Básicos' },
  lacoste: { image: '/images/categories/lacoste.jpg', tagPt: 'Polos, Camisas', tagEs: 'Polos, Camisas' },
  michaelkors: { image: '/images/categories/michaelkors.jpg', tagPt: 'Bolsas, Acessórios', tagEs: 'Bolsos, Accesorios' },
  puma: { image: '/images/categories/puma.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  tommyhilfiger: { image: '/images/categories/tommyhilfiger.jpg', tagPt: 'Polos, Camisas, Bolsas', tagEs: 'Polos, Camisas, Bolsas' },
  uniqlo: { image: '/images/categories/uniqlo.jpg', tagPt: 'UNIQLO Japão LifeWear', tagEs: 'UNIQLO Japón LifeWear' },
  vans: { image: '/images/categories/vans.jpg', tagPt: 'Old School & Skate', tagEs: 'Old School & Skate' },
  zara: { image: '/images/categories/zara.jpg', tagPt: 'Coleções Exclusivas', tagEs: 'Colecciones Exclusivas' },

  // 4. 時計
  relojes: { image: '/images/categories/relojes.jpg', tagPt: 'CASIO, SEIKO, CITIZEN', tagEs: 'CASIO, SEIKO, CITIZEN' },
  casio: { image: '/images/categories/casio.jpg', tagPt: 'G-SHOCK, BABY-G, EDIFICE', tagEs: 'G-SHOCK, BABY-G, EDIFICE' },
  seiko: { image: '/images/categories/seiko.jpg', tagPt: 'GRAND SEIKO, PROSPEX', tagEs: 'GRAND SEIKO, PROSPEX' },
  citizen: { image: '/images/categories/citizen.jpg', tagPt: 'PROMASTER, SEVENSTAR', tagEs: 'PROMASTER, SEVENSTAR' },

  // 5. スポーツ
  deportes: { image: '/images/categories/deportes.jpg', tagPt: 'Bola, Running, Camping, Pesca', tagEs: 'Balón, Running, Camping, Pesca' },
  futbol: { image: '/images/categories/futbol.jpg', tagPt: 'Bolas, Chuteiras, Society', tagEs: 'Balon, Botines, Society' },
  zapatos_futbol: { image: '/images/categories/zapatos_futbol.jpg', tagPt: 'Campo, Futsal, Society', tagEs: 'Campo, Futsal, Society' },
  spikes: { image: '/images/categories/spikes.jpg', tagPt: 'NIKE, ADIDAS, PUMA', tagEs: 'NIKE, ADIDAS, PUMA' },
  training: { image: '/images/categories/training.jpg', tagPt: 'NIKE, ADIDAS, PUMA', tagEs: 'NIKE, ADIDAS, PUMA' },
  futsal: { image: '/images/categories/futsal.jpg', tagPt: 'NIKE, ADIDAS, PUMA', tagEs: 'NIKE, ADIDAS, PUMA' },
  running: { image: '/images/categories/running.jpg', tagPt: 'Tênis, Camiseta, Short', tagEs: 'Zapatillas, Camiseta, Short' },
  running_men_shoes: { image: '/images/categories/running_men_shoes.jpg', tagPt: 'NIKE, ADIDAS, PUMA, NB', tagEs: 'NIKE, ADIDAS, PUMA, NB' },
  running_men_clothing: { image: '/images/categories/running_men_clothing.jpg', tagPt: 'Regatas, Shorts', tagEs: 'Camisetas, Shorts' },
  running_women_shoes: { image: '/images/categories/running_women_shoes.jpg', tagPt: 'Tênis Femininos', tagEs: 'Zapatillas Femininas' },
  running_women_clothing: { image: '/images/categories/running_women_clothing.jpg', tagPt: 'Top, Shorts', tagEs: 'Top y Shorts' },
  camping: { image: '/images/categories/camping.jpg', tagPt: 'Barracas, Cadeiras', tagEs: 'Carpas, Sillas' },
  pesca: { image: '/images/categories/pesca.jpg', tagPt: 'Varas, Molinetes', tagEs: 'Cañas, Carretes' },

  // 6. ホビー
  hobby: { image: '/images/categories/hobby.jpg', tagPt: 'Figures, RC', tagEs: 'Figures, RC' },
  rccar: { image: '/images/categories/rccar.jpg', tagPt: 'TAMIYA, KYOSHO', tagEs: 'TAMIYA, KYOSHO' },
  rc_engine: { image: '/images/categories/rc_engine.jpg', tagPt: 'TAMIYA, KYOSHO', tagEs: 'TAMIYA, KYOSHO' },
  rc_electric: { image: '/images/categories/rc_electric.jpg', tagPt: 'TAMIYA, KYOSHO', tagEs: 'TAMIYA, KYOSHO' },
  figure: { image: '/images/categories/figure.jpg', tagPt: 'Dragon Ball, One Piece', tagEs: 'Dragon Ball, One Piece' },
  gundam: { image: '/images/categories/gundam.jpg', tagPt: 'Gunpla Master Grade', tagEs: 'Gunpla Master Grade' },
  onepiece: { image: '/images/categories/onepiece.jpg', tagPt: 'Luffy, Zoro', tagEs: 'Luffy, Zoro' },
  miku: { image: '/images/categories/miku.jpg', tagPt: 'Miku Vocaloid', tagEs: 'Miku Vocaloid' },
  madoka: { image: '/images/categories/madoka.jpg', tagPt: 'Madoka Magica', tagEs: 'Madoka Magica' },
  dragonball: { image: '/images/categories/dragonball.jpg', tagPt: 'Goku, Vegeta', tagEs: 'Goku, Vegeta' },
  nendoroid: { image: '/images/categories/nendoroid.jpg', tagPt: 'Good Smile Chibi', tagEs: 'Good Smile Chibi' },

  // 7. 電子機器
  electronics: { image: '/images/categories/electronics.jpg', tagPt: 'iPhone, iPad, Apple Watch', tagEs: 'iPhone, iPad, Apple Watch' },
  iphone: { image: '/images/categories/iphone.jpg', tagPt: 'iPhone 17 Pro Max, 16', tagEs: 'iPhone 17 Pro Max, 16' },
  ipad: { image: '/images/categories/ipad.jpg', tagPt: 'iPad Pro, iPad Air, Mini', tagEs: 'iPad Pro, iPad Air, Mini' },
  smartwatch: { image: '/images/categories/smartwatch.jpg', tagPt: 'Ultra, Series 10', tagEs: 'Ultra, Series 10' },

  // 8. PC機器・パーツ
  pc_parts: { image: '/images/categories/pc_parts.jpg', tagPt: 'Gaming, GPU, CPU', tagEs: 'Gaming, GPU, CPU' },
  cpu: { image: '/images/categories/cpu.jpg', tagPt: 'Core i9, Ryzen 9', tagEs: 'Core i9, Ryzen 9' },
  memory: { image: '/images/categories/memory.jpg', tagPt: 'RAM DDR5 / DDR4', tagEs: 'RAM DDR5 / DDR4' },
  gpu: { image: '/images/categories/gpu.jpg', tagPt: 'GeForce RTX 4090, 4080', tagEs: 'GeForce RTX 4090, 4080' },

  // 9. カメラ
  camera: { image: '/images/categories/camera.jpg', tagPt: 'CANON, NIKON, SONY', tagEs: 'CANON, NIKON, SONY' },
  digital_camera: { image: '/images/categories/digital_camera.jpg', tagPt: 'CANON, NIKON, SONY', tagEs: 'CANON, NIKON, SONY' },
  dslr: { image: '/images/categories/dslr.jpg', tagPt: 'CANON, NIKON, SONY', tagEs: 'CANON, NIKON, SONY' },
  mirrorless: { image: '/images/categories/mirrorless.jpg', tagPt: 'OLYMPUS, SONY', tagEs: 'OLYMPUS, SONY' },
  compact_digital: { image: '/images/categories/compact_digital.jpg', tagPt: 'NIKON, SONY', tagEs: 'NIKON, SONY' },
  lens: { image: '/images/categories/lens.jpg', tagPt: 'CANON, NIKON, SONY', tagEs: 'CANON, NIKON, SONY' },

  // 10. 楽器
  instrumentos: { image: '/images/categories/instrumentos.jpg', tagPt: 'Guitarra, Sopro, DJ', tagEs: 'Guitarra, Viento, DJ' },
  guitarra: { image: '/images/categories/guitarra.jpg', tagPt: 'FENDER, GIBSON', tagEs: 'FENDER, GIBSON' },
  bajo: { image: '/images/categories/bajo.jpg', tagPt: 'FENDER, GIBSON', tagEs: 'FENDER, GIBSON' },
  viento: { image: '/images/categories/viento.jpg', tagPt: 'YAMAHA,BACH', tagEs: 'YAMAHA,BACH' },
  dj: { image: '/images/categories/dj.jpg', tagPt: 'PIONEER', tagEs: 'PIONEER' },

  // 11. 家財道具
  home_equipment: { image: '/images/categories/home_equipment.jpg', tagPt: 'Washlet', tagEs: 'Washlet' },
  washlet: { image: '/images/categories/washlet.jpg', tagPt: 'TOTO', tagEs: 'TOTO' }
};

// URLのコンディションパラメータ(istatus)を更新するヘルパー関数
const updateUrlCondition = (url: string, condition: 'all' | 'new' | 'used'): string => {
  try {
    const urlObj = new URL(url);
    if (condition === 'new') {
      urlObj.searchParams.set('istatus', '1');
    } else if (condition === 'used') {
      urlObj.searchParams.set('istatus', '2');
    } else {
      urlObj.searchParams.delete('istatus');
    }
    // ページングパラメータ(b=1)をリセットして1ページ目に戻す
    if (urlObj.searchParams.has('b')) {
      urlObj.searchParams.set('b', '1');
    }
    return urlObj.toString();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    let target = url;
    target = target.replace(/([?&])istatus=[^&]*/g, '');
    target = target.replace(/([?&])b=[^&]*/g, '');
    target = target.replace(/&&+/g, '&').replace(/\?&/g, '?').replace(/[?&]$/g, '');
    
    const connector = target.includes('?') ? '&' : '?';
    if (condition === 'new') {
      target += `${connector}istatus=1&b=1`;
    } else if (condition === 'used') {
      target += `${connector}istatus=2&b=1`;
    } else {
      target += `${connector}b=1`;
    }
    return target;
  }
};

// URLから現在のコンディションを判定するヘルパー関数
const determineConditionFromUrl = (url: string): 'all' | 'new' | 'used' => {
  try {
    const urlObj = new URL(url);
    const istatus = urlObj.searchParams.get('istatus');
    if (istatus === '1') return 'new';
    if (istatus === '2') return 'used';
    return 'all';
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    if (url.includes('istatus=1')) return 'new';
    if (url.includes('istatus=2')) return 'used';
    return 'all';
  }
};

export default function Home() {
  const [lang, setLang] = useState<'es' | 'pt'>('es');
  const [deliveryCountry, setDeliveryCountry] = useState<string>('JP');
  const [deliveryCity, setDeliveryCity] = useState<string>('');
  const [shippingMethod, setShippingMethod] = useState<'sea' | 'air'>('sea');
  const [searchUrl, setSearchUrl] = useState('');
  const [products, setProducts] = useState<SearchItem[]>(() => {
    return getStoredNavState()?.products || [];
  });
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SearchItem | null>(null);
  const [featuredItems, setFeaturedItems] = useState<SearchItem[]>([]);
  const [isFeaturedLoading, setIsFeaturedLoading] = useState(false);
  const [isOfferUpdating, setIsOfferUpdating] = useState(false);
  const [bidForm, setBidForm] = useState({ name: '', maxBid: '' });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showSignUp, setShowSignUp] = useState(false);
  const [isEditOfferModalOpen, setIsEditOfferModalOpen] = useState(false);
  const [editingOfferRequest, setEditingOfferRequest] = useState<BidRequest | null>(null);
  const [editingOfferAmount, setEditingOfferAmount] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    fullName: '',
    whatsapp: '',
    address: '',
    addressNumber: '',
    complement: '',
    zipCode: '',
    country: '',
    agentCustomerId: '',
    cpf: '',
    state: '',
    city: ''
  });
  const [activeTab, setActiveTab] = useState<'search' | 'favorites' | 'requests' | 'purchased' | 'mypage' | 'deposits' | 'shipping'>(() => {
    return getStoredNavState()?.activeTab || 'search';
  });
  const [hasClosedDepositReminder, setHasClosedDepositReminder] = useState(false);
  const [showDepositReminder, setShowDepositReminder] = useState(false);

  // 入金履歴用
  const [depositsList, setDepositsList] = useState<any[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [depositFilterYear, setDepositFilterYear] = useState('all');
  const [depositFilterMonth, setDepositFilterMonth] = useState('all');

  // 支払い方法選択モーダル用
  const [selectedPaymentItem, setSelectedPaymentItem] = useState<BidRequest | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<any>(null);
  const [isLoadingPaymentSettings, setIsLoadingPaymentSettings] = useState(false);
  const [activePaymentMethod, setActivePaymentMethod] = useState<'bank' | 'paypal' | 'usdt'>('bank');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // B001傘下顧客 / ブラジルエージェント用の複数選択・一括決済ステート
  const [selectedBrlItemIds, setSelectedBrlItemIds] = useState<string[]>([]);
  const [showBrlBatchPaymentModal, setShowBrlBatchPaymentModal] = useState(false);
  const [showPdfViewerModal, setShowPdfViewerModal] = useState(false);
  const [brlPaymentMethod, setBrlPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [isProcessingBrlPayment, setIsProcessingBrlPayment] = useState(false);
  const [brlPaymentCpf, setBrlPaymentCpf] = useState('');
  const [brlPaymentError, setBrlPaymentError] = useState<string | null>(null);
  
  // PIX支払い完了時のQRコード表示用ステート
  const [pixPaymentResult, setPixPaymentResult] = useState<{
    qrCodeImage: string;
    qrCodeText: string;
    value: number;
    expirationDate: string;
  } | null>(null);

  const isBrlUser = !!(
    currentUser && (
      currentUser.agentCustomerId === 'B001' ||
      currentUser.customerId === 'B001' ||
      (currentUser.customerId?.startsWith('A') && 
        ((currentUser.country || '').trim().toLowerCase() === 'brasil' || (currentUser.country || '').trim().toLowerCase() === 'brazil'))
    )
  );

  const toggleBrlItemSelection = (id: string) => {
    setSelectedBrlItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // 全カテゴリ画像およびプロモーションバナー画像のバックグラウンド事前読み込み（プリロード）
  // サイトアクセス時およびログイン完了時に全画像をブラウザキャッシュに先読みし、タップ時・スライド時の表示遅延を0msにします
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const catImages = Object.values(CATEGORY_VISUALS).map(v => v.image);
        const bannerImages = PROMO_BANNERS.flatMap(b => [b.imagePt, b.imageEs]);
        const allImages = Array.from(new Set([...catImages, ...bannerImages]));
        allImages.forEach(url => {
          if (url) {
            const img = document.createElement('img');
            img.src = url;
          }
        });
      } catch (e) {
        console.warn('Images preloading error:', e);
      }
    }
  }, []);

  // モーダルを開くときに既存のCPFをセット
  useEffect(() => {
    if (showBrlBatchPaymentModal && currentUser?.cpf) {
      setBrlPaymentCpf(currentUser.cpf);
    } else if (showBrlBatchPaymentModal) {
      setBrlPaymentCpf('');
    }
    
    if (showBrlBatchPaymentModal) {
      setBrlPaymentError(null);
      setPixPaymentResult(null);
    }
  }, [showBrlBatchPaymentModal, currentUser?.cpf]);

  // ASAAS決済実行
  const handleProcessBrlPayment = async (totalAmount: number, items: any[]) => {
    if (!currentUser) return;
    
    // CPFチェック（未入力の場合はエラー）
    if (!currentUser.cpf && !brlPaymentCpf.trim()) {
      setBrlPaymentError(lang === 'es' ? 'Por favor, ingrese su CPF o CNPJ' : 'Por favor, informe seu CPF ou CNPJ');
      return;
    }

    setIsProcessingBrlPayment(true);
    setBrlPaymentError(null);

    try {
      // accessTokenの取得を追加
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      // 決済リクエスト
      const reqBody = {
        billingType: brlPaymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD',
        items: items.map(i => ({ id: i.id, amount: i.finalPrice || (i.customerCounterOffer && !i.customerCounterOfferUsed ? i.customerCounterOffer : (i.counterOffer || i.maxBid || 0)) })),
        totalAmount: totalAmount,
        cpfCnpj: brlPaymentCpf.trim() || undefined
      };

      const res = await fetch('/api/asaas-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': accessToken ? `Bearer ${accessToken}` : '' },
        body: JSON.stringify(reqBody)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Payment failed');
      }

      if (data.billingType === 'PIX') {
        if (data.pix) {
          // QRコード画面を表示
          setPixPaymentResult({
            qrCodeImage: data.pix.qrCodeImage,
            qrCodeText: data.pix.qrCodeText,
            value: data.value,
            expirationDate: data.pix.expirationDate
          });
        } else {
          throw new Error('PIX QR Code não retornado pela API');
        }
      } else if (data.billingType === 'CREDIT_CARD' && data.invoiceUrl) {
        // カード決済画面へリダイレクト (モバイルブラウザのポップアップブロックを回避するため現在のタブで遷移)
        window.location.href = data.invoiceUrl;
        return; // 遷移するので以降の処理はスキップ
      }

    } catch (err: any) {
      console.error('Payment error:', err);
      setBrlPaymentError(err.message || (lang === 'es' ? 'Error al procesar el pago' : 'Erro ao processar o pagamento'));
    } finally {
      setIsProcessingBrlPayment(false);
    }
  };

  // 支払い設定をAPIからフェッチする関数
  const fetchPaymentSettings = async () => {
    if (paymentSettings) return;
    setIsLoadingPaymentSettings(true);
    try {
      const res = await fetch('/api/payment-settings');
      if (res.ok) {
        const data = await res.json();
        setPaymentSettings(data);
      } else {
        console.error('Failed to fetch payment settings:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching payment settings:', err);
    } finally {
      setIsLoadingPaymentSettings(false);
    }
  };

  // 支払いモーダルを開く関数
  const openPaymentModal = (item: BidRequest) => {
    setSelectedPaymentItem(item);
    setShowPaymentModal(true);
    fetchPaymentSettings();
  };

  // テキストをクリップボードにコピーする関数
  const copyToClipboard = (text: string, label: string) => {
    copyToClipboardSafe(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };
  const [favorites, setFavorites] = useState<SearchItem[]>([]);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<'url' | 'keyword' | 'categories'>(() => {
    return getStoredNavState()?.searchType || 'categories';
  });
  const resultsRef = useRef<HTMLDivElement>(null);
  const [keyword, setKeyword] = useState<string>(() => {
    return getStoredNavState()?.keyword || '';
  });
  const [searchCondition, setSearchCondition] = useState<'all' | 'new' | 'used'>(() => {
    return getStoredNavState()?.searchCondition || 'all';
  });
  const [sortOrder, setSortOrder] = useState<'featured' | 'price_asc' | 'price_desc' | 'bids_desc' | 'new'>(() => {
    return getStoredNavState()?.sortOrder || 'featured';
  });
  const [isSearching, setIsSearching] = useState(false);
  const [categoryHistory, setCategoryHistory] = useState<Category[]>(() => {
    return getStoredNavState()?.categoryHistory || [];
  });
  const currentCategory = categoryHistory.length > 0 ? categoryHistory[categoryHistory.length - 1] : null;
  const [searchPage, setSearchPage] = useState<number>(() => {
    return getStoredNavState()?.searchPage || 1;
  });
  const [nextPageExists, setNextPageExists] = useState<boolean>(() => {
    return getStoredNavState()?.nextPageExists || false;
  });
  const [activeCategoryUrl, setActiveCategoryUrl] = useState<string | null>(() => {
    const s = getStoredNavState();
    return s?.activeCategoryUrl !== undefined ? s.activeCategoryUrl : null;
  });
  const [myRequests, setMyRequests] = useState<BidRequest[]>([]);
  const [processingOfferId, setProcessingOfferId] = useState<string | null>(null);
  const [isSubmittingEditOffer, setIsSubmittingEditOffer] = useState(false);
  const [isSubmittingCounter, setIsSubmittingCounter] = useState(false);
  const [purchasedItems, setPurchasedItems] = useState<BidRequest[]>([]);
  // マイページ用state
  const [profileForm, setProfileForm] = useState({ fullName: '', whatsapp: '', address: '', addressNumber: '', complement: '', zipCode: '', agentCustomerId: '', cpf: '', state: '', city: '', language: '' });
  
  // ブラジルの州別市名取得用ステート
  const [signUpCities, setSignUpCities] = useState<{ id: number; nome: string }[]>([]);
  const [signUpCitiesLoading, setSignUpCitiesLoading] = useState(false);
  const [myPageCities, setMyPageCities] = useState<{ id: number; nome: string }[]>([]);
  const [myPageCitiesLoading, setMyPageCitiesLoading] = useState(false);

  // 登録画面の州変更時に市名を取得
  useEffect(() => {
    if (loginForm.country === 'Brasil' && loginForm.state) {
      setSignUpCitiesLoading(true);
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${loginForm.state}/municipios`)
        .then(res => res.json())
        .then(data => {
          setSignUpCities(data || []);
          setSignUpCitiesLoading(false);
        })
        .catch(err => {
          console.error(err);
          setSignUpCitiesLoading(false);
        });
    } else {
      setSignUpCities([]);
    }
  }, [loginForm.state, loginForm.country]);

  // マイページの州変更時に市名を取得
  useEffect(() => {
    if ((currentUser?.country || '').trim().toLowerCase() === 'brasil' && profileForm.state) {
      setMyPageCitiesLoading(true);
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${profileForm.state}/municipios`)
        .then(res => res.json())
        .then(data => {
          setMyPageCities(data || []);
          setMyPageCitiesLoading(false);
        })
        .catch(err => {
          console.error(err);
          setMyPageCitiesLoading(false);
        });
    } else {
      setMyPageCities([]);
    }
  }, [profileForm.state, currentUser?.country]);

  // CEP自動補完処理（登録画面）
  const handleCepChange = async (cepVal: string) => {
    const cleanCep = cepVal.replace(/\D/g, '');
    setLoginForm(prev => ({ ...prev, zipCode: cepVal }));
    if (cleanCep.length === 8 && loginForm.country === 'Brasil') {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setLoginForm(prev => ({
            ...prev,
            state: data.uf,
            city: data.localidade,
            address: `${data.logradouro || ''}${data.logradouro && data.bairro ? ', ' : ''}${data.bairro || ''}`,
            complement: data.complemento || prev.complement || ''
          }));
        }
      } catch (e) {
        console.error('Error fetching ViaCEP:', e);
      }
    }
  };

  // CEP自動補完処理（マイページ）
  const handleMyPageCepChange = async (cepVal: string) => {
    const cleanCep = cepVal.replace(/\D/g, '');
    setProfileForm(prev => ({ ...prev, zipCode: cepVal }));
    if (cleanCep.length === 8 && (currentUser?.country || '').trim().toLowerCase() === 'brasil') {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setProfileForm(prev => ({
            ...prev,
            state: data.uf,
            city: data.localidade,
            address: `${data.logradouro || ''}${data.logradouro && data.bairro ? ', ' : ''}${data.bairro || ''}`,
            complement: data.complemento || prev.complement || ''
          }));
        }
      } catch (e) {
        console.error('Error fetching ViaCEP:', e);
      }
    }
  };
  
  // JDM車体およびその他カテゴリ検索ボックス用のキーワード状態
  const [jdmSearchKeyword, setJdmSearchKeyword] = useState('');
  const [categorySearchKeyword, setCategorySearchKeyword] = useState('');

  // ヤフオクURLからカテゴリIDを抽出するヘルパー
  const getYahooCategoryId = (url: string | null): string | null => {
    if (!url) return null;
    const auccatMatch = url.match(/[&?]auccat=([0-9]+)/);
    if (auccatMatch) return auccatMatch[1];
    const listMatch = url.match(/\/category\/list\/([0-9]+)/);
    if (listMatch) return listMatch[1];
    return null;
  };

  // カテゴリIDに基づいてCATEGORIESからカテゴリ名を取得するヘルパー
  const getCategoryNameById = (catId: string | null): string => {
    if (!catId) return '';
    const findCategory = (cats: Category[]): Category | null => {
      for (const cat of cats) {
        const currentId = getYahooCategoryId(cat.url || null);
        if (cat.id === catId || (currentId && currentId === catId)) {
          return cat;
        }
        if (cat.sub) {
          const found = findCategory(cat.sub);
          if (found) return found;
        }
      }
      return null;
    };
    const targetCat = findCategory(CATEGORIES);
    if (targetCat) {
      return lang === 'es' ? targetCat.es : targetCat.pt;
    }
    return '';
  };

  // カテゴリやアクティブURLが切り替わったときに入力値をクリア
  useEffect(() => {
    setJdmSearchKeyword('');
    const catId = getYahooCategoryId(activeCategoryUrl);
    if (!catId || catId === '26360' || catId === '2084061280') {
      setCategorySearchKeyword('');
    }
  }, [categoryHistory, activeCategoryUrl]);

  // 初回マウント時のスクロール位置復元
  const isInitialScrollRestored = useRef(false);
  useEffect(() => {
    if (!isInitialScrollRestored.current && typeof window !== 'undefined') {
      isInitialScrollRestored.current = true;
      const s = getStoredNavState();
      if (s && typeof s.scrollY === 'number' && s.scrollY > 0) {
        setTimeout(() => {
          window.scrollTo({ top: s.scrollY, behavior: 'instant' });
        }, 100);
      }
    }
  }, []);

  // 検索・ナビゲーション状態の自動セッション保存
  useEffect(() => {
    saveNavState({
      activeTab,
      searchType,
      categoryHistory,
      activeCategoryUrl,
      keyword,
      searchCondition,
      sortOrder,
      searchPage,
      nextPageExists,
      products
    });
  }, [activeTab, searchType, categoryHistory, activeCategoryUrl, keyword, searchCondition, sortOrder, searchPage, nextPageExists, products]);

  // キャッシュ済みのメタデータから確実に入力欄を初期復元する
  useEffect(() => {
    if (currentUser) {
      if (typeof window !== 'undefined') {
        const savedUserCurrency = localStorage.getItem('jogalibre_user_selected_currency');
        // 手動選択の履歴がない場合、B001傘下顧客またはブラジルエージェントならデフォルトBRLにする
        if (!savedUserCurrency && isBrlDefaultUser(currentUser)) {
          setSelectedCurrency('BRL');
        }
      }
      setProfileForm(prev => {
        if (!prev.fullName && currentUser.fullName) prev.fullName = currentUser.fullName;
        if (!prev.whatsapp && currentUser.whatsapp) prev.whatsapp = currentUser.whatsapp;
        if (!prev.address && currentUser.address) prev.address = currentUser.address;
        if (!prev.zipCode && currentUser.zipCode) prev.zipCode = currentUser.zipCode;
        if (!prev.agentCustomerId && currentUser.agentCustomerId) prev.agentCustomerId = currentUser.agentCustomerId;
        if (!prev.cpf && currentUser.cpf) prev.cpf = currentUser.cpf;
        if (!prev.state && currentUser.state) prev.state = currentUser.state;
        if (!prev.city && currentUser.city) prev.city = currentUser.city;
        return { ...prev };
      });
    }
  }, [currentUser]);

  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'loading' | 'enabled' | 'disabled' | 'unsupported'>('loading');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [purchasedYear, setPurchasedYear] = useState<string>('all');
  const [purchasedMonth, setPurchasedMonth] = useState<string>('all');
  const [shippingStatusFilter, setShippingStatusFilter] = useState<string>('all');
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  // 為替レート関連のState（ローカルキャッシュから同期復元して初期表示の150.00チラつきを防止）
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('jogalibre_usd_to_jpy_rate') || localStorage.getItem('joga_usd_to_jpy_rate');
        if (cached && !isNaN(Number(cached))) {
          return Number(cached);
        }
      } catch {}
    }
    return 150;
  });
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedUserCurrency = localStorage.getItem('jogalibre_user_selected_currency');
      if (savedUserCurrency) return savedUserCurrency;
      try {
        const cachedUserRaw = localStorage.getItem('jogalibre_user_cache') || localStorage.getItem('joga_user_cache');
        if (cachedUserRaw) {
          const cachedUser = JSON.parse(cachedUserRaw);
          if (isBrlDefaultUser(cachedUser)) {
            return 'BRL';
          }
        }
      } catch {}
    }
    return 'USD';
  });
  const [exchangeRates, setExchangeRates] = useState<{ [key: string]: number }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('jogalibre_exchange_rates') || localStorage.getItem('joga_exchange_rates');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      } catch {}
    }
    return {
      JPY: 150,
      BRL: 5.6,
      PYG: 7500,
      CLP: 930,
      BOB: 6.9,
      ARS: 935,
    };
  });
  const [showCounterModal, setShowCounterModal] = useState(false);  // ← 追加
  const [selectedRequestForCounter, setSelectedRequestForCounter] = useState<BidRequest | null>(null);  // ← 追加
  const [customerCounterAmount, setCustomerCounterAmount] = useState('');  // ← 追加
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const [termsChecked, setTermsChecked] = useState({
    item1: false,
    item2: false,
    item3: false,
    item4: false,
    item5: false,
    item6: false
  });

  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [bannerTouchStartX, setBannerTouchStartX] = useState<number | null>(null);

  const t = translations[lang];

  // プロモーションバナーの自動スライド（5秒ごと）
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBannerIndex(prev => (prev + 1) % PROMO_BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // 全ボタンに触覚フィードバック（振動）を適用
  useEffect(() => {
    const handleButtonClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') && navigator.vibrate) {
        navigator.vibrate(10);
      }
    };
    document.addEventListener('click', handleButtonClick, true);
    return () => document.removeEventListener('click', handleButtonClick, true);
  }, []);

  useEffect(() => {
    fetchExchangeRate();
  }, []);

  useEffect(() => {
    fetchFeaturedItems(lang);
  }, [lang]);

  useEffect(() => {
    // 初回セッション復元
    getCurrentUser().then(user => {
      if (user?.role === 'customer' || user?.role === 'agent') {
        setCurrentUser(user);
        if (user.language === 'es' || user.language === 'pt') {
          setLang(user.language);
          localStorage.setItem('lang', user.language);
        }
      }
    }).catch(err => {
      console.error('Fast failure in initial getCurrentUser:', err);
    }).finally(() => {
      setIsAuthChecking(false);
    });

    // セッション変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setMyRequests([]);
        setPurchasedItems([]);
        setFavorites([]);
        setDepositsList([]);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('jogalibre_user_cache');
          localStorage.removeItem('jogalibre_terms_accepted');
          localStorage.removeItem('joga_user_cache');
          localStorage.removeItem('joga_terms_accepted');
        }
      } else if (session?.user) {
        // SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED 等でセッション復元
        if (event === 'SIGNED_IN') {
          // ログイン直後はSupabaseクライアントへのトークン伝播に遅延があるため、500ms待ってからDB（user_roles）を取得する
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const user = await getCurrentUser(session.user);
        if (user?.role === 'customer' || user?.role === 'agent') {
          setCurrentUser(prev => {
             // すでにIDを持っている場合、新しく取得したデータが古い場合（タイムアウト等）は既存のIDを維持する
             if (prev && prev.id === user.id) {
               return {
                 ...prev,
                 ...user,
                 customerId: user.customerId || prev.customerId,
                 fullName: user.fullName || prev.fullName,
                 whatsapp: user.whatsapp || prev.whatsapp
               };
             }
             return user;
          });
          if (user.language === 'es' || user.language === 'pt') {
            setLang(user.language);
            localStorage.setItem('lang', user.language);
          }
        }
      }
      setIsAuthChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 通知状態チェック＆自動再登録（セッション復元時にも確実に実行されるようcurrentUserを監視）
  useEffect(() => {
    if (currentUser) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          // ブラウザ許可済みの場合は即座に通知有効状態を保持
          setNotificationStatus('enabled');
          (async () => {
            try {
              const sub = await requestNotificationPermission();
              if (sub) {
                await fetch('/api/push-subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: currentUser.id, subscription: sub }),
                });
              }
            } catch (err) {
              console.warn('Background push sync error:', err);
              // permission === 'granted' の間は表示を disabled に落とさない
            }
          })();
        } else if (Notification.permission === 'denied') {
          setNotificationStatus('disabled');
        } else {
          setNotificationStatus('disabled');
        }
      } else {
        setNotificationStatus('unsupported');
      }
    }
  }, [currentUser]);

  useEffect(() => {
    // 早期キャッシュ復元 (getCurrentUser完了までのちらつき防止)
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('jogalibre_user_cache') || localStorage.getItem('joga_user_cache');
      if (cached && !currentUser) {
        try {
          const cacheData = JSON.parse(cached);
          if (cacheData && cacheData.id && typeof cacheData === 'object') {
            // 仮のユーザー情報としてセット（後でgetCurrentUserによって上書きされる）
            setCurrentUser(prev => prev ? prev : {
              id: cacheData.id,
              email: cacheData.email || '',
              role: cacheData.role || 'customer',
              fullName: cacheData.fullName,
              whatsapp: cacheData.whatsapp,
              customerId: cacheData.customerId,
              address: cacheData.address,
              zipCode: cacheData.zipCode,
              country: cacheData.country || '',
              agentCustomerId: cacheData.agentCustomerId,
              agentFullName: cacheData.agentFullName,
              depositAmount: cacheData.depositAmount,
              depositConfirmedAt: cacheData.depositConfirmedAt,
              termsAcceptedAt: cacheData.termsAcceptedAt,
              cpf: cacheData.cpf,
              state: cacheData.state,
              city: cacheData.city,
              language: cacheData.language
            } as any);
          }
        } catch {
          // キャッシュが壊れている場合は安全に削除
          localStorage.removeItem('jogalibre_user_cache');
          localStorage.removeItem('joga_user_cache');
        }
      }
    }

    if (currentUser) {
      fetchUnreadCount();
      // セッション確立後にプロフィールを取得
      fetchUserProfile();

      // ログイン直後に各タブのデータをバックグラウンドで並列事前取得（プリフェッチ）
      if (currentUser.email) {
        Promise.allSettled([
          fetchMyRequests(currentUser.email),
          fetchPurchasedItems(currentUser.email),
          fetchFavorites(),
          fetchDeposits(),
        ]).catch(err => console.warn('Background prefetch error:', err));
      }

      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    } else {
      setIsProfileLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 詳細画面からの戻りやタブフォーカス時に即時オファー状態を同期・再検証＆モーダルクローズ
  useEffect(() => {
    const handleRevalidate = () => {
      setSelectedProduct(null);
      if (currentUser?.email) {
        fetchMyRequests(currentUser.email);
      }
    };
    window.addEventListener('pageshow', handleRevalidate);
    window.addEventListener('focus', handleRevalidate);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRevalidate();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', handleRevalidate);
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [currentUser?.email]);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.termsAcceptedAt !== null && currentUser.termsAcceptedAt !== undefined) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('jogalibre_terms_accepted', 'true');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.termsAcceptedAt]);

  useEffect(() => {
    if (currentUser && isProfileLoaded) {
      const hasAcceptedLocal = typeof localStorage !== 'undefined' && (
        localStorage.getItem('jogalibre_terms_accepted') === 'true' ||
        localStorage.getItem('joga_terms_accepted') === 'true'
      );
      const hasAcceptedDb = currentUser.termsAcceptedAt !== null && currentUser.termsAcceptedAt !== undefined;
      const isAdmin = currentUser.role === 'admin';

      if (hasAcceptedDb || hasAcceptedLocal || isAdmin) {
        setShowTermsModal(false);
      } else {
        setShowTermsModal(true);
      }
    } else {
      setShowTermsModal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.termsAcceptedAt, currentUser?.id, currentUser?.role, isProfileLoaded]);

  useEffect(() => {
    if (currentUser && isProfileLoaded) {
      const hasAcceptedTerms = currentUser.termsAcceptedAt !== null && currentUser.termsAcceptedAt !== undefined;
      const isDepositPending = !currentUser.depositConfirmedAt;
      
      if (hasAcceptedTerms && isDepositPending && !hasClosedDepositReminder) {
        setShowDepositReminder(true);
      } else {
        setShowDepositReminder(false);
      }
    } else {
      setShowDepositReminder(false);
      setHasClosedDepositReminder(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.termsAcceptedAt, currentUser?.depositConfirmedAt, isProfileLoaded, hasClosedDepositReminder]);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from('app_notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotifications(data || []);

      // 開いたときに既読にする
      if (data && data.some(n => !n.is_read)) {
        await supabase
          .from('app_notifications')
          .update({ is_read: true })
          .eq('user_id', currentUser.id)
          .eq('is_read', false);
        fetchUnreadCount();
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  };

  const fetchUnreadCount = async () => {
    if (!currentUser) return;
    try {
      const { count, error } = await supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (e) {
      console.error('Error fetching unread count:', e);
    }
  };

  const clearAllNotifications = async () => {
    if (!currentUser) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ userId: currentUser.id })
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {
      console.error('Error clearing notifications:', e);
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  // PWA (ホーム画面追加時) 向けのカスタム Pull-to-Refresh 実装
  useEffect(() => {
    let startY = 0;
    let isPulling = false;
    let isAtTop = true;

    const handleTouchStart = (e: TouchEvent) => {
      // 画面一番上にいるかどうかの判定 (多少の誤差を許容)
      isAtTop = window.scrollY <= 5;
      if (isAtTop) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || !isAtTop) return;
      const currentY = e.touches[0].clientY;
      const pullDistance = currentY - startY;

      // 下に約100px以上引っ張った場合、UI表示用フラグを立てる（必要であれば）
      if (pullDistance > 100) {
        setIsRefreshing(true);
      } else {
        setIsRefreshing(false);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isPulling || !isAtTop) return;
      const endY = e.changedTouches[0].clientY;
      const pullDistance = endY - startY;

      // 120px以上下に引っ張って離されたらデータを再ロードする
      if (pullDistance > 120 && isAtTop) {
        setIsRefreshing(true);
        // UIにスピナーを表示する時間を確保するため少し待ってからデータフェッチ
        setTimeout(async () => {
          try {
            if (activeTab === 'search') {
              if (searchType === 'keyword' && keyword) {
                await handleKeywordSearch(undefined, 1);
              } else if (searchType === 'categories') {
                if (activeCategoryUrl) {
                  await fetchCategoryItems(activeCategoryUrl, 1);
                }
              }
            } else if (activeTab === 'favorites') {
              await fetchFavorites();
            } else if (activeTab === 'requests') {
              await fetchMyRequests();
            } else if (activeTab === 'purchased') {
              await fetchPurchasedItems();
            } else if (activeTab === 'deposits') {
              await fetchDeposits();
              await fetchPurchasedItems();
            }
          } catch (e) {
            console.error('Refresh error:', e);
          } finally {
            setIsRefreshing(false);
          }
        }, 500);
      } else {
        setIsRefreshing(false);
      }

      isPulling = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchType, keyword, activeCategoryUrl, currentUser]);

  // 日本語タイトルを選択言語に翻訳するヘルパー
  // 日本語タイトルを選択言語に翻訳するヘルパー
  const translateSingleTitle = async (title: string, targetLang: string): Promise<string> => {
    if (!title || targetLang === 'ja') return title;
    try {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${targetLang}&dt=t`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ q: title }).toString()
        }
      );
      const data = await res.json();
      const translated = data?.[0]?.map((x: string[]) => x[0]).join('') || title;
      return translated.trim();
    } catch (e) {
      console.error('Single title translation error:', e);
      return title;
    }
  };

  const translateTitles = async (titles: string[], targetLang: string): Promise<string[]> => {
    if (targetLang === 'ja' || titles.length === 0) return titles;
    try {
      const promises = titles.map(title => translateSingleTitle(title, targetLang));
      return await Promise.all(promises);
    } catch (e) {
      console.error('Title translation error:', e);
      return titles;
    }
  };

  const fetchExchangeRate = async () => {
    try {
      const res = await fetch('/api/exchange-rate', { cache: 'no-store' });
      const data = await res.json();
      if (data.usdToJpy) {
        setExchangeRate(data.usdToJpy);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('jogalibre_usd_to_jpy_rate', data.usdToJpy.toString());
          } catch {}
        }
      }
      if (data.rates) {
        setExchangeRates(data.rates);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('jogalibre_exchange_rates', JSON.stringify(data.rates));
          } catch {}
        }
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  };

  const fetchFeaturedItems = async (targetLang: string = lang) => {
    setIsFeaturedLoading(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/featured-items?lang=${targetLang}&count=12`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          setFeaturedItems(data.items);
        }
      }
    } catch (error) {
      console.error('Error fetching featured items:', error);
    } finally {
      setIsFeaturedLoading(false);
    }
  };


  // プロフィール取得（fetchMyRequestsと同じ実証済みパターン）
  const fetchUserProfile = async (retryCount = 0) => {
    if (!currentUser) return;
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
          // アカウントに登録されている言語を優先適用
          if (profile.language === 'es' || profile.language === 'pt') {
            const currentLang = localStorage.getItem('lang');
            if (currentLang !== profile.language) {
              setLang(profile.language);
              localStorage.setItem('lang', profile.language);
            }
          } else if (profile.agent_customer_id === 'B001' || (profile.country || '').trim().toLowerCase() === 'brasil') {
            // B001紐づき顧客、またはブラジル国籍の顧客はデフォルトでポルトガル語(pt)を設定
            const currentLang = localStorage.getItem('lang');
            if (currentLang !== 'pt') {
              setLang('pt');
              localStorage.setItem('lang', 'pt');
            }
          }
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
              language: profile.language || undefined,
            } : prev;
            return nextUser;
          });

          // ブラジル住所のパース（カンマ区切りの場合は Rua, Número, Complemento に分解）
          const isBrasil = (profile.country || '').trim().toLowerCase() === 'brasil';
          let parsedAddress = profile.address || '';
          let parsedNumber = '';
          let parsedComplement = '';

          if (isBrasil && profile.address && profile.address.includes(',')) {
            const parts = profile.address.split(',').map((s: string) => s.trim());
            if (parts.length >= 2) {
              parsedAddress = parts[0] || '';
              parsedNumber = parts[1] || '';
              parsedComplement = parts.slice(2).join(', ') || '';
            }
          }

          const newForm = {
            fullName: profile.full_name || '',
            whatsapp: profile.whatsapp || '',
            address: parsedAddress,
            addressNumber: parsedNumber,
            complement: parsedComplement,
            zipCode: profile.zip_code || '',
            agentCustomerId: profile.agent_customer_id || '',
            cpf: profile.cpf || '',
            state: profile.state || '',
            city: profile.city || '',
            language: profile.language || 'es'
          };
          setProfileForm(newForm);
        } else {
          console.warn('Profile API returned null or undefined profile object');
        }
      } else if (res.status === 401) {
        if (retryCount < 2) {
          // ログイン直後のアクセストークン反映タイムラグ対策として、800ms待ってからリトライする
          await new Promise(resolve => setTimeout(resolve, 800));
          fetchUserProfile(retryCount + 1);
        } else {
          console.warn('Profile API returned 401 after retries, signing out due to expired session');
          handleLogout();
        }
      } else {
        const errText = await res.text();
        console.error('Profile API HTTP status NOT OK:', res.status, errText);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setIsProfileLoaded(true);
    }
  };

  const handleAcceptTerms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsChecked.item1 || !termsChecked.item2 || !termsChecked.item3 || !termsChecked.item4 || !termsChecked.item5) {
      return;
    }

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/accept-terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });

      if (res.ok) {
        // ローカルステートとキャッシュを更新
        setCurrentUser(prev => {
          if (!prev) return null;
          const updated = {
            ...prev,
            termsAcceptedAt: new Date().toISOString(),
            depositAmount: prev.role === 'agent' ? 500 : 100
          };
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('jogalibre_user_cache', JSON.stringify(updated));
            localStorage.setItem('jogalibre_terms_accepted', 'true');
          }
          return updated;
        });
        setShowTermsModal(false);
      } else {
        if (res.status === 401) {
          alert(lang === 'es' ? 'La sesión ha expirado. Por favor, inicie sesión de nuevo.' : 'A sessão expirou. Por favor, faça login novamente.');
          handleLogout();
        } else {
          alert(lang === 'es' ? 'Error al aceptar los términos' : 'Erro ao aceitar os termos');
        }
      }
    } catch (error) {
      console.error('Error accepting terms:', error);
      alert(lang === 'es' ? 'Error de comunicação' : 'Erro de comunicação');
    }
  };


  const fetchPurchasedItems = async (overrideEmail?: string) => {
    try {
      const email = overrideEmail || currentUser?.email;
      if (!email) return;

      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?email=${encodeURIComponent(email)}&purchased=true`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      // スネークケースからキャメルケースに変換
      const convertedItems = (data.purchasedItems || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        productTitle: item.product_title as string,
        productTitleEs: item.product_title_es as string | null,
        productTitlePt: item.product_title_pt as string | null,
        productImage: item.product_image as string,
        productUrl: item.product_url as string,
        finalPrice: item.final_price as number,
        customerEmail: item.customer_email as string,
        customerName: item.customer_name,
        customerFullName: item.customer_full_name,
        customerWhatsapp: item.customer_whatsapp,
        language: item.language,
        confirmedAt: item.customer_confirmed_at || item.created_at,  // 顧客が確認ボタンを押した日時
        paidAt: item.paid_at,
        customerCounterOffer: item.customer_counter_offer,
        customerCounterOfferUsed: item.customer_counter_offer_used,
        paid: item.paid || false,
        paid_brazil: item.paid_brazil || false,
        paid_brazil_at: item.paid_brazil_at as string | null | undefined,
        paid_paraguay: item.paid_paraguay || false,
        paid_paraguay_at: item.paid_paraguay_at as string | null | undefined,
        paid_japan: item.paid_japan || false,
        paid_japan_at: item.paid_japan_at as string | null | undefined,
        shippingCostJpy: item.shipping_cost_jpy,
        stockNumber: item.stock_number as string,
        invoiceNumber: item.invoice_number as string,
        productId: item.product_id as string,
        agentCustomerId: item.agent_customer_id as string | null | undefined,
        customerCountry: item.customer_country as string | null | undefined,
        delivery_location: item.delivery_location as string | undefined,
        shipping_method: item.shipping_method as string | undefined,
        paid_local: item.paid_local || false,
        paid_local_at: item.paid_local_at as string | null | undefined,
        local_cost: item.local_cost != null ? Number(item.local_cost) : null,
        cancelledAt: item.cancelledAt as string | null | undefined,
        shippingStatus: item.shipping_status as string | undefined,
        shippedAt: item.shipped_at as string | null | undefined,
        carrier: item.carrier as string | null | undefined,
        trackingNumber: item.tracking_number as string | null | undefined,
        trackingUrl: item.tracking_url as string | null | undefined,
        estimatedArrivalDate: item.estimated_arrival_date as string | null | undefined
      }));

      // DBの翻訳結果を優先し、無い場合のみ翻訳APIを叩く
      const itemsWithTranslation = await Promise.all(convertedItems.map(async (item: any) => {
        let title = item.productTitle || '';
        if (lang === 'es') {
          if (item.productTitleEs) title = item.productTitleEs;
          else if (title) title = await translateSingleTitle(title, lang);
        } else if (lang === 'pt' || lang === 'pt-BR') {
          if (item.productTitlePt) title = item.productTitlePt;
          else if (title) title = await translateSingleTitle(title, lang);
        }
        return { ...item, productTitle: title };
      }));

      setPurchasedItems(itemsWithTranslation);
    } catch (error) {
      console.error('Error fetching purchased items:', error);
    }
  };

  const fetchDeposits = async () => {
    if (!currentUser) return;
    setLoadingDeposits(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/deposits?t=${Date.now()}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Failed to fetch deposits');
      }

      const { deposits: data } = await res.json();
      setDepositsList(data || []);
    } catch (error) {
      console.error('Error fetching deposits:', error);
    } finally {
      setLoadingDeposits(false);
    }
  };

  const getFilteredDeposits = () => {
    let list = depositsList;
    if (depositFilterYear !== 'all') {
      list = list.filter(d => (d.deposit_date || '').startsWith(depositFilterYear));
    }
    if (depositFilterMonth !== 'all') {
      list = list.filter(d => {
        const parts = (d.deposit_date || '').split('-');
        if (parts.length < 2) return false;
        return Number(parts[1]).toString() === depositFilterMonth;
      });
    }
    return list;
  };

  const parseTimeLeftToMs = (timeLeftStr: string): number => {
    if (!timeLeftStr) return 0;
    // 大文字小文字の区別を避けるために小文字に変換し、空白を除去
    const cleanStr = timeLeftStr.toLowerCase().replace(/\s+/g, '');
    
    // d h m 形式のパース
    const dMatch = cleanStr.match(/(\d+)d/);
    const hMatch = cleanStr.match(/(\d+)h/);
    const mMatch = cleanStr.match(/(\d+)m/);
    
    let ms = 0;
    if (dMatch) ms += parseInt(dMatch[1], 10) * 24 * 3600 * 1000;
    if (hMatch) ms += parseInt(hMatch[1], 10) * 3600 * 1000;
    if (mMatch) ms += parseInt(mMatch[1], 10) * 60 * 1000;
    
    if (ms === 0) {
      // 日本語形式のパース (例: 3日, 12時間, 4分)
      const dayMatch = cleanStr.match(/(\d+)日/);
      const hourMatch = cleanStr.match(/(\d+)時間/);
      const minMatch = cleanStr.match(/(\d+)分/);
      if (dayMatch) ms += parseInt(dayMatch[1], 10) * 24 * 3600 * 1000;
      if (hourMatch) ms += parseInt(hourMatch[1], 10) * 3600 * 1000;
      if (minMatch) ms += parseInt(minMatch[1], 10) * 60 * 1000;
    }
    
    return ms;
  };

  const fetchFavorites = async () => {
    if (currentUser) {
      try {
        const { data: { session: clientSession } } = await supabase.auth.getSession();
        const accessToken = clientSession?.access_token;

        const res = await fetch(`/api/favorites?t=${Date.now()}`, {
          headers: {
            'Authorization': accessToken ? `Bearer ${accessToken}` : ''
          },
          credentials: 'include'
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('Failed to fetch favorites:', res.status, errText);
          throw new Error('Failed to fetch favorites');
        }
        const { favorites: data } = await res.json();

        // 商品タイトルを選択言語に翻訳
        const titles = (data || []).map((f: any) => f.product_title || '');
        const translatedTitles = await translateTitles(titles, lang);

        // format to match product structure
        const formattedFavorites = (data || []).map((f: Record<string, string | number | boolean>, i: number) => {
          let endTimeStr = f.end_time as string || '';
          
          // end_time カラムが null の場合（既存の古いデータ）、created_at と time_left から逆算する
          if (!endTimeStr && f.created_at && f.time_left) {
            const createdDate = parseDbDateTime(f.created_at as string);
            if (createdDate) {
              const createdTime = createdDate.getTime();
              const durationMs = parseTimeLeftToMs(f.time_left as string);
              if (durationMs > 0) {
                endTimeStr = new Date(createdTime + durationMs).toISOString();
              }
            }
          }

          return {
            id: f.product_id as string,
            title: translatedTitles[i] || f.product_title as string,
            titleJa: f.product_title as string,
            url: f.product_url as string,
            imageUrl: f.product_image as string,
            currentPrice: f.product_price as number,
            bids: f.bids as number,
            timeLeft: f.time_left as string,
            endTime: endTimeStr,
            isFavorite: true,
            dbId: f.id as string,
            createdAt: f.created_at as string
          };
        });

        // ソート処理（残り時間が短い順。申請タブと同一の並び順ルール）
        const sortedFavorites = formattedFavorites.sort((a: any, b: any) => {
          const now = Date.now();
          const timeA = a.endTime && !isNaN(new Date(a.endTime).getTime()) ? new Date(a.endTime).getTime() : Infinity;
          const timeB = b.endTime && !isNaN(new Date(b.endTime).getTime()) ? new Date(b.endTime).getTime() : Infinity;
          
          const isEndedA = timeA <= now;
          const isEndedB = timeB <= now;
          
          // 1. 終了済みを優先的に上に表示
          if (isEndedA && !isEndedB) return -1;
          if (!isEndedA && isEndedB) return 1;
          
          // 2. 両方が「終了済み」または「未終了」の場合、終了時間が早い順
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          
          // 3. 終了時間が同じ（または両方なし）の場合は作成日時順
          return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
        });

        setFavorites(sortedFavorites);
      } catch (error) {
        console.error('Error fetching favorites:', error);
      }
    }
  };

  const toggleFavorite = async (product: SearchItem, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!currentUser) {
      alert(lang === 'es' ? 'Por favor inicie sesión para agregar a favoritos' : 'Por favor faça login para adicionar aos favoritos');
      return;
    }

    setIsTogglingFavorite(product.id);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒でタイムアウト

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;
      const authHeaders: Record<string, string> = {
        'Authorization': accessToken ? `Bearer ${accessToken}` : ''
      };

      // お気に入り済みか確認（ローカルstate）
      const existingFav = favorites.find(f => f.id === product.id);

      if (existingFav) {
        // お気に入り削除
        const res = await fetch(`/api/favorites?id=${existingFav.dbId}&t=${Date.now()}`, {
          method: 'DELETE',
          headers: authHeaders,
          credentials: 'include',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text();
          console.error('Delete favorite failed:', res.status, errText);
          throw new Error('Delete failed');
        }

        // ローカルstate更新
        setFavorites(prev => prev.filter(f => f.id !== product.id));
      } else {
        // URLにカテゴリIDパラメータを動的に付加してお気に入りに保存する
        let favUrl = product.url || '';
        if (product.categoryId && !favUrl.includes('auccat=')) {
          favUrl += (favUrl.includes('?') ? '&' : '?') + 'auccat=' + product.categoryId;
        }
        if (currentCategory?.id && !favUrl.includes('jcat=')) {
          favUrl += (favUrl.includes('?') ? '&' : '?') + 'jcat=' + currentCategory.id;
        }

        // お気に入り追加
        const res = await fetch(`/api/favorites?t=${Date.now()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            productId: product.id,
            productTitle: product.titleJa || product.title || '',
            productUrl: favUrl,
            productImage: product.imageUrl || (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ''),
            productPrice: product.currentPrice || '',
            bids: product.bids || 0,
            timeLeft: product.timeLeft || '',
            endTime: product.endTime || ''
          })
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text();
          console.error('Add favorite failed:', res.status, errText);
          throw new Error('Add failed');
        }
        const { favorite: data } = await res.json();

        // ローカルstate更新
        setFavorites(prev => {
          const newList = [{
            id: data.product_id,
            title: product.titleJa || product.title || data.product_title,
            titleJa: product.titleJa || product.title,
            url: data.product_url,
            imageUrl: data.product_image,
            currentPrice: data.product_price,
            bids: data.bids,
            timeLeft: data.time_left,
            endTime: data.end_time || product.endTime || '',
            isFavorite: true,
            dbId: data.id,
            source: product.source,
            createdAt: data.created_at
          }, ...prev];
          
          return newList.sort((a: any, b: any) => {
            const now = Date.now();
            const timeA = a.endTime && !isNaN(new Date(a.endTime).getTime()) ? new Date(a.endTime).getTime() : Infinity;
            const timeB = b.endTime && !isNaN(new Date(b.endTime).getTime()) ? new Date(b.endTime).getTime() : Infinity;
            
            const isEndedA = timeA <= now;
            const isEndedB = timeB <= now;
            
            // 1. 終了済みを優先的に上に表示
            if (isEndedA && !isEndedB) return -1;
            if (!isEndedA && isEndedB) return 1;
            
            // 2. 両方が「終了済み」または「未終了」の場合、終了時間が早い順
            if (timeA !== timeB) {
              return timeA - timeB;
            }
            
            // 3. 終了時間が同じ（または両方なし）の場合は作成日時順
            return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
          });
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error toggling favorite:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        alert(lang === 'es' ? 'La solicitud tardó demasiado. Por favor, inténtelo de nuevo.' : 'A solicitação demorou muito. Por favor, tente novamente.');
      } else {
        alert(lang === 'es' ? 'Error al actualizar favoritos' : 'Erro ao atualizar favoritos');
      }
    } finally {
      setIsTogglingFavorite(null);
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



  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getCustomerTotal = (customerName: string) => {
    return purchasedItems
      .filter(item => item.customerName === customerName)
      .reduce((sum, item) => sum + (item.finalPrice || 0), 0);
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string) || loginForm.email;
    const password = (formData.get('password') as string) || loginForm.password;

    try {
      await signIn(email, password);
      // onAuthStateChange が SIGNED_IN イベントで自動的にユーザーを設定する
      setLoginForm({ email: '', password: '', fullName: '', whatsapp: '', address: '', addressNumber: '', complement: '', zipCode: '', country: '', agentCustomerId: '', cpf: '', state: '', city: '' });
    } catch (error) {
      console.error('Login error:', error);
      alert(lang === 'es'
        ? 'Error al iniciar sesión. Verifica tu email y contraseña.'
        : 'Erro ao fazer login. Verifique seu email e senha.');
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string) || loginForm.email;
    const password = (formData.get('password') as string) || loginForm.password;
    const fullName = (formData.get('fullName') as string) || loginForm.fullName;
    const whatsapp = (formData.get('whatsapp') as string) || loginForm.whatsapp;
    const rawAddress = (formData.get('address') as string) || loginForm.address;
    const addressNumber = (formData.get('addressNumber') as string) || loginForm.addressNumber;
    const complement = (formData.get('complement') as string) || loginForm.complement;
    const zipCode = (formData.get('zipCode') as string) || loginForm.zipCode;
    const country = (formData.get('country') as string) || loginForm.country;
    const agentCustomerId = (formData.get('agentCustomerId') as string) || loginForm.agentCustomerId;
    const cpf = (formData.get('cpf') as string) || loginForm.cpf;
    const state = (formData.get('state') as string) || loginForm.state;
    const city = (formData.get('city') as string) || loginForm.city;

    // ブラジルの場合は 番号と補足情報を含めた完全な住所を作成
    const address = country === 'Brasil' && addressNumber
      ? `${rawAddress}, ${addressNumber}${complement ? ', ' + complement : ''}`.trim()
      : rawAddress;

    try {
      await signUp(email, password, 'customer', fullName, whatsapp, address, zipCode, country, agentCustomerId, cpf, state, city, lang);

      // メール確認が必要な場合は成功メッセージを表示
      alert(lang === 'es'
        ? '¡Cuenta creada! Por favor, revisa tu correo electrónico para confirmar tu cuenta.'
        : 'Conta criada! Por favor, verifique seu e-mail para confirmar sua conta.');

      setLoginForm({ email: '', password: '', fullName: '', whatsapp: '', address: '', addressNumber: '', complement: '', zipCode: '', country: '', agentCustomerId: '', cpf: '', state: '', city: '' });
      setShowSignUp(false);
    } catch (error: any) {
      console.error('Sign up error:', error);
      const isEs = lang === 'es';
      const code = error?.errorCode || '';
      const msg = (error?.message || '').toLowerCase();

      let userMessage = '';
      if (code === 'EMAIL_ALREADY_EXISTS' || msg.includes('already') || msg.includes('exists') || msg.includes('既に使用') || msg.includes('registered')) {
        userMessage = isEs
          ? 'Este correo electrónico ya está registrado. Por favor, inicia sesión o utiliza otro correo.'
          : 'Este e-mail já está cadastrado. Por favor, faça login ou utilize outro e-mail.';
      } else if (code === 'PASSWORD_TOO_SHORT' || msg.includes('password') || msg.includes('6文字') || msg.includes('caracter')) {
        userMessage = isEs
          ? 'La contraseña debe tener al menos 6 caracteres.'
          : 'A senha deve ter pelo menos 6 caracteres.';
      } else if (code === 'INVALID_EMAIL' || msg.includes('invalid email') || msg.includes('valid email')) {
        userMessage = isEs
          ? 'El formato del correo electrónico no es válido.'
          : 'O formato do e-mail não é válido.';
      } else if (code === 'MISSING_FIELDS' || msg.includes('必須')) {
        userMessage = isEs
          ? 'Por favor, completa todos los campos requeridos.'
          : 'Por favor, preencha todos os campos obrigatórios.';
      } else {
        userMessage = isEs
          ? `Error al crear la cuenta: ${error?.message || 'Error inesperado. Inténtalo de nuevo.'}`
          : `Erro ao criar a conta: ${error?.message || 'Erro inesperado. Tente novamente.'}`;
      }

      alert(userMessage);
    }
  };

  const handleLogout = async () => {
    // モーダルを閉じ、画面UIを0秒で即座にログアウト状態（ログイン画面）にする
    setShowLogoutConfirm(false);
    const userId = currentUser?.id;
    setCurrentUser(null);
    setMyRequests([]);
    setPurchasedItems([]);
    setFavorites([]);
    setDepositsList([]);

    if (userId) {
      fetch('/api/push-subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).catch(err => console.error('Push subscription cleanup error:', err));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('jogalibre_terms_accepted');
      localStorage.removeItem('joga_terms_accepted');
    }
    try {
      await signOut();
    } catch (err) {
      console.error('Signout error:', err);
    }
  };

  const handleCopyTrackingNumber = async (itemId: string, trackingNumber: string) => {
    if (!trackingNumber) return;
    const ok = await copyToClipboardSafe(trackingNumber);
    if (ok) {
      setCopiedItemId(itemId);
      setTimeout(() => {
        setCopiedItemId(null);
      }, 2000);
    }
  };

  const getFilteredPurchasedItems = () => {
    let filtered = purchasedItems;

    // 発送タブでは取消済の商品は非表示
    if (activeTab === 'shipping') {
      filtered = filtered.filter(item => !item.cancelledAt);
    }

    // 顧客名でフィルタリング
    if (selectedCustomer && selectedCustomer !== 'all') {
      filtered = filtered.filter(item => item.customerName === selectedCustomer);
    }

    // 年でフィルタリング
    if (purchasedYear !== 'all') {
      filtered = filtered.filter(item => {
        if (!item.confirmedAt) return false;
        const date = new Date(item.confirmedAt);
        return date.getFullYear().toString() === purchasedYear;
      });
    }

    // 月でフィルタリング
    if (purchasedMonth !== 'all') {
      filtered = filtered.filter(item => {
        if (!item.confirmedAt) return false;
        const date = new Date(item.confirmedAt);
        return (date.getMonth() + 1).toString() === purchasedMonth;
      });
    }

    // 発送ステータスでフィルタリング（発送タブの場合のみ適用）
    if (activeTab === 'shipping' && shippingStatusFilter !== 'all') {
      filtered = filtered.filter(item => {
        const status = item.shippingStatus || 'not_shipped';
        return status === shippingStatusFilter;
      });
    }

    return filtered;
  };

  const handleBidRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingBid) return;

    const finalCustomerName = (currentUser?.role === 'customer' && currentUser?.agentCustomerId)
      ? (currentUser?.agentFullName || '')
      : bidForm.name;

    if (!selectedProduct || !finalCustomerName || !bidForm.maxBid) return;

    // 20件制限チェック
    if (myRequests.length >= 20) {
      alert(lang === 'es'
        ? 'Has alcanzado el límite máximo de 20 solicitudes. Por favor, espera a que se procesen las actuales.'
        : 'Você atingiu o limite máximo de 20 solicitações. Aguarde o processamento das atuais.');
      return;
    }

    setIsSubmittingBid(true);

    try {
      // 念のためセッションから最新のトークンを取得
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;


      const res = await fetch('/api/bid-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          productTitle: selectedProduct.titleJa || selectedProduct.title,
          productUrl: selectedProduct.url + (selectedProduct.categoryId ? (selectedProduct.url.includes('?') ? '&' : '?') + 'auccat=' + selectedProduct.categoryId : ''),
          productImage: selectedProduct.imageUrl,
          productPrice: selectedProduct.currentPrice,
          productEndTime: selectedProduct.endTime,
          maxBid: parseFloat(bidForm.maxBid),
          customerName: finalCustomerName,
          customerEmail: currentUser?.email,
          language: lang,
          deliveryLocation: deliveryCountry === 'JP' ? 'JP' : deliveryCity,
          deliveryCountry: getCountryNameJa(deliveryCountry),
          deliveryCity: deliveryCountry === 'JP' ? '' : getCityNameJa(deliveryCountry, deliveryCity),
          shippingMethod: deliveryCountry === 'JP' ? 'sea' : shippingMethod
        })
      });

      if (res.ok) {
        if (selectedProduct) {
          addLocalOfferedId(selectedProduct.id || selectedProduct.url || '');
        }
        alert(t.offerSuccess);
        setSelectedProduct(null);
        setBidForm({ name: '', maxBid: '' });
        fetchMyRequests();
      } else {
        alert(t.offerError);
      }
    } catch (error) {
      console.error('Error submitting bid request:', error);
      alert(t.offerError);
    } finally {
      setIsSubmittingBid(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const calculateUSDPrice = (jpyPrice: number, title?: string, url?: string) => {
    const FOB_COST = calculateDefaultFobCost(title, url);
    const SHIPPING_COST = calculateDefaultShippingCost(title, url);
    const totalJpyPrice = jpyPrice + FOB_COST + SHIPPING_COST;
    // B001本人は0.9(10%利益)、B001紐づき顧客は0.5(50%利益)、ブラジルエージェントは0.7(30%利益)、通常エージェントは0.8(20%)、通常顧客は0.6(40%)
    const profitDivisor = (() => {
      if (currentUser?.customerId === 'B001') return 0.9;
      if (currentUser?.agentCustomerId === 'B001') return 0.5;
      if (currentUser?.customerId?.startsWith('A')) {
        const countryLower = (currentUser?.country || '').trim().toLowerCase();
        if (countryLower === 'brasil' || countryLower === 'brazil') {
          return 0.7; // ブラジルエージェント: 30%利益率
        }
        return 0.8; // 通常エージェント: 20%利益率
      }
      return 0.6;
    })();
    const priceWithProfit = Math.round((totalJpyPrice / profitDivisor) * 100) / 100;
    const usdPrice = priceWithProfit / exchangeRate;
    const roundedUp = Math.ceil(usdPrice / 5) * 5;
    return roundedUp.toLocaleString('en-US');
  };

  const formatExchangeRate = (value: number, currency: string) => {
    const fixedValue = value.toFixed(2);
    const formatted = Number(fixedValue).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    if (currency === 'USD' || currency === 'JPY') {
      return formatted;
    } else {
      return formatted
        .replace(/,/g, 'TEMP')
        .replace(/\./g, ',')
        .replace(/TEMP/g, '.');
    }
  };

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

  const calculateConvertedPrice = (jpyPrice: number, targetCurrency: string = selectedCurrency, title?: string, url?: string, explicitJcat?: string, productId?: string) => {
    // ヤフオク以外の商品（手動登録商品や非ヤフオクドメインURL）の場合、jpyPrice には管理者が登録した販売価格（USD建て）が入っているため、それを基に通貨換算を行う
    const isNonYahoo = (productId && productId.startsWith('m-')) || (url && !url.includes('auctions.yahoo.co.jp') && !url.includes('page.auctions.yahoo.co.jp'));
    if (isNonYahoo) {
      const usdPrice = jpyPrice;
      if (targetCurrency === 'USD') {
        return Math.round(usdPrice).toLocaleString('en-US');
      } else {
        const rate = exchangeRates[targetCurrency] || 1;
        const rawConverted = usdPrice * rate;
        const rounded = Math.round(rawConverted);
        let finalConverted = rounded;
        if (targetCurrency === 'BRL' || targetCurrency === 'BOB') {
          finalConverted = Math.ceil(rounded / 5) * 5;
        } else if (targetCurrency === 'PYG' || targetCurrency === 'CLP' || targetCurrency === 'ARS') {
          finalConverted = Math.ceil(rounded / 1000) * 1000;
        } else {
          finalConverted = Math.ceil(rounded);
        }
        return finalConverted.toLocaleString('en-US').replace(/,/g, '.');
      }
    }

    let urlWithJcat = url || '';
    if (explicitJcat) {
      urlWithJcat += (urlWithJcat.includes('?') ? '&' : '?') + `jcat=${explicitJcat}`;
    }
    const FOB_COST = calculateDefaultFobCost(title, urlWithJcat);
    const SHIPPING_COST = calculateDefaultShippingCost(title, urlWithJcat);
    const totalJpyPrice = jpyPrice + FOB_COST + SHIPPING_COST;
    
    // B001本人は0.9(10%利益)、B001紐づき顧客は0.5(50%利益)、ブラジルエージェントは0.7(30%利益)、通常エージェントは0.8(20%)、通常顧客は0.6(40%)
    const profitDivisor = (() => {
      if (currentUser?.customerId === 'B001') return 0.9;
      if (currentUser?.agentCustomerId === 'B001') return 0.5;
      if (currentUser?.customerId?.startsWith('A')) {
        const countryLower = (currentUser?.country || '').trim().toLowerCase();
        if (countryLower === 'brasil' || countryLower === 'brazil') {
          return 0.7; // ブラジルエージェント: 30%利益率
        }
        return 0.8; // 通常エージェント: 20%利益率
      }
      return 0.6;
    })();
    
    const priceWithProfit = Math.round((totalJpyPrice / profitDivisor) * 100) / 100;
    
    const jpyRate = exchangeRates['JPY'] || exchangeRate || 150;
    const usdPrice = priceWithProfit / jpyRate;
    const roundedUp = Math.ceil(usdPrice / 5) * 5;
    
    if (targetCurrency === 'USD') {
      return roundedUp.toLocaleString('en-US');
    } else {
      const rate = exchangeRates[targetCurrency] || 1;
      const rawConverted = roundedUp * rate;
      const rounded = Math.round(rawConverted);
      
      let finalConverted = rounded;
      if (targetCurrency === 'BRL' || targetCurrency === 'BOB') {
        finalConverted = Math.ceil(rounded / 5) * 5;
      } else if (targetCurrency === 'PYG' || targetCurrency === 'CLP' || targetCurrency === 'ARS') {
        finalConverted = Math.ceil(rounded / 1000) * 1000;
      } else {
        finalConverted = Math.ceil(rounded);
      }
      
      return finalConverted.toLocaleString('en-US').replace(/,/g, '.');
    }
  };

  const convertUSDToSelectedCurrency = (usdAmount: number, targetCurrency: string = selectedCurrency) => {
    if (targetCurrency === 'USD') {
      return `${getCurrencySymbol(targetCurrency)} ${Math.round(usdAmount).toLocaleString('en-US')}`;
    }
    const rate = exchangeRates[targetCurrency] || 1;
    const rawConverted = usdAmount * rate;
    const rounded = Math.round(rawConverted);
    
    let finalConverted = rounded;
    if (targetCurrency === 'BRL' || targetCurrency === 'BOB') {
      finalConverted = Math.ceil(rounded / 5) * 5;
    } else if (targetCurrency === 'PYG' || targetCurrency === 'CLP' || targetCurrency === 'ARS') {
      finalConverted = Math.ceil(rounded / 1000) * 1000;
    } else {
      finalConverted = Math.ceil(rounded);
    }
    
    return `${getCurrencySymbol(targetCurrency)} ${finalConverted.toLocaleString('en-US').replace(/,/g, '.')}`;
  };

  const getDeliveryLocationName = (loc?: string) => {
    if (!loc) return '-';
    if (loc === 'JP') return lang === 'es' ? 'Japón 🇯🇵' : 'Japão 🇯🇵';
    if (loc === 'ASU') return lang === 'es' ? 'Asunción 🇵🇾' : 'Assunção 🇵🇾';
    if (loc === 'CDE') return 'Ciudad del Este 🇵🇾';
    if (loc === 'ENC') return lang === 'es' ? 'Encarnación 🇵🇾' : 'Encarnação 🇵🇾';
    if (loc === 'PJC') return 'Pedro Juan Caballero 🇵🇾';
    
    // 都市コード（SNT, IQQ など）から言語別都市名を取得する
    for (const country of deliveryLocations) {
      const city = country.cities.find(c => c.code === loc);
      if (city) {
        return lang === 'es' ? city.nameEs : city.namePt;
      }
    }

    // もし "国名:都市名" の形式の場合、都市名部分を抽出してローカライズ
    if (loc.includes(':')) {
      const parts = loc.split(':');
      const cityJaName = parts[1].trim();
      for (const country of deliveryLocations) {
        const city = country.cities.find(c => c.nameJa === cityJaName);
        if (city) {
          return lang === 'es' ? city.nameEs : city.namePt;
        }
      }
      return cityJaName;
    }

    return loc;
  };

  // 現地費用を表示用にフォーマットする関数 (数値の場合は通貨換算し、文字列の場合はそのまま表示する)
  const formatLocalCost = (cost: number | string): string => {
    if (typeof cost === 'string') {
      const lower = cost.trim().toLowerCase();
      if (lower === 'unavailable' || lower === '発送不可' || lower === 'no disponible' || lower === 'não disponível') {
        return lang === 'es' ? 'No disponible ❌' : 'Não disponível ❌';
      }
      if (lower === 'consultar' || lower === '要問い合わせ' || lower === '要問合せ') {
        return lang === 'es' ? 'Consultar 💬' : 'Consultar 💬';
      }
      return cost;
    }
    return convertUSDToSelectedCurrency(cost);
  };

  // 引渡し場所に応じた現地費用（USD）を返す関数
  const getLocalCost = (product: SearchItem): number | string => {
    if (deliveryCountry === 'JP') return 0;
    // キーワード検索（searchType === 'keyword'）または URL検索（searchType === 'url'）の場合、
    // 日本以外を選択した場合は常に「要問い合わせ」を表示する。
    if (searchType === 'keyword' || searchType === 'url') {
      return '要問い合わせ';
    }
    const loc = deliveryCity;
    let finalUrl = product.url || '';
    if (product.categoryId && !finalUrl.includes('auccat=')) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'auccat=' + product.categoryId;
    }
    if (currentCategory?.id && !finalUrl.includes('jcat=')) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'jcat=' + currentCategory.id;
    }
    return calculateLocalCost(loc, { productTitle: product.titleJa || product.title, productUrl: finalUrl }, shippingMethod);
  };

  const fetchMyRequests = async (overrideEmail?: string) => {
    try {
      const email = overrideEmail || currentUser?.email;
      if (!email) return;

      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?email=${encodeURIComponent(email)}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      // スネークケースからキャメルケースに変換
      const convertedRequests = (data.bidRequests || []).map((req: Record<string, unknown>) => ({
        id: req.id as string,
        productId: req.product_id as string,
        productTitle: req.product_title as string,
        productTitleEs: req.product_title_es as string | null,
        productTitlePt: req.product_title_pt as string | null,
        productUrl: req.product_url as string,
        productImage: req.product_image as string,
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
        adminNeedsConfirm: req.admin_needs_confirm,
        customerId: req.customer_id as string,
        agentCustomerId: req.agent_customer_id as string | null | undefined,
        customerCountry: req.customer_country as string | null | undefined,
        delivery_location: req.delivery_location as string | undefined,
        delivery_country: req.delivery_country as string | undefined,
        delivery_city: req.delivery_city as string | undefined,
        shipping_method: req.shipping_method as string | undefined,
        paid_local: req.paid_local || false,
        paid_local_at: req.paid_local_at as string | null | undefined,
        local_cost: req.local_cost != null ? Number(req.local_cost) : null,
      }));

      // 取得した有効なリクエストの全IDでローカルストレージキャッシュを完全同期（削除されたものは消える）
      const validOfferedIds = convertedRequests.flatMap((req: any) => [req.productId, req.productUrl].filter(Boolean));
      syncLocalOfferedIds(validOfferedIds);

      // DBの翻訳結果を優先し、無い場合のみ翻訳APIを叩く
      const requestsWithTranslation = await Promise.all(convertedRequests.map(async (req: any) => {
        let title = req.productTitle || '';
        const originalTitle = req.productTitle || '';
        if (lang === 'es') {
          if (req.productTitleEs) title = req.productTitleEs;
          else if (title) title = await translateSingleTitle(title, lang);
        } else if (lang === 'pt' || lang === 'pt-BR') {
          if (req.productTitlePt) title = req.productTitlePt;
          else if (title) title = await translateSingleTitle(title, lang);
        }
        return { ...req, productTitleJa: originalTitle, productTitle: title };
      }));

      setMyRequests(requestsWithTranslation);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  // 商品が既にオファー申請済みかどうかを判定する関数
  const isProductOffered = (prod?: { id?: string; url?: string } | null): boolean => {
    if (!prod) return false;
    const prodAuctionId = extractAuctionId(prod.id) || extractAuctionId(prod.url);
    if (!prodAuctionId) return false;

    // 1. myRequestsリストが存在する場合は、myRequestsリストを照合
    if (myRequests && myRequests.length > 0) {
      return myRequests.some(req => {
        const reqAuctionId = extractAuctionId(req.productId) || extractAuctionId(req.productUrl);
        if (reqAuctionId && reqAuctionId === prodAuctionId) return true;
        if (prod.id && req.productId && (prod.id === req.productId || req.productId.includes(prod.id) || prod.id.includes(req.productId))) {
          return true;
        }
        if (prod.url && req.productUrl) {
          const cleanProdUrl = prod.url.split('?')[0].replace(/\/$/, '');
          const cleanReqUrl = req.productUrl.split('?')[0].replace(/\/$/, '');
          if (cleanProdUrl && cleanReqUrl && cleanProdUrl === cleanReqUrl) {
            return true;
          }
        }
        return false;
      });
    }

    // 2. myRequestsがまだ空・ロード中の場合はローカルストレージのキャッシュを確認
    const localOffered = getLocalOfferedIds();
    return localOffered.includes(prodAuctionId);
  };

  const fetchProductDetailForOfferSilent = async (url: string) => {
    setIsOfferUpdating(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/yahoo-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ url, lang, skipDescription: true, skipAiSummary: true })
      });
      const data = await res.json();
      if (data.product) {
        const detail = data.product;
        setSelectedProduct(prev => {
          if (prev && (prev.url === detail.url || prev.id === detail.id)) {
            return { ...prev, ...detail, images: detail.images || prev.images || [detail.imageUrl] };
          }
          return prev;
        });

        // オファー入力欄(maxBid)も最新の計算価格に自動同期更新
        const detailUrlWithCat = detail.url + (detail.categoryId ? (detail.url.includes('?') ? '&' : '?') + 'auccat=' + detail.categoryId : '');
        const newCalculatedBid = calculateConvertedPrice(
          detail.currentPrice,
          'USD',
          detail.titleJa || detail.title,
          detailUrlWithCat,
          currentCategory?.id,
          detail.id
        ).toString().replace(/,/g, '');

        setBidForm(prev => ({
          ...prev,
          maxBid: newCalculatedBid
        }));

        // 商品リスト(products)を同期更新
        setProducts(prev => prev.map(p =>
          (p.url === detail.url || p.id === detail.id) ? { ...p, ...detail, images: detail.images || [detail.imageUrl] } : p
        ));

        // お気に入りリスト(favorites)も同期更新（もし存在すれば）
        setFavorites(prev => prev.map(f =>
          (f.url === detail.url || f.id === detail.id) ? { ...f, ...detail, images: detail.images || [detail.imageUrl] } : f
        ));
      }
    } catch (error) {
      console.error('Error fetching product for offer silent:', error);
    } finally {
      setIsOfferUpdating(false);
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
        body: JSON.stringify({ url: searchUrl, lang, skipDescription: true, skipAiSummary: true })
      });

      const data = await res.json();
      if (data.product) {
        setProducts([data.product]);
        // スクロール処理 (画面上部に商品ボックスが来るようにズラす)
        setTimeout(() => {
          if (resultsRef.current) {
            const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 110;
            window.scrollTo({ top: y, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error importing product:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeywordSearch = async (eOrWord?: React.FormEvent | string, page: number = 1, forceCond?: 'all' | 'new' | 'used', forceSort?: 'featured' | 'price_asc' | 'price_desc' | 'bids_desc' | 'new') => {
    let searchWord = keyword;
    if (typeof eOrWord === 'string') {
      searchWord = eOrWord;
      setKeyword(eOrWord);
    } else if (eOrWord && typeof eOrWord === 'object' && 'preventDefault' in eOrWord) {
      eOrWord.preventDefault();
    }
    if (!searchWord.trim()) return;

    setIsSearching(true);
    setLoading(true);
    setSearchPage(page);
    const condToUse = forceCond || searchCondition;
    const sortToUse = forceSort || sortOrder;
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/search?q=${encodeURIComponent(searchWord)}&lang=${lang}&page=${page}&cond=${condToUse}&sort=${sortToUse}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      if (data.items) {
        setProducts(data.items);
        setNextPageExists(data.nextPage || false);
        // スクロール処理 (固定ヘッダー分80pxほどズラす)
        setTimeout(() => {
          if (resultsRef.current) {
            const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 110;
            window.scrollTo({ top: y, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
      setLoading(false);
    }
  };

  const handleJdmSearch = (forceCond?: 'all' | 'new' | 'used') => {
    const condToUse = forceCond || searchCondition;
    let condParam = '';
    if (condToUse === 'new') {
      condParam = '&istatus=1';
    } else if (condToUse === 'used') {
      condParam = '&istatus=2';
    }

    if (!jdmSearchKeyword.trim()) {
      // キーワードが空でも現在のアクティブURLがあればコンディションを反映して再フェッチする
      if (activeCategoryUrl) {
        const updatedUrl = updateUrlCondition(activeCategoryUrl, condToUse);
        fetchCategoryItems(updatedUrl, 1);
      }
      return;
    }
    // ヤフオクの自動車車体(26360)カテゴリ内でのキーワード検索URLを組み立てる
    const searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(jdmSearchKeyword.trim())}&auccat=26360&va=${encodeURIComponent(jdmSearchKeyword.trim())}&b=1&n=50${condParam}`;
    fetchCategoryItems(searchUrl, 1);
  };

  const handleCategorySearch = (catId: string, forceCond?: 'all' | 'new' | 'used') => {
    const condToUse = forceCond || searchCondition;
    let condParam = '';
    if (condToUse === 'new') {
      condParam = '&istatus=1';
    } else if (condToUse === 'used') {
      condParam = '&istatus=2';
    }

    if (!categorySearchKeyword.trim()) {
      // キーワードが空でもアクティブURLまたはカテゴリURLがあればコンディションを反映して再フェッチする
      if (activeCategoryUrl) {
        const updatedUrl = updateUrlCondition(activeCategoryUrl, condToUse);
        fetchCategoryItems(updatedUrl, 1);
      } else {
        const initialUrl = currentCategory?.url;
        if (initialUrl) {
          const updatedUrl = updateUrlCondition(initialUrl, condToUse);
          fetchCategoryItems(updatedUrl, 1);
        }
      }
      return;
    }
    // 指定されたカテゴリID内でのキーワード検索URLを組み立てる
    const searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(categorySearchKeyword.trim())}&auccat=${catId}&va=${encodeURIComponent(categorySearchKeyword.trim())}&b=1&n=50${condParam}`;
    fetchCategoryItems(searchUrl, 1);
  };

  const fetchCategoryItems = async (url: string, page: number = 1, forceSort?: 'featured' | 'price_asc' | 'price_desc' | 'bids_desc' | 'new') => {
    setIsSearching(true);
    setLoading(true);
    setSearchPage(page);

    // カテゴリURLに exflg=1 を付与して検索結果形式を安定させる
    let targetUrl = url;
    if (!targetUrl.includes('exflg=1')) {
      const connector = targetUrl.includes('?') ? '&' : '?';
      targetUrl += `${connector}exflg=1`;
    }

    const sortToUse = forceSort || sortOrder;
    setActiveCategoryUrl(targetUrl);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/search?url=${encodeURIComponent(targetUrl)}&page=${page}&lang=${lang}&sort=${sortToUse}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      if (data.items) {
        setProducts(data.items);
        setNextPageExists(data.nextPage || false);
        // スクロール処理 (固定ヘッダー分80pxほどズラす)
        setTimeout(() => {
          if (resultsRef.current) {
            const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 110;
            window.scrollTo({ top: y, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
      setLoading(false);
    }
  };

  // 並び替え（ソート順）変更時のハンドラー
  const handleSortChange = (newSort: 'featured' | 'price_asc' | 'price_desc' | 'bids_desc' | 'new') => {
    setSortOrder(newSort);
    if (searchType === 'keyword' && keyword.trim()) {
      handleKeywordSearch(keyword, 1, undefined, newSort);
    } else if (activeCategoryUrl) {
      fetchCategoryItems(activeCategoryUrl, 1, newSort);
    } else if (currentCategory?.url) {
      fetchCategoryItems(currentCategory.url, 1, newSort);
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
    if (processingOfferId) return;
    setProcessingOfferId(requestId);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      let res;
      if (action === 'accept') {
        res = await fetch('/api/bid-request', {
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
        res = await fetch('/api/bid-request', {
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
        res = await fetch('/api/bid-request', {
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

      if (res && res.ok) {
        // 楽観的UI更新: 即座に反映してチラつきを防止
        setMyRequests(prev => prev.map(item => {
          if (item.id === requestId) {
            if (action === 'accept') {
              return { ...item, status: 'approved', customerCounterOfferUsed: true };
            } else if (action === 'reject') {
              return { ...item, status: 'rejected', rejectReason: 'Offer declined by customer' };
            } else if (action === 'counter' && counterAmount) {
              return { ...item, customerCounterOffer: counterAmount, customerCounterOfferUsed: false };
            }
          }
          return item;
        }));

        // 管理者へ通知
        if (currentUser) {
          const targetReq = myRequests.find(r => r.id === requestId);
          const itemTitle = targetReq?.productTitle || '対象商品';
          const custId = currentUser.customerId ? `(${currentUser.customerId})` : '';
          const custName = currentUser.fullName || currentUser.email;

          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sendToAdmins: true,
              bidRequestId: requestId,
              title: `💬 【オファー回答】${custName} ${custId}`.trim(),
              body: `商品: ${itemTitle}`,
              url: '/admin'
            })
          }).catch(e => console.error('Admin push error', e));
        }

        await fetchMyRequests();
      }
    } catch (error) {
      console.error('Error responding to counter offer:', error);
    } finally {
      setProcessingOfferId(null);
    }
  };

  const handleFinalStatusConfirm = async (requestId: string, message?: string) => {
    if (processingOfferId) return;
    setProcessingOfferId(requestId);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
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

      if (res.ok) {
        // 楽観的UI更新: 即座に確認状態を反映
        setMyRequests(prev => prev.map(item => {
          if (item.id === requestId) {
            return {
              ...item,
              customerConfirmed: true,
              customerMessage: message || ''
            };
          }
          return item;
        }));

        // 管理者へ通知
        if (currentUser) {
          const targetReq = myRequests.find(r => r.id === requestId);
          const itemTitle = targetReq?.productTitle || '対象商品';
          const custId = currentUser.customerId ? `(${currentUser.customerId})` : '';
          const custName = currentUser.fullName || currentUser.email;

          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sendToAdmins: true,
              bidRequestId: requestId,
              title: `✅ 【確認完了】${custName} ${custId}`.trim(),
              body: `商品: ${itemTitle}`,
              url: '/admin'
            })
          }).catch(e => console.error('Admin push error', e));
        }

        await fetchMyRequests();
      }
    } catch (error) {
      console.error('Error confirming:', error);
    } finally {
      setProcessingOfferId(null);
    }
  };

  // カウンターオファー合意状態および合意金額を取得するヘルパー関数
  const getAgreedCounterOffer = (request?: BidRequest | null): number | null => {
    if (!request) return null;
    // 承認または落札ステータスでない場合は合意カウンターオファーではない
    if (request.status !== 'approved' && !request.finalStatus) return null;

    // 1. 管理者が提示したカウンターオファーを顧客が承認した場合
    if (
      request.counterOffer &&
      (request.customerCounterOfferUsed || !request.customerCounterOffer)
    ) {
      return request.counterOffer;
    }
    // 2. 顧客が提示したカウンターオファーを管理者が承認した場合
    if (
      request.customerCounterOffer &&
      !request.customerCounterOfferUsed
    ) {
      return request.customerCounterOffer;
    }
    return null;
  };

  const openEditOfferModal = (request: BidRequest) => {
    setEditingOfferRequest(request);
    const agreedCounter = getAgreedCounterOffer(request);
    const effectiveCurrentBid = agreedCounter !== null
      ? agreedCounter
      : (request.maxBid || 0);
    setEditingOfferAmount(effectiveCurrentBid ? String(effectiveCurrentBid) : '');
    setIsEditOfferModalOpen(true);
  };

  const handleEditOfferSubmit = async () => {
    if (isSubmittingEditOffer || !editingOfferRequest || !editingOfferAmount) return;
    setIsSubmittingEditOffer(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;
      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          id: editingOfferRequest.id,
          maxBid: Number(editingOfferAmount)
        })
      });
      if (res.ok) {
        setIsEditOfferModalOpen(false);
        setEditingOfferRequest(null);
        setEditingOfferAmount('');
        await fetchMyRequests();
      } else {
        const errData = await res.json();
        alert(lang === 'es' ? `Error: ${errData.error}` : `Erro: ${errData.error}`);
      }
    } catch (error) {
      console.error('Error editing offer:', error);
      alert(lang === 'es' ? 'Ocurrió un error al editar la oferta.' : 'Ocorreu um erro ao editar a oferta.');
    } finally {
      setIsSubmittingEditOffer(false);
    }
  };

  const handleDeleteOffer = async (requestId: string) => {
    if (processingOfferId) return;
    const confirmMsg = lang === 'es' 
      ? '¿Estás seguro de que quieres eliminar esta oferta?' 
      : 'Tem certeza que deseja excluir esta oferta?';
    if (!confirm(confirmMsg)) return;

    setProcessingOfferId(requestId);
    try {
      const targetReq = myRequests.find(r => r.id === requestId);
      if (targetReq) {
        if (targetReq.productId) removeLocalOfferedId(targetReq.productId);
        if (targetReq.productUrl) removeLocalOfferedId(targetReq.productUrl);
      }
      setMyRequests(prev => prev.filter(r => r.id !== requestId));

      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?id=${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });

      if (res.ok) {
        await fetchMyRequests();
      } else {
        const errData = await res.json();
        alert(lang === 'es' ? `Error: ${errData.error}` : `Erro: ${errData.error}`);
        await fetchMyRequests();
      }
    } catch (error) {
      console.error('Error deleting offer:', error);
      alert(lang === 'es' ? 'Ocurrió un error al eliminar la oferta.' : 'Ocorreu um erro ao excluir a oferta.');
    } finally {
      setProcessingOfferId(null);
    }
  };

  const confirmRejection = async (requestId: string) => {
    if (processingOfferId) return;
    setProcessingOfferId(requestId);
    try {
      const targetReq = myRequests.find(r => r.id === requestId);
      if (targetReq) {
        if (targetReq.productId) removeLocalOfferedId(targetReq.productId);
        if (targetReq.productUrl) removeLocalOfferedId(targetReq.productUrl);
      }
      setMyRequests(prev => prev.filter(r => r.id !== requestId));

      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/bid-request?id=${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });

      if (res.ok) {
        await fetchMyRequests();
      }
    } catch (error) {
      console.error('Error confirming rejection:', error);
    } finally {
      setProcessingOfferId(null);
    }
  };

  if (isAuthChecking && !currentUser) {
    return (
      <div className="min-h-screen-safe bg-white flex items-center justify-center p-4">
          <div className="text-center">
          <div className="flex justify-center items-center gap-1.5 sm:gap-2 mb-3 mt-6 sm:mt-8 max-w-full">
            <Image src="/icons/logo-mark.png" alt="JOGALIBRE" width={32} height={32} className="object-contain w-auto h-6 sm:h-8 animate-pulse flex-shrink-0" priority />
            <Image src="/icons/logo-text.png" alt="JOGALIBRE" width={428} height={32} className="object-contain w-auto h-6 sm:h-8 animate-pulse flex-shrink min-w-[120px]" priority />
          </div>
          <div className="text-gray-500 text-sm font-bold">Carregando... / Cargando...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen-safe bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-4 sm:p-8 rounded-xl shadow-xl max-w-md w-full relative z-10 pt-safe">

          <div className="flex justify-center items-center gap-1.5 sm:gap-2 mb-3 mt-6 sm:mt-8 max-w-full">
            <Image src="/icons/logo-mark.png" alt="JOGALIBRE" width={32} height={32} className="object-contain w-auto h-6 sm:h-8 flex-shrink-0" priority />
            <Image src="/icons/logo-text.png" alt="JOGALIBRE" width={428} height={32} className="object-contain w-auto h-6 sm:h-8 flex-shrink min-w-[120px]" priority />
          </div>
          <p className="text-gray-600 mb-6 text-center font-bold">{t.subtitle}</p>

          <form onSubmit={showSignUp ? handleSignUp : handleLogin} className="space-y-4">
            {showSignUp && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">{t.language}</label>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white mb-2"
                  >
                    <option value="es">Español</option>
                    <option value="pt">Português</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {lang === 'es' ? 'Nombre completo' : 'Nome completo'}
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={loginForm.fullName}
                    onChange={(e) => setLoginForm({ ...loginForm, fullName: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                    autoComplete="name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">WhatsApp</label>
                  <input
                    type="tel"
                    name="whatsapp"
                    value={loginForm.whatsapp}
                    onChange={(e) => setLoginForm({ ...loginForm, whatsapp: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                    placeholder="+55 11 98765-4321"
                    autoComplete="tel"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {lang === 'es' ? 'País' : 'País'}
                  </label>
                  <select
                    name="country"
                    value={loginForm.country}
                    onChange={(e) => setLoginForm({ ...loginForm, country: e.target.value, state: '', city: '', zipCode: '', address: '', addressNumber: '', complement: '', cpf: '' })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white"
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

                {loginForm.country === 'Brasil' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">CPF / CNPJ</label>
                    <input
                      type="text"
                      name="cpf"
                      value={loginForm.cpf}
                      onChange={(e) => setLoginForm({ ...loginForm, cpf: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder="000.000.000-00"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">
                    {loginForm.country === 'Brasil' ? 'CEP' : (lang === 'es' ? 'Código Postal' : 'Código Postal')}
                  </label>
                  <input
                    type="text"
                    name="zipCode"
                    value={loginForm.zipCode}
                    onChange={(e) => {
                      if (loginForm.country === 'Brasil') {
                        handleCepChange(e.target.value);
                      } else {
                        setLoginForm({ ...loginForm, zipCode: e.target.value });
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                    placeholder={loginForm.country === 'Brasil' ? '00000-000' : '12345-678'}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    {lang === 'es' ? 'Estado' : 'Estado'}
                  </label>
                  {loginForm.country === 'Brasil' ? (
                    <select
                      name="state"
                      value={loginForm.state}
                      onChange={(e) => setLoginForm({ ...loginForm, state: e.target.value, city: '' })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white"
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
                      name="state"
                      value={loginForm.state || ''}
                      onChange={(e) => setLoginForm({ ...loginForm, state: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder={lang === 'es' ? 'Provincia / Estado' : 'Província / Estado'}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    {lang === 'es' ? 'Ciudad' : 'Cidade'}
                  </label>
                  {loginForm.country === 'Brasil' ? (
                    <select
                      name="city"
                      value={loginForm.city}
                      onChange={(e) => setLoginForm({ ...loginForm, city: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white"
                      required
                      disabled={signUpCitiesLoading}
                    >
                      <option value="" disabled>
                        {signUpCitiesLoading 
                          ? (lang === 'es' ? 'Cargando...' : 'Carregando...') 
                          : (lang === 'es' ? 'Seleccionar ciudad' : 'Selecionar cidade')}
                      </option>
                      {signUpCities.find(c => c.nome === loginForm.city) === undefined && loginForm.city && (
                        <option value={loginForm.city}>{loginForm.city}</option>
                      )}
                      {signUpCities.map((c) => (
                        <option key={c.id} value={c.nome}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="city"
                      value={loginForm.city || ''}
                      onChange={(e) => setLoginForm({ ...loginForm, city: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder={lang === 'es' ? 'Ciudad' : 'Cidade'}
                    />
                  )}
                </div>

                {loginForm.country === 'Brasil' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {lang === 'es' ? 'Avenida' : 'Rua'}
                      </label>
                      <input
                        type="text"
                        name="address"
                        value={loginForm.address}
                        onChange={(e) => setLoginForm({ ...loginForm, address: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 h-12"
                        placeholder={lang === 'es' ? 'Nombre de la calle o avenida' : 'Nome da rua ou avenida'}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {lang === 'es' ? 'Número' : 'Número'}
                      </label>
                      <input
                        type="text"
                        name="addressNumber"
                        value={loginForm.addressNumber || ''}
                        onChange={(e) => setLoginForm({ ...loginForm, addressNumber: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 h-12"
                        placeholder="123"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Complemento (opcional)
                      </label>
                      <input
                        type="text"
                        name="complement"
                        value={loginForm.complement || ''}
                        onChange={(e) => setLoginForm({ ...loginForm, complement: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 h-12"
                        placeholder="Exemplo: Apto 20, Bloco B"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {lang === 'es' ? 'Dirección' : 'Endereço'}
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={loginForm.address}
                      onChange={(e) => setLoginForm({ ...loginForm, address: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder={lang === 'es' ? 'Calle, Número, Barrio' : 'Rua, Número, Bairro'}
                      required
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {lang === 'es' ? 'ID de Agente (Opcional)' : 'ID do Agente (Opcional)'}
                  </label>
                  <input
                    type="text"
                    name="agentCustomerId"
                    value={loginForm.agentCustomerId || ''}
                    onChange={(e) => setLoginForm({ ...loginForm, agentCustomerId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                    placeholder=""
                  />
                </div>
              </>
            )}
            {!showSignUp && (
              <div>
                <label className="block text-sm font-medium mb-2">{t.language}</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
                  className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white mb-2"
                >
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">{t.email}</label>
              <input
                type="email"
                name="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 h-12"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {t.password}
                {showSignUp && (
                  <span className="block text-xs text-gray-500 font-normal mt-0.5">
                    {lang === 'es'
                      ? 'Crea una contraseña para iniciar sesión en JOGALIBRE'
                      : 'Crie uma senha para fazer login no JOGALIBRE'}
                  </span>
                )}
              </label>
              <input
                type="password"
                name="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 h-12"
                autoComplete={showSignUp ? "new-password" : "current-password"}
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition"
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

  // 商品詳細を開く前に基本情報を事前キャッシュして詳細ページの0ms表示を実現する関数
  const prepareProductCache = (prod: SearchItem, dispPrice?: string, curr: string = selectedCurrency) => {
    if (typeof window === 'undefined') return;
    try {
      // 画面遷移直前の状態とスクロール位置を確実に記録
      saveNavState({
        activeTab,
        searchType,
        categoryHistory,
        activeCategoryUrl,
        keyword,
        searchCondition,
        sortOrder,
        searchPage,
        nextPageExists,
        products,
        scrollY: window.scrollY
      });

      const cleanId = extractAuctionId(prod.id || prod.url) || prod.id;
      if (!cleanId) return;

      const baseData = {
        id: cleanId,
        title: prod.title,
        titleJa: prod.titleJa || prod.title,
        url: prod.url,
        currentPrice: prod.currentPrice,
        displayPrice: dispPrice,
        displayCurrency: curr,
        imageUrl: prod.imageUrl,
        images: prod.images && prod.images.length > 0 ? prod.images : [prod.imageUrl],
        bids: prod.bids || 0,
        endTime: prod.endTime,
        timeLeft: prod.timeLeft,
        categoryId: prod.categoryId,
      };

      // 既存のAI要約キャッシュがあれば合体して保存
      const key = `jogalibre_prod_cache_${cleanId}_${lang}`;
      try {
        const existingRaw = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          if (existing.aiSummaryEs) (baseData as any).aiSummaryEs = existing.aiSummaryEs;
          if (existing.aiSummaryPt) (baseData as any).aiSummaryPt = existing.aiSummaryPt;
        }
      } catch {}
      try { sessionStorage.setItem(key, JSON.stringify(baseData)); } catch {}
      try { localStorage.setItem(key, JSON.stringify(baseData)); } catch {}
    } catch (e) {
      console.warn('prepareProductCache error:', e);
    }
  };

  // 商品詳細URLを安全に生成するヘルパー関数
  const buildProductDetailUrl = (product: SearchItem, displayPriceVal: string) => {
    const rawUrl = (product.url || '') + (product.categoryId ? ((product.url || '').includes('?') ? '&' : '?') + 'auccat=' + product.categoryId : '');
    const searchParamsObj = new URLSearchParams();
    searchParamsObj.set('url', rawUrl);
    searchParamsObj.set('lang', lang);
    if (currentCategory?.id) searchParamsObj.set('jcat', currentCategory.id);
    if (searchType) searchParamsObj.set('st', searchType);
    if (product.currentPrice) searchParamsObj.set('origPrice', String(product.currentPrice));
    if (product.titleJa || product.title) searchParamsObj.set('titleJa', product.titleJa || product.title);
    if (displayPriceVal) searchParamsObj.set('dispPrice', displayPriceVal);
    searchParamsObj.set('currency', selectedCurrency);

    return `/product/${encodeURIComponent(product.id)}?${searchParamsObj.toString()}`;
  };

  // 共通のカード描画関数
  const renderProductCard = (product: SearchItem, index: number, isFavoriteTab: boolean = false) => {
    const isFav = favorites.some(f => f.id === product.id);

    // 検索一覧で表示する計算済み価格
    const displayPriceVal = calculateConvertedPrice(
      product.currentPrice, 
      selectedCurrency, 
      product.titleJa || product.title, 
      product.url + (product.categoryId ? (product.url.includes('?') ? '&' : '?') + 'auccat=' + product.categoryId : ''), 
      currentCategory?.id, 
      product.id
    );

    const detailHref = buildProductDetailUrl(product, displayPriceVal);

    return (
      <div key={`product-${isFavoriteTab ? 'fav' : 'search'}-${index}-${product.id}`} className="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col h-full group">

        <div className="relative aspect-square w-full bg-gray-100 overflow-hidden">
          <Link
            href={detailHref}
            scroll={false}
            onClick={() => prepareProductCache(product, displayPriceVal, selectedCurrency)}
            className="block w-full h-full cursor-pointer"
          >
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.title || 'Product'}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-opacity duration-200"
              />
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-semibold">
                No Image
              </div>
            )}
          </Link>

          {/* お気に入り（★）ボタン（画像上・右下） */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(product, e);
            }}
            disabled={isTogglingFavorite === product.id}
            className="absolute bottom-2 right-2 z-10 p-2 sm:p-2.5 rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center group-hover:shadow-md cursor-pointer"
          >
            {isTogglingFavorite === product.id ? (
              <svg className="animate-spin h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <span className={`text-xl sm:text-2xl leading-none ${isFav ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-300'} transition-colors`}>
                {isFav ? '★' : '☆'}
              </span>
            )}
          </button>
        </div>
        <div className="p-3 sm:p-4 flex flex-col flex-1">
          <Link
            href={detailHref}
            scroll={false}
            onClick={() => prepareProductCache(product, displayPriceVal, selectedCurrency)}
            className="block mb-2 group-hover:text-indigo-600 transition-colors"
          >
            <h3 className="font-semibold text-xs sm:text-sm text-gray-800 line-clamp-2 leading-[1.25rem] h-[2.5rem] overflow-hidden w-full">{product.title}</h3>
          </Link>

          <div className="mt-auto space-y-1.5">
            <Link
              href={detailHref}
              scroll={false}
              onClick={() => prepareProductCache(product, displayPriceVal, selectedCurrency)}
              className="w-full h-9 bg-[#ff0033] hover:opacity-90 rounded text-center text-xs text-white font-bold flex items-center justify-center cursor-pointer transition-opacity"
            >
              {t.viewOnYahoo}
            </Link>
            <div className="h-9 flex justify-between items-center bg-gray-50 px-2.5 sm:px-3 rounded">
              <span className="text-[10px] sm:text-xs text-gray-500 font-medium">{t.bidsLabel}:</span>
              <span className="text-[10px] sm:text-xs font-bold text-gray-700 bg-white px-1.5 sm:px-2 py-0.5 rounded shadow-sm">{product.bids || 0}</span>
            </div>
            <div className="h-9 flex justify-between items-center text-[10px] sm:text-xs bg-red-50 px-2.5 sm:px-3 rounded text-red-700 font-medium">
              <span>{t.timeLeft}</span>
              <span className="text-right line-clamp-2 max-w-[60%] font-semibold">{getTimeRemaining(product.endTime || '', lang, product.timeLeft)}</span>
            </div>

            <div className="h-9 flex items-center justify-between bg-green-50 px-2.5 sm:px-3 rounded">
              <span className="text-[10px] sm:text-xs font-bold text-green-700 uppercase tracking-widest leading-none">
                {selectedCurrency}
              </span>
              <div className="flex items-center">
                <span className="font-extrabold text-green-700 text-base sm:text-lg leading-none tabular-nums tracking-tight">
                  <span className="text-xs font-semibold mr-0.5">
                    {getCurrencySymbol(selectedCurrency)}
                  </span>
                  {displayPriceVal}
                </span>
                {selectedCurrency === 'USD' && (
                  <span className="text-[8px] sm:text-[9px] text-green-700 font-medium ml-1.5 leading-tight flex-col hidden xs:block">
                    APROX<br />FOB
                  </span>
                )}
              </div>
            </div>

            {deliveryCountry !== 'JP' && (() => {
              const cost = getLocalCost(product);
              const isStringCost = typeof cost === 'string';
              if (isStringCost) {
                return (
                  <div className="h-9 flex items-center justify-center bg-orange-50 px-2.5 sm:px-3 rounded">
                    <span className="text-xs text-red-600 font-semibold">
                      {formatLocalCost(cost)}
                    </span>
                  </div>
                );
              }
              return (
                <div className="h-9 flex items-center justify-between bg-orange-50 px-2.5 sm:px-3 rounded">
                  <span className="text-[10px] sm:text-xs font-bold text-orange-700 tracking-widest leading-none">
                    {t.localCostLabel}
                  </span>
                  <div className="flex items-center">
                    <span className="font-extrabold text-orange-700 text-base sm:text-lg leading-none tabular-nums tracking-tight">
                      <span className="text-xs font-semibold mr-0.5">$</span>
                      {cost.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              );
            })()}

            {isProductOffered(product) ? (
              <button
                disabled={true}
                className="w-full h-12 bg-gray-100 text-gray-400 font-bold rounded-lg border border-gray-200 cursor-not-allowed flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
              >
                <span>✓ {t.offerMade || (lang === 'es' ? 'Oferta enviada' : 'Oferta enviada')}</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setSelectedProduct(product);
                  setBidForm({ 
                    name: (currentUser?.role === 'customer' && currentUser?.agentCustomerId)
                      ? (currentUser?.agentFullName || '')
                      : (currentUser?.fullName || ''),
                    maxBid: calculateConvertedPrice(product.currentPrice, 'USD', product.titleJa || product.title, product.url + (product.categoryId ? (product.url.includes('?') ? '&' : '?') + 'auccat=' + product.categoryId : ''), currentCategory?.id).toString().replace(/,/g, '')
                  });
                  if (product.url) {
                    fetchProductDetailForOfferSilent(product.url);
                  }
                }}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold rounded-lg transition shadow-sm hover:shadow flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
              >
                <span>{t.makeOffer}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen-safe bg-gray-100 relative">
      {/* Pull to Refresh インジケーター表示 */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 flex justify-center pt-safe z-[9999] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-white rounded-full p-2 shadow-xl border border-indigo-100 ring-4 ring-indigo-50 mt-4">

            <svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
      )}
      <header className="bg-white shadow pt-2 sm:pt-4">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 sm:px-6 lg:px-8">
          {/* 1行目: ロゴ & ログアウト */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-shrink">
              <Image src="/icons/logo-mark.png" alt="JOGALIBRE Mark" width={24} height={24} className="object-contain h-5 sm:h-6 w-5 sm:w-6 flex-shrink-0" priority />
              <Image src="/icons/logo-text.png" alt="JOGALIBRE Text" width={321} height={24} className="object-contain h-5 sm:h-6 w-auto flex-shrink min-w-[120px] max-w-[180px] min-[375px]:max-w-[220px] sm:max-w-none" priority />
            </div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-2.5 py-1 text-xs sm:text-sm text-red-600 hover:text-red-800 font-extrabold transition-colors hover:bg-red-50 rounded-lg"
            >
              {t.logout}
            </button>
          </div>

          {/* 2行目: 顧客ID/氏名（左列・Consultaと等幅） & 言語選択 + Avisos（右列・Pushと等幅） */}
          <div className="grid grid-cols-2 gap-2 items-center">
            {currentUser ? (
              <div className="flex items-center min-w-0 overflow-hidden pr-1">
                <span className="text-xs sm:text-sm text-gray-700 font-bold truncate block">
                  {currentUser.customerId && (
                    <span className="text-indigo-600 font-extrabold mr-1.5 shrink-0">
                      {currentUser.customerId}
                    </span>
                  )}
                  <span className="truncate">{currentUser.fullName}</span>
                </span>
              </div>
            ) : (
              <div className="min-w-0" />
            )}

            <div className="flex items-center gap-1.5 sm:gap-2 w-full">
              {/* 言語選択ドロップダウン（flex-1で残り幅を活用し、文字をゆったり収める） */}
              <div className="relative flex-1 min-w-0 flex items-center justify-between h-7 sm:h-8 px-2 sm:px-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-full text-[10px] sm:text-xs font-bold shadow-sm cursor-pointer hover:bg-gray-100 transition-colors">
                <span className="truncate flex-1 text-center">
                  {lang === 'es' ? 'Español' : 'Português'}
                </span>
                <svg className="w-3 h-3 text-gray-400 shrink-0 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as 'es' | 'pt')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                </select>
              </div>

              {/* Avisosボタン（コンパクト化: shrink-0 で必要最小限の幅に収める） */}
              <button
                onClick={() => {
                  setShowNotifications(true);
                  fetchNotifications();
                }}
                className="relative flex items-center justify-center gap-1 shrink-0 h-7 sm:h-8 px-2.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] sm:text-xs font-bold hover:bg-indigo-100 transition-colors shadow-sm"
              >
                <span>{lang === 'es' ? 'Avisos' : 'Avisos'}</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-col gap-2">
          {/* WhatsApp + プッシュ通知 + 通貨選択 + 更新 の2x2グリッド */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://wa.me/5518996686059"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-[#25D366] text-white px-4 h-12 rounded-lg hover:bg-[#128C7E] transition text-sm sm:text-base flex items-center justify-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>Consulta</span>
            </a>
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
              className={`flex-1 px-4 h-12 rounded-lg transition text-sm sm:text-base flex items-center justify-center gap-2 ${notificationStatus === 'enabled'
                ? 'bg-gray-500 text-white hover:bg-gray-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
              {notificationStatus === 'enabled' ? '🔔 Push ✅' : '🔔 Push'}
            </button>

            {/* 通貨選択ドロップダウン (WhatsAppの下) */}
            <div className="relative h-12 w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none font-medium">
                {lang === 'es' ? 'Moneda:' : 'Moeda:'}
              </span>
              <select
                value={selectedCurrency}
                onChange={(e) => {
                  const newCurr = e.target.value;
                  setSelectedCurrency(newCurr);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('jogalibre_user_selected_currency', newCurr);
                  }
                }}
                className="h-12 border border-gray-300 rounded-lg pl-20 pr-4 bg-white text-sm sm:text-base font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full text-center appearance-none"
              >
                <option value="USD">USD 🇺🇸</option>
                <option value="BRL">BRL 🇧🇷</option>
                <option value="PYG">PYG 🇵🇾</option>
                <option value="CLP">CLP 🇨🇱</option>
                <option value="BOB">BOB 🇧🇴</option>
                <option value="ARS">ARS 🇦🇷</option>
              </select>
            </div>

            {/* 更新ボタン (Pushの下、半幅に短縮) */}
            <button
              onClick={() => {
                if (activeTab === 'requests') fetchMyRequests();
                else if (activeTab === 'purchased') fetchPurchasedItems();
                else { fetchExchangeRate(); }
              }}
              className="bg-indigo-600 text-white h-12 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base w-full flex items-center justify-center"
            >
              🔁 {t.refresh}
            </button>
          </div>

          <div className="w-full h-12 bg-white border border-gray-300 rounded-lg text-sm sm:text-base flex items-center justify-center font-medium shadow-sm text-gray-700 font-sans">
            {t.exchangeRate}: <span className="font-bold text-indigo-600 ml-1.5">
              {selectedCurrency === 'USD' 
                ? `USD 1 = JPY ${formatExchangeRate(exchangeRates['JPY'] || exchangeRate || 150, 'USD')}` 
                : `USD 1 = ${selectedCurrency} ${formatExchangeRate(exchangeRates[selectedCurrency] || 0, selectedCurrency)}`
              }
            </span>
          </div>
        </div>
      </div>

      {/* タブ選択バー（管理画面と同様のラインデザイン ＆ Sticky化） */}
      <nav className="bg-white border-b sticky top-0 z-40 font-sans shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto whitespace-nowrap scrollbar-none">
            {[
              { key: 'search' as const, label: t.searchBottomTab, icon: '🔍' },
              { key: 'favorites' as const, label: t.favoritesTab, icon: '⭐' },
              { key: 'requests' as const, label: t.myRequests, icon: '📋' },
              { key: 'purchased' as const, label: t.purchasedItems, icon: '🛒' },
              { key: 'deposits' as const, label: t.depositsTab, icon: '💵' },
              { key: 'shipping' as const, label: t.shippingTab, icon: '📦' },
              { key: 'mypage' as const, label: t.myPage, icon: '👤' },
            ].map((tab, _idx, arr) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key === 'requests') fetchMyRequests();
                  if (tab.key === 'purchased') fetchPurchasedItems();
                  if (tab.key === 'deposits') {
                    fetchDeposits();
                    fetchPurchasedItems();
                  }
                  if (tab.key === 'mypage' && currentUser) {
                    fetchUserProfile();
                  }
                }}
                style={{ flexBasis: `${100 / arr.length}%` }}
                className={`grow shrink-0 min-w-[65px] py-3 px-0.5 text-center text-[9px] sm:text-xs font-semibold border-b-2 transition ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="block text-lg mb-0.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        {activeTab === 'favorites' ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-6">{t.favoritesTab}</h2>
            {favorites.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>{lang === 'es' ? 'No tienes productos en favoritos' : 'Você não tem produtos nos favoritos'}</p>
                <button
                  onClick={() => setActiveTab('search')}
                  className="mt-4 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-full font-bold text-sm hover:bg-indigo-100 transition"
                >
                  {t.searchAction}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mt-4">
                {favorites.map((product, index) => renderProductCard(product, index, true))}
              </div>
            )}
          </div>
        ) : activeTab === 'requests' ? (
          myRequests.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center font-sans">
              <p className="text-gray-500 text-lg">
                {lang === 'es' ? 'No hay solicitudes' : 'Não há solicitações'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
                {myRequests
                  .sort((a, b) => {
                    const now = new Date().getTime();
                    const timeA = a.productEndTime ? (parseAnyDateTime(a.productEndTime)?.getTime() || Infinity) : Infinity;
                    const timeB = b.productEndTime ? (parseAnyDateTime(b.productEndTime)?.getTime() || Infinity) : Infinity;

                    const isEndedA = timeA <= now || a.finalStatus !== null;
                    const isEndedB = timeB <= now || b.finalStatus !== null;

                    // 1. 終了済みを優先的に上に表示
                    if (isEndedA && !isEndedB) return -1;
                    if (!isEndedA && isEndedB) return 1;

                    // 2. 両方が「終了済み」の場合、作成日時（リクエスト日時）が新しい順に並べる
                    if (isEndedA && isEndedB) {
                      const dateA = new Date(a.createdAt || '').getTime();
                      const dateB = new Date(b.createdAt || '').getTime();
                      return dateB - dateA;
                    }

                    // 3. 両方が「未終了」の場合、終了時間が早い順に並べる
                    if (timeA !== timeB) {
                      return timeA - timeB;
                    }
                    
                    // 4. 終了時間が同じ（または両方なし）の場合は作成日時順
                    return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
                  })
                  .map((request) => (
                    <div key={request.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4 border border-gray-100 font-sans">
                      <div className="flex gap-4 mb-2">
                        <div className="relative w-32 h-32 flex-shrink-0">
                          {request.productImage ? (
                            <Image
                              src={request.productImage}
                              alt={request.productTitle}
                              fill
                              unoptimized
                              referrerPolicy="no-referrer"
                              className="object-cover rounded"
                              sizes="128px"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (target && !target.src.includes('customer-icon.png')) {
                                  target.src = '/icons/customer-icon.png';
                                }
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border border-gray-200 text-center p-2 text-black">
                              <span className="text-xs font-semibold text-gray-500 font-sans">
                                {lang === 'es' ? 'Sin foto' : 'Sem foto'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                          {/* 1. 商品タイトル */}
                          <h3 className="text-xs font-semibold line-clamp-2 leading-tight h-[30px] overflow-hidden">{request.productTitle}</h3>

                          {/* 2. 終了までボックス (h-7) */}
                          <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center w-full box-border">
                            <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis">
                              <span className="text-gray-500 text-xs font-medium mr-1">{t.endsIn}:</span>
                              <span className="font-semibold text-red-600 text-xs truncate">
                                {request.productEndTime ? getTimeRemaining(request.productEndTime, lang) : '-'}
                              </span>
                            </div>
                          </div>

                          {/* 3. ステータスバッジ (h-7) */}
                          <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center gap-1 w-full box-border overflow-x-auto whitespace-nowrap">
                            {request.finalStatus ? (
                              // 落札または落札できずが確定している場合
                              <>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getStatusColor(request.status)}`}>
                                  {t[request.status as keyof typeof t] || request.status}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getFinalStatusColor(request.finalStatus)}`}>
                                  {t[request.finalStatus as keyof typeof t] || request.finalStatus}
                                </span>
                              </>
                            ) : (
                              // 落札結果がまだない場合
                              <>
                                {request.status === 'rejected' && request.customerCounterOffer ? (
                                  <>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-purple-100 text-purple-800">
                                      {t.counter_offer}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-red-100 text-red-800">
                                      {lang === 'es' ? 'Rechazado' : 'Rejeitado'}
                                    </span>
                                  </>
                                ) : request.status === 'approved' && request.customerCounterOfferUsed ? (
                                  // 顧客が管理者のカウンターオファーを「承認」した場合
                                  <>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-blue-100 text-blue-800">
                                      {t.counter_offer}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-green-100 text-green-800">
                                      {t.approved}
                                    </span>
                                  </>
                                ) : request.status === 'approved' && !request.customerCounterOfferUsed && request.customerCounterOffer ? (
                                  // 管理者が顧客のカウンターオファーを「承認」した場合
                                  <>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-purple-100 text-purple-800">
                                      {t.counter_offer}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-green-100 text-green-800">
                                      {t.approved}
                                    </span>
                                  </>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                                    request.status === 'counter_offer' && request.customerCounterOffer
                                      ? 'bg-purple-100 text-purple-800'
                                      : getStatusColor(request.status)
                                  }`}>
                                    {t[request.status as keyof typeof t] || request.status}
                                  </span>
                                )}
                                {request.adminNeedsConfirm && request.status !== 'rejected' && request.status !== 'approved' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-red-100 text-red-800">
                                    {lang === 'es' ? 'Rechazado' : 'Rejeitado'}
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          {/* 4. ヤフオクURLボタン (h-7) */}
                          <div className="w-full">
                            {request.productUrl ? (
                              request.productId?.startsWith('m-') ? (
                                <a
                                  href={request.productUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans bg-blue-600"
                                >
                                  URL
                                </a>
                              ) : (
                                <Link
                                  href={`/product/${request.productId}?url=${encodeURIComponent(request.productUrl || '')}&lang=${lang}`}
                                  scroll={false}
                                  onClick={() => {
                                    if (typeof window !== 'undefined') {
                                      saveNavState({
                                        activeTab,
                                        searchType,
                                        categoryHistory,
                                        activeCategoryUrl,
                                        keyword,
                                        searchCondition,
                                        searchPage,
                                        nextPageExists,
                                        products,
                                        scrollY: window.scrollY
                                      });
                                    }
                                  }}
                                  className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans bg-[#ff0033]"
                                >
                                  {t.viewOnYahoo}
                                </Link>
                              )
                            ) : (
                              <div className="text-center text-xs text-gray-400 font-bold h-7 bg-gray-100 border border-gray-200 rounded px-2 flex items-center justify-center w-full box-border select-none font-sans">
                                {lang === 'es' ? 'Sin URL' : 'Sem URL'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 現在価格ボックス (h-12) (パターンA計算式) */}
                      <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">{t.currentPrice}:</span>
                        <span className="text-base font-bold text-gray-800">
                          {request.productPrice && request.productPrice > 0
                            ? (request.productId?.startsWith('m-') || (request.productUrl && !request.productUrl.includes('auctions.yahoo.co.jp') && !request.productUrl.includes('page.auctions.yahoo.co.jp')))
                              ? convertUSDToSelectedCurrency(request.productPrice)
                              : `${getCurrencySymbol(selectedCurrency)} ${calculateConvertedPrice(
                                  request.productPrice,
                                  selectedCurrency,
                                  request.productTitleJa || request.productTitle,
                                  request.productUrl,
                                  undefined,
                                  request.productId
                                )}`
                            : '-'}
                        </span>
                      </div>

                      {/* 2. オファー金額ボックス (h-12) - 顧客カウンター承認時は顧客カウンター金額が表示されるため非表示 */}
                      {!(request.status === 'approved' && request.customerCounterOffer && !request.customerCounterOfferUsed) && (
                        <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                          <span className="text-xs text-gray-500 font-medium">{t.maxBid}:</span>
                          <span className="text-base font-bold text-indigo-600">
                            {convertUSDToSelectedCurrency(request.maxBid || 0)}
                          </span>
                        </div>
                      )}

                      {/* 3. カウンターオファーボックス (h-12) */}
                      {(() => {
                        const isCustomerCounterApproved = request.status === 'approved' && !!request.customerCounterOffer && !request.customerCounterOfferUsed;
                        const hasAdminCounter = !!request.counterOffer && !isCustomerCounterApproved;
                        const hasCustomerCounter = !!request.customerCounterOffer;

                        if (!hasAdminCounter && !hasCustomerCounter) return null;

                        return (
                          <div className="flex flex-col gap-2 mb-2 w-full">
                            {/* 管理者からのカウンターオファー */}
                            {hasAdminCounter && (
                              <div className="h-12 px-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                                <span className="text-xs text-gray-500 font-medium">Contraoferta:</span>
                                <span className="text-base font-bold text-blue-700">
                                  {convertUSDToSelectedCurrency(request.counterOffer || 0)}
                                </span>
                              </div>
                            )}
                            {/* 顧客からのカウンターオファー */}
                            {hasCustomerCounter && (
                              <div className={`h-12 px-3 ${request.status === 'rejected' ? 'bg-gray-50 border-gray-100' : 'bg-purple-50 border-purple-100'} rounded-lg flex items-center justify-between`}>
                                <span className={`text-xs ${request.status === 'rejected' ? 'text-gray-400' : 'text-gray-500'} font-medium`}>{t.yourCounterOffer}:</span>
                                <div className="flex items-center gap-2">
                                  {request.status === 'rejected' && (
                                    <span className="text-xs font-semibold text-red-600">
                                      {lang === 'es' ? 'Rechazado' : 'Rejeitado'}
                                    </span>
                                  )}
                                  <span className={`text-base font-bold ${request.status === 'rejected' ? 'text-gray-400' : 'text-purple-700'}`}>
                                    {convertUSDToSelectedCurrency(request.customerCounterOffer || 0)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 4. 現地費用ボックス (オレンジトーン) */}
                      {request.delivery_location && request.delivery_location !== 'JP' && (() => {
                        const localCost = calculateLocalCost(request.delivery_location, request, request.shipping_method);
                        const isStringCost = typeof localCost === 'string';

                        return (
                          <div className="mb-2 h-12 px-3 bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-between text-orange-700 font-bold shadow-sm">
                            <span className="text-xs font-semibold text-orange-700">
                              {lang === 'es' ? 'Costo Local:' : 'Custo Local:'}
                            </span>
                            {isStringCost ? (
                              <span className="text-sm font-extrabold text-red-600">
                                {formatLocalCost(localCost)}
                              </span>
                            ) : (
                              <span className="text-base font-extrabold text-orange-700">
                                {formatLocalCost(localCost)}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* 5. 引渡場所ボックス (Lugar de Entrega / Local de Entrega) */}
                      <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-black font-sans">
                        <span className="text-xs text-gray-500 font-medium">
                          {lang === 'es' ? 'Lugar de Entrega:' : 'Local de Entrega:'}
                        </span>
                        <span className="text-sm font-semibold text-black">
                          {getDeliveryLocationName(request.delivery_location)}
                        </span>
                      </div>

                      {/* 6. 発送方法ボックス (引渡場所が日本以外の場合) */}
                      {request.delivery_location && request.delivery_location !== 'JP' && (
                        <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-black font-sans">
                          <span className="text-xs text-gray-500 font-medium">
                            {t.shippingMethodLabel}:
                          </span>
                          <span className="text-sm font-semibold text-black">
                            {request.shipping_method === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                          </span>
                        </div>
                      )}

                      {/* 7. 顧客情報ボックス */}
                      <div className="mb-2 h-12 px-3 py-0 bg-gray-50 border border-gray-100 rounded-lg text-xs box-border grid grid-cols-2 gap-2">
                        <div className="flex flex-col justify-center h-full min-w-0">
                          <span className="text-gray-500 text-[10px] leading-tight">
                            {currentUser?.role === 'customer' && currentUser?.agentCustomerId ? (
                              lang === 'es' ? 'Tu agente:' : 'Seu agente:'
                            ) : (
                              'Cliente:'
                            )}
                          </span>
                          <span className="font-semibold truncate text-black leading-tight">
                            {request.customerName}
                          </span>
                        </div>
                        <div className="flex flex-col justify-center h-full min-w-0">
                          <span className="text-gray-500 text-[10px] leading-tight">
                            {lang === 'es' ? 'Fecha de solicitud:' : 'Data de solicitação:'}
                          </span>
                          <span className="font-semibold truncate text-black leading-tight">
                            {request.createdAt ? formatDateTime(request.createdAt, 'customer') : '-'}
                          </span>
                        </div>
                      </div>

                      {/* 8. 状況（オファー拒否・承認・却下理由などのステータスメッセージ） */}

                      {/* ケース4A: 顧客が管理者のカウンターオファーを却下 */}
                      {request.adminNeedsConfirm && !request.customerCounterOffer && (
                        <div className="h-12 px-3 bg-red-100 border border-red-200 rounded-lg flex items-center shadow-sm mb-2 w-full">
                          <p className="text-xs font-semibold text-red-800">
                            {lang === 'es' ? 'Rechazaste la contraoferta.' : 'Você rejeitou a contraoferta.'}
                          </p>
                        </div>
                      )}

                      {/* ケース4B: 管理者が顧客カウンターオファーを却下時の却下理由 */}
                      {request.status === 'rejected' && request.customerCounterOffer && request.rejectReason && (
                        <div className="h-12 px-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-1.5 shadow-sm mb-2 w-full">
                          <span className="text-xs text-gray-500 font-medium shrink-0">
                            {lang === 'es' ? 'Razón de rechazo:' : 'Razão de rejeição:'}
                          </span>
                          <span className="text-xs font-semibold text-red-600 truncate">
                            {request.rejectReason}
                          </span>
                        </div>
                      )}

                      {/* 却下理由のみ（ケース4A, 4B以外の純粋な却下） */}
                      {request.status === 'rejected' && !request.customerCounterOffer && !request.adminNeedsConfirm && (
                        <div className="h-12 px-3 bg-red-100 border border-red-200 rounded-lg flex items-center text-xs gap-1.5 shadow-sm mb-2 w-full">
                          <span className="text-xs text-gray-500 font-medium">{t.rejectReason}:</span>
                          <span className="text-xs text-red-800 font-semibold truncate">{request.rejectReason || '-'}</span>
                        </div>
                      )}

                      {/* ケース3A: 管理者が顧客のカウンターオファーを承認 */}
                      {request.customerCounterOffer && !request.customerCounterOfferUsed && request.status === 'approved' && !request.finalStatus && (
                        <div className="mb-2 h-12 px-3 bg-green-50 border border-green-100 rounded-lg flex items-center w-full">
                          <p className="text-xs font-semibold text-green-700">
                            {lang === 'es' 
                              ? 'Tu contraoferta fue aceptada. Esperando el resultado de la subasta.' 
                              : 'Sua contraoferta foi aceita. Aguardando o resultado do leilão.'}
                          </p>
                        </div>
                      )}

                      {/* ケース3B & 3C: 顧客が管理者のカウンターオファーを承認 */}
                      {((request.customerCounterOffer && request.customerCounterOfferUsed) || (!request.customerCounterOffer && request.counterOffer)) && request.status === 'approved' && !request.finalStatus && (
                        <div className="mb-2 h-12 px-3 bg-green-50 border border-green-100 rounded-lg flex items-center w-full">
                          <p className="text-xs font-semibold text-green-700">
                            {lang === 'es' ? 'Aceptaste la contraoferta. Esperando el resultado de la subasta.' : 'Você aceitou a contraoferta. Aguardando o resultado do leilão.'}
                          </p>
                        </div>
                      )}

                      {/* 汎用承認完了メッセージ */}
                      {request.status === 'approved' && !request.finalStatus && !request.customerCounterOffer && !request.counterOffer && (
                        <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center w-full">
                          <p className="text-xs font-semibold text-green-600">
                            {lang === 'es' ? 'Esperando resultado de la subasta.' : 'Aguardando o resultado do leilão.'}
                          </p>
                        </div>
                      )}

                      {/* 落札（won）時の落札金額ボックス */}
                      {request.finalStatus === 'won' && !request.customerConfirmed && (
                        <div className="h-12 px-3 bg-green-100 border border-green-200 rounded-lg flex items-center justify-between shadow-sm mb-2 w-full">
                          <span className="text-xs text-gray-500 font-medium">
                            {lang === 'es' ? 'Precio de adjudicación:' : 'Valor de arremate:'}
                          </span>
                          <span className="text-base font-bold text-green-800">
                            {convertUSDToSelectedCurrency(
                              request.finalPrice ||
                              (request.customerCounterOffer && !request.customerCounterOfferUsed ? request.customerCounterOffer : (request.counterOffer || request.maxBid || 0))
                            )}
                          </span>
                        </div>
                      )}

                      {/* 不落札（lost）時のメッセージ */}
                      {request.finalStatus === 'lost' && (
                        <div className="mb-2 h-12 px-3 bg-red-100 border border-red-200 rounded-lg flex items-center text-xs text-red-800 font-semibold shadow-sm w-full">
                          {t.lost}
                        </div>
                      )}


                      {/* 保留中（未処理）の場合のオファー金額変更・削除ボタン */}
                      {request.status === 'pending' && (
                        <div className="flex flex-col gap-2 mb-2 w-full">
                          <button
                            onClick={() => openEditOfferModal(request)}
                            disabled={!!processingOfferId}
                            className="w-full bg-indigo-600 text-white h-12 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {lang === 'es' ? 'Modificar monto de oferta' : 'Modificar valor da oferta'}
                          </button>
                          <button
                            onClick={() => handleDeleteOffer(request.id)}
                            disabled={!!processingOfferId}
                            className="w-full bg-red-100 text-red-600 h-12 rounded-lg hover:bg-red-200 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingOfferId === request.id ? (lang === 'es' ? 'Eliminando...' : 'Excluindo...') : (lang === 'es' ? 'Eliminar oferta' : 'Excluir oferta')}
                          </button>
                        </div>
                      )}

                      {/* 承認済みの場合のオファー金額引き上げ（増額）ボタン ＆ 削除ボタン */}
                      {request.status === 'approved' && !request.finalStatus && (() => {
                        const isWithin15Mins = request.productEndTime
                          ? (() => {
                              const endDate = parseDbDateTime(request.productEndTime) || parseJstDateTime(request.productEndTime);
                              if (!endDate) return false;
                              return (endDate.getTime() - Date.now()) < (15 * 60 * 1000);
                            })()
                          : false;

                        const isWithin12Hours = request.productEndTime
                          ? (() => {
                              const endDate = parseDbDateTime(request.productEndTime) || parseJstDateTime(request.productEndTime);
                              if (!endDate) return false;
                              return (endDate.getTime() - Date.now()) < (12 * 60 * 60 * 1000);
                            })()
                          : false;

                        return (
                          <div className="flex flex-col gap-2 mb-2 w-full">
                            <button
                              onClick={() => openEditOfferModal(request)}
                              disabled={isWithin15Mins || !!processingOfferId}
                              className="w-full bg-indigo-600 text-white h-12 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isWithin15Mins
                                ? (lang === 'es' ? '🔒 No se puede modificar (Fin cercano)' : '🔒 Não é possível alterar (Fim próximo)')
                                : (lang === 'es' ? '⤴️ Aumentar monto de oferta' : '⤴️ Aumentar valor da oferta')}
                            </button>
                            <button
                              onClick={() => handleDeleteOffer(request.id)}
                              disabled={isWithin12Hours || !!processingOfferId}
                              className="w-full bg-red-100 text-red-600 h-12 rounded-lg hover:bg-red-200 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingOfferId === request.id 
                                ? (lang === 'es' ? 'Eliminando...' : 'Excluindo...') 
                                : (isWithin12Hours
                                    ? (lang === 'es' ? '🔒 No se puede eliminar (<12h)' : '🔒 Não é possível excluir (<12h)')
                                    : (lang === 'es' ? 'Eliminar oferta' : 'Excluir oferta'))}
                            </button>
                          </div>
                        );
                      })()}

                      {/* --- 3. アクションボタンの表示 --- */}

                      {/* 却下状態（ケース4A, 4B以外の純粋な却下）の確認ボタン */}
                      {request.status === 'rejected' && !request.customerCounterOffer && !request.adminNeedsConfirm && (
                        <button
                          onClick={() => confirmRejection(request.id)}
                          disabled={!!processingOfferId}
                          className="w-full bg-red-600 text-white h-12 rounded-lg hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingOfferId === request.id ? (lang === 'es' ? 'Eliminando...' : 'Excluindo...') : t.deleteCard}
                        </button>
                      )}

                      {/* ケース1の承認・カウンター・却下ボタン */}
                      {request.counterOffer && request.status === 'counter_offer' && !request.customerCounterOffer && !request.adminNeedsConfirm && (
                        <div className="flex flex-col gap-2 w-full mb-2">
                          <button
                            onClick={() => handleCounterOfferResponse(request.id, 'accept')}
                            disabled={!!processingOfferId}
                            className="w-full bg-green-600 text-white h-12 rounded-lg font-semibold hover:bg-green-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingOfferId === request.id ? (lang === 'es' ? 'Procesando...' : 'Processando...') : t.accept}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRequestForCounter(request);
                              setShowCounterModal(true);
                            }}
                            disabled={!!processingOfferId}
                            className="w-full bg-blue-600 text-white h-12 rounded-lg font-semibold hover:bg-blue-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {t.counterOfferAction}
                          </button>
                          <button
                            onClick={() => handleCounterOfferResponse(request.id, 'reject')}
                            disabled={!!processingOfferId}
                            className="w-full bg-red-600 text-white h-12 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingOfferId === request.id ? (lang === 'es' ? 'Procesando...' : 'Processando...') : t.reject}
                          </button>
                        </div>
                      )}

                      {/* ケース4Aの却下確認ボタン */}
                      {request.adminNeedsConfirm && !request.customerCounterOffer && (
                        <button
                          onClick={() => confirmRejection(request.id)}
                          disabled={!!processingOfferId}
                          className="w-full bg-red-600 text-white h-12 rounded-lg hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingOfferId === request.id ? (lang === 'es' ? 'Eliminando...' : 'Excluindo...') : t.deleteCard}
                        </button>
                      )}

                      {/* ケース4Bのアクションボタン */}
                      {request.status === 'rejected' && request.customerCounterOffer && !request.customerCounterOfferUsed && (
                        <div className="flex flex-col gap-2 w-full mb-2">
                          <button
                            onClick={() => handleCounterOfferResponse(request.id, 'accept')}
                            disabled={!!processingOfferId}
                            className="w-full bg-green-600 text-white h-12 rounded-lg font-semibold hover:bg-green-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingOfferId === request.id ? (lang === 'es' ? 'Procesando...' : 'Processando...') : t.accept}
                          </button>
                          <button
                            onClick={() => handleCounterOfferResponse(request.id, 'reject')}
                            disabled={!!processingOfferId}
                            className="w-full bg-red-600 text-white h-12 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingOfferId === request.id ? (lang === 'es' ? 'Procesando...' : 'Processando...') : t.reject}
                          </button>
                        </div>
                      )}

                      {/* ケース4B拒否完了後の削除ボタン */}
                      {request.status === 'rejected' && request.customerCounterOffer && request.customerCounterOfferUsed && (
                        <button
                          onClick={() => confirmRejection(request.id)}
                          disabled={!!processingOfferId}
                          className="w-full bg-red-600 text-white h-12 rounded-lg hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingOfferId === request.id ? (lang === 'es' ? 'Eliminando...' : 'Excluindo...') : t.deleteCard}
                        </button>
                      )}

                      {/* 落札（won）時の確認ボタン */}
                      {request.finalStatus === 'won' && !request.customerConfirmed && (
                        <button
                          onClick={() => handleFinalStatusConfirm(request.id)}
                          disabled={!!processingOfferId}
                          className="w-full bg-green-600 text-white h-12 rounded-lg hover:bg-green-700 transition text-sm sm:text-base flex items-center justify-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingOfferId === request.id ? (lang === 'es' ? 'Confirmando...' : 'Confirmando...') : t.confirm}
                        </button>
                      )}

                      {/* 不落札（lost）時の確認ボタン */}
                      {request.finalStatus === 'lost' && (
                        <button
                          onClick={() => handleFinalStatusConfirm(request.id)}
                          disabled={!!processingOfferId}
                          className="w-full bg-red-600 text-white h-12 rounded-lg hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingOfferId === request.id ? (lang === 'es' ? 'Eliminando...' : 'Excluindo...') : t.deleteCard}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )
        ) : activeTab === 'purchased' ? (
          <>
            {/* 上部ヘッダー（フィルター等）の個別カード化 */}
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 font-sans">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">{t.purchasedItems}</h2>

              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">{t.filterByCustomer}:</span>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">{t.allCustomers}</option>
                    {getCustomerList().map(customerName => (
                      <option key={customerName} value={customerName}>
                        {customerName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">
                    {lang === 'es' ? 'Período:' : 'Período:'}
                  </span>
                  <div className="flex gap-2 w-full">
                    <select
                      value={purchasedYear}
                      onChange={(e) => setPurchasedYear(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">{lang === 'es' ? 'Año' : 'Ano'}</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                      <option value="2028">2028</option>
                      <option value="2029">2029</option>
                      <option value="2030">2030</option>
                    </select>
                    <select
                      value={purchasedMonth}
                      onChange={(e) => setPurchasedMonth(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">{lang === 'es' ? 'Mes' : 'Mês'}</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString()}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

            {/* WhatsApp 支払い証明書送信ボタン */}
            <div className="mb-6">
              <a
                href="https://wa.me/5518996686059"
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
                <span className={lang === 'pt' ? 'text-sm' : ''}>
                  {lang === 'es' ? 'Enviar comprobante de pago' : 'Enviar comprovante de pagamento'}
                </span>
              </a>
            </div>

            {/* 未払い合計金額サマリー */}
            {purchasedItems.length > 0 && (() => {
              const filteredItemsForSummary = getFilteredPurchasedItems();
              const isB001 = currentUser?.customerId === 'B001';

              // 各アイテムの合計売価を算出するヘルパー関数
              const getItemPrice = (item: any) => {
                return Math.round(
                  item.finalPrice ||
                  (item.customerCounterOffer && !item.customerCounterOfferUsed
                    ? item.customerCounterOffer
                    : (item.counterOffer || item.maxBid || 0))
                );
              };

              const summaryTotal = filteredItemsForSummary.reduce((sum, item) => {
                if (item.cancelledAt) return sum;
                const itemPrice = getItemPrice(item);
                const itemSalePrice = itemPrice;
                return sum + itemSalePrice;
              }, 0);

              const localCostTotal = filteredItemsForSummary
                .reduce((sum, item) => {
                  if (item.cancelledAt) return sum;
                  if (item.delivery_location === 'JP') return sum;
                  const localCost = calculateLocalCost(item.delivery_location, item, item.shipping_method);
                  return sum + (typeof localCost === 'number' ? localCost : 0);
                }, 0);

              const unpaidLocalCostTotal = filteredItemsForSummary
                .reduce((sum, item) => {
                  if (item.cancelledAt) return sum;
                  if (item.delivery_location === 'JP') return sum;
                  const localCost = calculateLocalCost(item.delivery_location, item, item.shipping_method);
                  return sum + (item.paid_local ? 0 : (typeof localCost === 'number' ? localCost : 0));
                }, 0);

              if (isB001) {
                // B001関連ユーザーの場合はボックスを表示
                const unpaidBrazilTotalDolar = filteredItemsForSummary
                  .reduce((sum, item) => {
                    if (item.cancelledAt) return sum;
                    if (item.paid_brazil) return sum;
                    const itemPrice = getItemPrice(item);
                    const itemSalePrice = itemPrice;
                    return sum + (itemSalePrice * 0.5);
                  }, 0);
                const unpaidParaguayTotal = filteredItemsForSummary
                  .reduce((sum, item) => {
                    if (item.cancelledAt) return sum;
                    if (item.paid_paraguay) return sum;
                    const itemPrice = getItemPrice(item);
                    const itemSalePrice = itemPrice;
                    return sum + Math.round(itemSalePrice * 0.5);
                  }, 0);
                const unpaidSummaryTotal = unpaidBrazilTotalDolar + unpaidParaguayTotal;

                // ブラジル未入金額（BRL換算）の計算（個々で10の位繰り上げをして合計）
                const brlRate = exchangeRates['BRL'] || 5.6;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const unpaidBrazilTotalBrl = filteredItemsForSummary
                  .reduce((sum, item) => {
                    if (item.cancelledAt) return sum;
                    if (item.paid_brazil) return sum;
                    const itemPrice = getItemPrice(item);
                    const itemSalePrice = itemPrice;
                    const halfPriceBrl = Math.ceil(((itemSalePrice * 0.5) * brlRate) / 5) * 5;
                    return sum + halfPriceBrl;
                  }, 0);

                return (
                  <div className="flex flex-col gap-2">
                    {/* 合計金額（青） */}
                    <div className="bg-white border border-indigo-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-indigo-500 tracking-wider">
                        {lang === 'es' ? 'Monto Total' : 'Valor Total'}
                      </span>
                      <span className="text-base font-black text-indigo-600">
                        $ {Math.round(summaryTotal).toLocaleString('en-US')}
                      </span>
                    </div>

                    {/* 合計未入金額（赤） */}
                    <div className="bg-white border border-red-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-red-500 tracking-wider text-red-600">
                        {lang === 'es' ? 'Monto Pendiente Total' : 'Valor Pendente Total'}
                      </span>
                      <span className="text-base font-black text-red-600">
                        $ {Math.round(unpaidSummaryTotal).toLocaleString('en-US')}
                      </span>
                    </div>

                    {/* 現地費用合計金額 */}
                    <div className="bg-white border border-green-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-gray-500 tracking-wider font-sans">
                        {lang === 'es' ? 'Costo Local Total' : 'Custo Local Total'}
                      </span>
                      <span className="text-base font-black text-black font-sans">
                        $ {Math.round(localCostTotal).toLocaleString('en-US')}
                      </span>
                    </div>

                    {/* 現地費用未入金額 */}
                    <div className="bg-white border border-red-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-red-500 tracking-wider font-sans">
                        {lang === 'es' ? 'Costo Local Pendiente' : 'Custo Local Pendente'}
                      </span>
                      <span className="text-base font-black text-red-600 font-sans">
                        $ {Math.round(unpaidLocalCostTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                  </div>
                );
              } else {
                // 通常ユーザーの場合は従来通りの2つのボックスを表示
                const unpaidSummaryTotal = filteredItemsForSummary
                  .filter(item => !item.paid && !item.cancelledAt)
                  .reduce((sum, item) => sum + getItemPrice(item), 0);

                return (
                  <div className="flex flex-col gap-3">
                    <div className="bg-white border border-indigo-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                        {lang === 'es' ? 'Monto Total' : 'Valor Total'}
                      </span>
                      <span className="text-base font-black text-indigo-600">
                        $ {Math.round(summaryTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="bg-white border border-red-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-red-500 uppercase tracking-wider">
                        {lang === 'es' ? 'Monto Pendiente' : 'Valor Pendente'}
                      </span>
                      <span className="text-base font-black text-red-600">
                        $ {Math.round(unpaidSummaryTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    {/* 現地費用合計金額 */}
                    <div className="bg-white border border-green-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-gray-500 tracking-wider font-sans">
                        {lang === 'es' ? 'Costo Local Total' : 'Custo Local Total'}
                      </span>
                      <span className="text-base font-black text-black font-sans">
                        $ {Math.round(localCostTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    {/* 現地費用未入金額 */}
                    <div className="bg-white border border-red-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-red-500 tracking-wider font-sans">
                        {lang === 'es' ? 'Costo Local Pendiente' : 'Custo Local Pendente'}
                      </span>
                      <span className="text-base font-black text-red-600 font-sans">
                        $ {Math.round(unpaidLocalCostTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                  </div>
                );
              }
            })()}
            </div>

            {/* B001傘下顧客・ブラジルエージェント向け Stripe一括決済サマリーカード (集計ボックスと商品カードの間の独立カード) */}
            {isBrlUser && (() => {
              const filteredPurchased = getFilteredPurchasedItems();
              const unpaidItems = filteredPurchased.filter(item => !item.paid && !item.cancelledAt);
              const selectedItems = unpaidItems.filter(item => selectedBrlItemIds.includes(item.id));
              const totalUsd = selectedItems.reduce((sum, item) => {
                const price = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0));
                return sum + price;
              }, 0);
              const brlRate = (exchangeRates && exchangeRates['BRL']) ? exchangeRates['BRL'] : 5.65;

              // BRL金額算出：個々のアイテムを5の位で繰り上げて合計
              const totalBrl = selectedItems.reduce((sum, item) => {
                const price = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0));
                return sum + Math.ceil((price * brlRate) / 5) * 5;
              }, 0);

              const allSelected = unpaidItems.length > 0 && selectedItems.length === unpaidItems.length;

              const formatBrlCurrency = (val: number) => {
                return val.toLocaleString('pt-BR');
              };

              const formatUsdCurrency = (val: number) => {
                return Math.round(val).toLocaleString('en-US');
              };

              return (
                <div className="bg-white rounded-xl shadow-md p-4 sm:p-5 mb-6 border border-emerald-200 font-sans">
                  <div className="flex flex-col gap-4">
                    {/* ヘッダー: 全選択/全解除ボタン ＋ 右側に件数表示を1行で配置 */}
                    <div className="flex items-center gap-3 border-b border-gray-100 pb-3 flex-wrap">
                      {unpaidItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) {
                              setSelectedBrlItemIds([]);
                            } else {
                              setSelectedBrlItemIds(unpaidItems.map(i => i.id));
                            }
                          }}
                          className="px-3 py-1.5 border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                        >
                          {allSelected
                            ? (lang === 'es' ? 'Deseleccionar todo' : 'Desmarcar todos')
                            : (lang === 'es' ? 'Seleccionar todo' : 'Selecionar todos')}
                        </button>
                      )}
                      <span className="text-xs font-bold text-gray-600">
                        {selectedItems.length}/{unpaidItems.length} {lang === 'es' ? 'ítems seleccionados' : 'itens selecionados'}
                      </span>
                    </div>

                    {/* 金額表示ブロック (ラベルと金額を同一行・左揃え) */}
                    <div className="flex flex-col gap-2.5 bg-emerald-50/50 p-3.5 rounded-lg border border-emerald-100/80">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          {lang === 'es' ? 'Total Seleccionado (USD)' : 'Total Selecionado (USD)'}
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-indigo-700">
                          $ {formatUsdCurrency(totalUsd)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          {lang === 'es' ? 'Total a Pagar en BRL' : 'Total a Pagar em BRL'}
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-emerald-700">
                          R$ {formatBrlCurrency(totalBrl)}
                        </span>
                      </div>
                    </div>

                    {/* レート表示なし、一括決済ボタン */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={selectedItems.length === 0}
                        onClick={() => setShowBrlBatchPaymentModal(true)}
                        className={`w-full sm:w-auto px-6 py-3 rounded-lg text-sm font-bold shadow-md transition flex items-center justify-center gap-2 ${
                          selectedItems.length > 0
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <span>💳</span>
                        <span>
                          {lang === 'es'
                            ? `Pagar Seleccionados (${selectedItems.length})`
                            : `Pagar Selecionados (${selectedItems.length})`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}


            {purchasedItems.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center font-sans">
                <p className="text-gray-500 text-lg">
                  {lang === 'es' ? 'No hay productos comprados' : 'Não há produtos comprados'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {getFilteredPurchasedItems()
                    .sort((a, b) => new Date(b.confirmedAt || '').getTime() - new Date(a.confirmedAt || '').getTime())
                    .map((item, index) => (
                      <div key={`purchased-${index}-${item.id}`} className="bg-white rounded-lg shadow-md p-3 sm:p-4 border border-gray-100 font-sans">
                        <div className="flex gap-4 mb-2">
                          <div className="relative w-32 h-32 flex-shrink-0">
                            {item.productImage ? (
                              <Image
                                src={item.productImage}
                                alt={item.productTitle}
                                fill
                                unoptimized
                                referrerPolicy="no-referrer"
                                className="object-cover rounded"
                                sizes="128px"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (target && !target.src.includes('customer-icon.png')) {
                                    target.src = '/icons/customer-icon.png';
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border border-gray-200 text-center p-2 text-black">
                                <span className="text-xs font-semibold text-gray-500 font-sans">
                                  {lang === 'es' ? 'Sin foto' : 'Sem foto'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                            {/* 1. 商品タイトル (最大2行) */}
                            <h3 className="text-xs font-semibold line-clamp-2 leading-tight h-[30px] overflow-hidden">{item.productTitle}</h3>

                            {/* 2. 在庫番号表示ボックス (h-7) */}
                            <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center w-full box-border">
                              <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis">
                                <span className="text-gray-500 text-xs font-medium mr-1">
                                  {lang === 'es' ? 'Nº de stock:' : 'Nº de stock:'}
                                </span>
                                <span className="font-semibold text-gray-900 text-xs truncate">{item.stockNumber || '-'}</span>
                              </div>
                            </div>

                            {/* 3. 請求書番号表示ボックス (h-7) */}
                            <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center w-full box-border">
                              <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis">
                                <span className="text-gray-500 text-xs font-medium mr-1">
                                  {lang === 'es' ? 'Nº de factura:' : 'Nº de fatura:'}
                                </span>
                                <span className="font-semibold text-gray-900 text-xs truncate">{item.invoiceNumber || '-'}</span>
                              </div>
                            </div>

                            {/* 4. ヤフオクURLボタン (h-7) */}
                            <div className="w-full">
                              {item.productUrl ? (
                                item.productId?.startsWith('m-') ? (
                                  <a
                                    href={item.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans bg-blue-600"
                                  >
                                    URL
                                  </a>
                                ) : (
                                  <Link
                                    href={`/product/${item.productId}?url=${encodeURIComponent(item.productUrl || '')}&lang=${lang}`}
                                    scroll={false}
                                    onClick={() => {
                                      if (typeof window !== 'undefined') {
                                        saveNavState({
                                          activeTab,
                                          searchType,
                                          categoryHistory,
                                          activeCategoryUrl,
                                          keyword,
                                          searchCondition,
                                          searchPage,
                                          nextPageExists,
                                          products,
                                          scrollY: window.scrollY
                                        });
                                      }
                                    }}
                                    className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans bg-[#ff0033]"
                                  >
                                    {t.viewOnYahoo}
                                  </Link>
                                )
                              ) : (
                                <div className="text-center text-xs text-gray-400 font-bold h-7 bg-gray-100 border border-gray-200 rounded px-2 flex items-center justify-center w-full box-border select-none font-sans">
                                  {lang === 'es' ? 'Sin URL' : 'Sem URL'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 顧客/エージェント情報 & 確認日時のボックス */}
                        {false ? ( // B001エージェント特別表示は廃止し通常表示に統一
                          // B001エージェントログイン時：ID/日時、氏名/エージェント名の表示
                          <div className="mb-2 space-y-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500">ID: <span className="font-bold text-gray-900">{item.customerId || '-'}</span></span>
                              <span className="text-gray-500">
                                {lang === 'es' ? 'Confirmado:' : 'Confirmado:'}{' '}
                                <span className="font-bold text-gray-900">{item.confirmedAt ? formatDateTime(item.confirmedAt || '', 'customer') : '-'}</span>
                              </span>
                            </div>
                            <div className="flex justify-between items-center border-t border-gray-200/50 pt-2">
                              <span className="text-gray-500">
                                {lang === 'es' ? 'Cliente:' : 'Cliente:'}{' '}
                                <span className="font-bold text-gray-900">{item.customerName}</span>
                              </span>
                              <span className="text-gray-500">
                                {lang === 'es' ? 'Agente:' : 'Agente:'}{' '}
                                <span className="font-bold text-gray-900">B001 (FFGN)</span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          // 通常表示 (既存のもの)
                          <div className="mb-2 h-12 px-3 py-0 bg-gray-50 border border-gray-100 rounded-lg text-xs box-border grid grid-cols-2 gap-2">
                            <div className="flex flex-col justify-center h-full min-w-0">
                              <span className="text-gray-500 text-[10px] leading-tight">
                                {currentUser?.role === 'customer' && currentUser?.agentCustomerId ? (
                                  lang === 'es' ? 'Tu agente:' : 'Seu agente:'
                                ) : (
                                  'Cliente:'
                                )}
                              </span>
                              <span className="font-semibold truncate text-black leading-tight">
                                {item.customerName}
                              </span>
                            </div>
                            <div className="flex flex-col justify-center h-full min-w-0">
                              <span className="text-gray-500 text-[10px] leading-tight">
                                {lang === 'es' ? 'Fecha de confirmación:' : 'Data de confirmação:'}
                              </span>
                              <span className="font-semibold truncate text-black leading-tight">
                                {item.confirmedAt ? formatDateTime(item.confirmedAt, 'customer') : '-'}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 支払情報 & 金額ボックス */}
                        {item.customerId === 'B001' && currentUser?.customerId === 'B001' ? (
                          (() => {
                            // finalPrice 等がすでに売価ベースであるため、/ 0.45 の割り戻し計算を撤廃し、DB値をそのまま合計売価とする
                            const totalSalePrice = Math.round(
                              item.finalPrice ||
                              (item.customerCounterOffer && !item.customerCounterOfferUsed
                                ? item.customerCounterOffer
                                : (item.counterOffer || item.maxBid || 0))
                            );
                            const halfPrice = Math.round(totalSalePrice * 0.5); // 分割額 (合計売価 of の50%)

                            // BRL換算
                            const brlRate = exchangeRates['BRL'] || 5.6;
                            const halfPriceBrl = Math.ceil((halfPrice * brlRate) / 5) * 5;

                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const totalStr = totalSalePrice.toLocaleString('en-US');
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const halfStr = halfPrice.toLocaleString('en-US');
                            const halfBrlStr = halfPriceBrl.toLocaleString('en-US').replace(/,/g, '.');

                            // B001自身ログイン時：3つのボックス（合計金額、分割支払、日本送金）
                            // B001本人の購入なら合計売価の100%を送金額とする
                            const japanSendAmount = totalSalePrice;

                            return (
                              <div className="space-y-2 mb-2 font-sans">
                                {/* 1段目: 合計支払額ボックス (h-12) */}
                                <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 font-sans text-xs">
                                    <span className="text-gray-500 font-bold">{lang === 'es' ? 'Monto Total:' : 'Valor Total:'}</span>
                                    <div className="flex flex-col gap-0.5">
                                      {item.paid ? (
                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] rounded-full whitespace-nowrap font-sans">
                                          ✓ {lang === 'es' ? 'Pago' : 'Pago'}
                                        </span>
                                      ) : !item.cancelledAt ? (
                                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap font-sans">
                                          {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                        </span>
                                      ) : null}
                                      {item.cancelledAt && (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] rounded-full whitespace-nowrap font-bold font-sans">
                                          ✗ {lang === 'es' ? 'Cancelado' : 'Cancelado'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-base font-bold whitespace-nowrap ${item.cancelledAt || item.paid ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>
                                    {convertUSDToSelectedCurrency(totalSalePrice)}
                                  </span>
                                </div>

                                {/* 2. 分割支払ボックス (1つのボックスにまとめる) */}
                                <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg space-y-2.5">
                                  {/* ブラジル支払額 */}
                                  <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-500">{lang === 'es' ? 'Monto en 🇧🇷:' : 'Valor no 🇧🇷:'}</span>
                                      {item.paid_brazil ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                          ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_brazil_at ? ` ${formatDateTime(item.paid_brazil_at, 'customer')}` : ''}
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                          {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-sm ${item.cancelledAt || item.paid_brazil ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                                      R$ {halfBrlStr}
                                    </span>
                                  </div>

                                  {/* パラグアイ支払額 */}
                                  <div className="flex items-center justify-between text-xs font-bold text-gray-700 border-t border-gray-200/50 pt-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-500">{lang === 'es' ? 'Monto en 🇵🇾:' : 'Valor no 🇵🇾:'}</span>
                                      {item.paid_paraguay ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                          ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_paraguay_at ? ` ${formatDateTime(item.paid_paraguay_at, 'customer')}` : ''}
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full whitespace-nowrap">
                                          {lang === 'es' ? 'En Paraguay' : 'No Paraguai'}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-sm ${item.cancelledAt || item.paid_paraguay ? 'text-gray-400 line-through' : 'text-amber-600'}`}>
                                      {convertUSDToSelectedCurrency(halfPrice)}
                                    </span>
                                  </div>
                                </div>

                                {/* 3. 日本送金ボックス (h-12) */}
                                <div className="h-12 px-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between">
                                  <span className="text-red-600 font-black text-xs">{lang === 'es' ? 'Envío a Japón' : 'Envio ao Japão'} 🇯🇵:</span>
                                  <span className="text-red-600 font-black text-base">
                                    {convertUSDToSelectedCurrency(japanSendAmount)}
                                  </span>
                                </div>

                                {/* 商品渡し場所 */}
                                <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                                  <span className="text-gray-500 text-xs font-bold">{lang === 'es' ? 'Lugar de Entrega:' : 'Local de Entrega:'}</span>
                                  <span className="text-sm font-semibold text-black">
                                    {getDeliveryLocationName(item.delivery_location)}
                                  </span>
                                </div>

                                {/* 現地費用 */}
                                {item.delivery_location !== 'JP' && (() => {
                                  const localCost = calculateLocalCost(item.delivery_location, item, item.shipping_method);
                                  const isStringCost = typeof localCost === 'string';
                                  if (isStringCost) {
                                    return (
                                      <>
                                        <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center">
                                          <span className="text-sm font-black text-red-600 tracking-wide">
                                            {formatLocalCost(localCost)}
                                          </span>
                                        </div>
                                        {/* 発送方法 */}
                                        <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                                          <span className="text-gray-500 text-xs font-bold">
                                            {t.shippingMethodLabel}:
                                          </span>
                                          <span className="text-sm font-semibold text-black">
                                            {item.shipping_method === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                                          </span>
                                        </div>
                                      </>
                                    );
                                  }
                                  return (
                                    <>
                                      <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-gray-500 text-xs font-bold">{lang === 'es' ? 'Costo Local:' : 'Custo Local:'}</span>
                                          {item.paid_local ? (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                              ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_local_at ? ` ${formatDateTime(item.paid_local_at, 'customer')}` : ''}
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                              {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                            </span>
                                          )}
                                        </div>
                                        <span className={`text-base font-bold ${item.cancelledAt || item.paid_local ? 'text-gray-400 line-through' : 'text-black'}`}>
                                          {formatLocalCost(localCost)}
                                        </span>
                                      </div>
                                      {/* 発送方法 */}
                                      <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                                        <span className="text-gray-500 text-xs font-bold">
                                          {t.shippingMethodLabel}:
                                        </span>
                                        <span className="text-sm font-semibold text-black">
                                          {item.shipping_method === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                                        </span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            );
                          })()
                        ) : (
                          // 通常の表示
                          <>
                            <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                              <div className="flex flex-col gap-0.5">
                                {item.cancelledAt ? (
                                  <>
                                    {item.paid && item.paidAt && (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold rounded-full whitespace-nowrap shrink-0 font-sans w-fit">
                                        ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paidAt ? ` ${formatDateTime(item.paidAt, 'customer')}` : ''}
                                      </span>
                                    )}
                                    <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded-full whitespace-nowrap shrink-0 font-sans w-fit font-bold font-sans">
                                      ✗ {lang === 'es' ? 'Cancelado' : 'Cancelado'}{item.cancelledAt ? ` ${formatDateTime(item.cancelledAt, 'customer')}` : ''}
                                    </span>
                                  </>
                                ) : !item.paid ? (
                                  (isBrlUser || item.agentCustomerId === 'B001' || currentUser?.agentCustomerId === 'B001' || (currentUser?.customerId?.startsWith('A') && (((currentUser?.country || '').toLowerCase() === 'brasil') || ((currentUser?.country || '').toLowerCase() === 'brazil')))) ? (
                                    <label className={`flex items-center gap-2 cursor-pointer select-none py-1.5 px-3 rounded-lg border transition-all shadow-sm ${
                                      selectedBrlItemIds.includes(item.id)
                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-extrabold'
                                        : 'bg-white border-gray-300 hover:border-emerald-400 text-gray-700'
                                    }`}>
                                      <input
                                        type="checkbox"
                                        checked={selectedBrlItemIds.includes(item.id)}
                                        onChange={() => toggleBrlItemSelection(item.id)}
                                        className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                                      />
                                      <span className="text-xs font-bold font-sans whitespace-nowrap">
                                        {selectedBrlItemIds.includes(item.id)
                                          ? (lang === 'es' ? 'Seleccionado para Pagar' : 'Selecionado para Pagamento')
                                          : (lang === 'es' ? 'Seleccionar para Pagar' : 'Selecionar para Pagamento')}
                                      </span>
                                    </label>
                                  ) : (
                                    <button
                                      onClick={() => openPaymentModal(item)}
                                      className="text-center text-xs text-white font-bold py-1.5 bg-green-600 hover:bg-green-700 rounded px-3 transition shadow-sm font-sans flex items-center justify-center"
                                    >
                                      {lang === 'es' ? 'Método de Pago' : 'Método de Pagamento'}
                                    </button>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold rounded-full whitespace-nowrap shrink-0 font-sans">
                                    ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paidAt ? ` ${formatDateTime(item.paidAt, 'customer')}` : ''}
                                  </span>
                                )}
                              </div>
                              
                               <span className={`text-base font-bold whitespace-nowrap font-sans ${item.cancelledAt || item.paid ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                                {convertUSDToSelectedCurrency(
                                  item.finalPrice ||
                                  (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0))
                                )}
                              </span>
                            </div>

                            {/* 商品渡し場所 */}
                            <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                              <span className="text-gray-500 text-xs font-bold">{lang === 'es' ? 'Lugar de Entrega:' : 'Local de Entrega:'}</span>
                              <span className="text-sm font-semibold text-black">
                                {getDeliveryLocationName(item.delivery_location)}
                              </span>
                            </div>

                            {/* 現地費用 */}
                            {item.delivery_location !== 'JP' && (() => {
                              const localCost = calculateLocalCost(item.delivery_location, item, item.shipping_method);
                              const isStringCost = typeof localCost === 'string';
                              if (isStringCost) {
                                return (
                                  <>
                                    <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center font-sans">
                                      <span className="text-sm font-black text-red-600 tracking-wide">
                                        {formatLocalCost(localCost)}
                                      </span>
                                    </div>
                                    {/* 発送方法 */}
                                    <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                                      <span className="text-gray-500 text-xs font-bold">
                                        {t.shippingMethodLabel}:
                                      </span>
                                      <span className="text-sm font-semibold text-black">
                                        {item.shipping_method === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                                      </span>
                                    </div>
                                  </>
                                );
                              }
                              return (
                                <>
                                  <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-500 text-xs font-bold">{lang === 'es' ? 'Costo Local:' : 'Custo Local:'}</span>
                                      {item.paid_local ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                          ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_local_at ? ` ${formatDateTime(item.paid_local_at, 'customer')}` : ''}
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                          {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-base font-bold ${item.paid_local ? 'text-gray-400 line-through' : 'text-black'}`}>
                                      {formatLocalCost(localCost)}
                                    </span>
                                  </div>
                                  {/* 発送方法 */}
                                  <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                                    <span className="text-gray-500 text-xs font-bold">
                                      {t.shippingMethodLabel}:
                                    </span>
                                    <span className="text-sm font-semibold text-black">
                                      {item.shipping_method === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                                    </span>
                                  </div>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    ))}
                </div>


              </>
            )}
          </>
        ) : activeTab === 'deposits' ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 font-sans">
            <h2 className="text-xl sm:text-2xl font-bold mb-6">{t.depositsTab}</h2>

            <div className="flex flex-col gap-4 mb-6">
              {/* 期間フィルター（年・月） */}
              <div className="flex flex-col gap-1 w-full">
                <span className="text-sm font-semibold text-gray-600">
                  {lang === 'es' ? 'Período' : 'Período'}:
                </span>
                <div className="flex gap-2 w-full">
                  <select
                    value={depositFilterYear}
                    onChange={(e) => setDepositFilterYear(e.target.value)}
                    className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">{lang === 'es' ? 'Año' : 'Ano'}</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                    <option value="2029">2029</option>
                    <option value="2030">2030</option>
                  </select>
                  <select
                    value={depositFilterMonth}
                    onChange={(e) => setDepositFilterMonth(e.target.value)}
                    className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">{lang === 'es' ? 'Mes' : 'Mês'}</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m.toString()}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* WhatsApp 支払い証明書送信ボタン */}
              <a
                href="https://wa.me/5518996686059"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold rounded-lg shadow-md transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
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
                <span className={lang === 'pt' ? 'text-sm' : ''}>
                  {lang === 'es' ? 'Enviar comprobante de pago' : 'Enviar comprovante de pagamento'}
                </span>
              </a>
            </div>

            {/* 保証金・入金および残高の集計サマリーボックス */}
            {(() => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const isB001 = currentUser?.customerId === 'B001' || currentUser?.agentCustomerId === 'B001';
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const isBrasilAgent = currentUser?.customerId?.startsWith('A') && 
                ((currentUser?.country || '').trim().toLowerCase() === 'brasil' || 
                 (currentUser?.country || '').trim().toLowerCase() === 'brazil');

              // 各アイテムの合計売価を算出する共通ヘルパー
              const getItemPrice = (item: any) => {
                return Math.round(
                  item.finalPrice ||
                  (item.customerCounterOffer && !item.customerCounterOfferUsed
                    ? item.customerCounterOffer
                    : (item.counterOffer || item.maxBid || 0))
                );
              };

              // 通算入金USD (商品代金のみ)
              const totalDepositsUsd = depositsList
                .filter(item => item.deposit_type === '商品代金' || !item.deposit_type)
                .reduce((sum, item) => {
                  const isBrl = item.payment_method?.endsWith('_brl');
                  return sum + (isBrl ? (item.usd_amount || 0) : (item.amount || 0));
                }, 0);

              // 通算入金USD (現地費用のみ)
              const totalLocalCostDepositsUsd = depositsList
                .filter(item => item.deposit_type === '現地費用')
                .reduce((sum, item) => {
                  const isBrl = item.payment_method?.endsWith('_brl');
                  return sum + (isBrl ? (item.usd_amount || 0) : (item.amount || 0));
                }, 0);

              // 通算購入USD
              let totalPurchasedUsd = 0;
              purchasedItems.forEach(item => {
                if (item.cancelledAt) return;
                const cost = getItemPrice(item);
                const totalSalePrice = Math.round(cost);
                totalPurchasedUsd += totalSalePrice;
              });

              const balanceUsd = totalDepositsUsd - totalPurchasedUsd;
              const isNegativeUsd = balanceUsd < 0;

              // フィルターされた入金の合計 (商品代金のみ)
              const filteredDepositsTotalUsd = getFilteredDeposits()
                .filter(item => item.deposit_type === '商品代金' || !item.deposit_type)
                .reduce((sum, item) => {
                  const isBrl = item.payment_method?.endsWith('_brl');
                  return sum + (isBrl ? (item.usd_amount || 0) : (item.amount || 0));
                }, 0);

              // フィルターされた入金の合計 (現地費用のみ)
              const filteredDepositsTotalLocalCostUsd = getFilteredDeposits()
                .filter(item => item.deposit_type === '現地費用')
                .reduce((sum, item) => {
                  const isBrl = item.payment_method?.endsWith('_brl');
                  return sum + (isBrl ? (item.usd_amount || 0) : (item.amount || 0));
                }, 0);

              // フィルターされた購入商品の現地費用合計・未入金計算
              const targetPurchasedForLocalCost = purchasedItems.filter(item => {
                if (item.cancelledAt) return false;
                if (depositFilterYear !== 'all') {
                  if (!item.confirmedAt) return false;
                  const date = new Date(item.confirmedAt);
                  if (date.getFullYear().toString() !== depositFilterYear) return false;
                }
                if (depositFilterMonth !== 'all') {
                  if (!item.confirmedAt) return false;
                  const date = new Date(item.confirmedAt);
                  if ((date.getMonth() + 1).toString() !== depositFilterMonth) return false;
                }
                return true;
              });

              const localCostTotal = targetPurchasedForLocalCost.reduce((sum, item) => {
                if (item.delivery_location === 'JP') return sum;
                const cost = calculateLocalCost(item.delivery_location, item, item.shipping_method);
                return sum + (typeof cost === 'number' ? cost : 0);
              }, 0);

              const formattedBalanceUsd = isNegativeUsd
                ? `- $ ${Math.abs(Math.round(balanceUsd)).toLocaleString('en-US')}`
                : `$ ${Math.round(balanceUsd).toLocaleString('en-US')}`;

              const localCostBalanceUsd = totalLocalCostDepositsUsd - localCostTotal;
              const isLocalCostNegativeUsd = localCostBalanceUsd < 0;
              const formattedLocalCostBalanceUsd = isLocalCostNegativeUsd
                ? `- $ ${Math.abs(Math.round(localCostBalanceUsd)).toLocaleString('en-US')}`
                : `$ ${Math.round(localCostBalanceUsd).toLocaleString('en-US')}`;

              return (
                <div className="flex flex-col gap-3 mb-6 font-sans">
                  {/* 合計金額 USD */}
                  <div className="bg-white border border-indigo-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                    <span className="text-xs font-bold text-indigo-500 tracking-wider">
                      {lang === 'es' ? 'Total USD' : 'Total USD'}
                    </span>
                    <span className="text-base font-black text-indigo-600">
                      $ {Math.round(filteredDepositsTotalUsd).toLocaleString('en-US')}
                    </span>
                  </div>

                  {/* 残高 USD */}
                  <div className={`bg-white border ${isNegativeUsd ? 'border-red-100' : 'border-green-100'} rounded-lg h-12 px-3 flex items-center justify-between shadow-sm`}>
                    <span className={`text-xs font-bold ${isNegativeUsd ? 'text-red-500' : 'text-green-500'} tracking-wider`}>
                      {lang === 'es' ? 'Saldo USD' : 'Saldo USD'}
                    </span>
                    <span className={`text-base font-black ${isNegativeUsd ? 'text-red-600' : 'text-green-600'}`}>
                      {formattedBalanceUsd}
                    </span>
                  </div>

                  {/* 現地費用合計金額 USD */}
                  <div className="bg-white border border-green-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                    <span className="text-xs font-bold text-gray-500 tracking-wider">
                      {lang === 'es' ? 'Costo Local Total USD' : 'Custo Local Total USD'}
                    </span>
                    <span className="text-base font-black text-black font-sans">
                      $ {Math.round(filteredDepositsTotalLocalCostUsd).toLocaleString('en-US')}
                    </span>
                  </div>

                  {/* 現地費用残高 USD */}
                  <div className={`bg-white border ${isLocalCostNegativeUsd ? 'border-red-100' : 'border-green-100'} rounded-lg h-12 px-3 flex items-center justify-between shadow-sm`}>
                    <span className={`text-xs font-bold ${isLocalCostNegativeUsd ? 'text-red-500' : 'text-green-500'} tracking-wider`}>
                      {lang === 'es' ? 'Saldo Costo Local USD' : 'Saldo Custo Local USD'}
                    </span>
                    <span className={`text-base font-black ${isLocalCostNegativeUsd ? 'text-red-600' : 'text-green-600'}`}>
                      {formattedLocalCostBalanceUsd}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* 入金履歴一覧リスト */}
            {loadingDeposits ? (
              <div className="text-center py-12 text-gray-500">
                {lang === 'es' ? 'Cargando...' : 'Carregando...'}
              </div>
            ) : getFilteredDeposits().length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                {lang === 'es' ? 'No hay información de depósitos.' : 'Não há informações de depósitos.'}
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        {t.date}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        {lang === 'es' ? 'Moneda' : 'Moeda'}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        {lang === 'es' ? 'Monto' : 'Valor'}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        {lang === 'es' ? 'Concepto' : 'Conceito'}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        {lang === 'es' ? 'Método' : 'Método'}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        USD
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        {lang === 'es' ? 'Recibo' : 'Recibo'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {getFilteredDeposits().map((item) => {
                      const parts = (item.deposit_date || '').split('-');
                      const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : (item.deposit_date || '').replace(/-/g, '/');
                      const paymentMethodNames: Record<string, string> = {
                        bank: 'Banco',
                        paypal: 'PayPal',
                        usdt: 'USDT',
                        card: lang === 'es' ? 'Tarjeta' : 'Cartão',
                        card_brl: lang === 'es' ? 'Tarjeta (BRL)' : 'Cartão (BRL)',
                        pix: 'PIX',
                        pix_brl: 'PIX',
                        cash: lang === 'es' ? 'Efectivo' : 'Dinheiro',
                        cash_brl: lang === 'es' ? 'Efectivo (BRL)' : 'Dinheiro (BRL)',
                        asaas_pix: 'PIX',
                        asaas_credit_card: lang === 'es' ? 'Tarjeta' : 'Cartão'
                      };
                      const isBrl = item.payment_method?.includes('_brl') || item.payment_method?.startsWith('asaas_');
                      const formatBrl = (amount: number) => {
                        const formatted = amount.toFixed(2);
                        const [integerPart, decimalPart] = formatted.split('.');
                        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                        return `${formattedInteger},${decimalPart}`;
                      };
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition text-black">
                          <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-gray-700">
                            {dateFormatted}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-bold">
                            {isBrl ? 'BRL' : 'USD'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-green-600">
                            {isBrl ? `R$ ${formatBrl(Number(item.amount))}` : `$ ${Number(item.amount).toLocaleString('en-US')}`}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                            {item.deposit_type === '現地費用' ? (lang === 'es' ? 'Costo Local' : 'Custo Local') : (lang === 'es' ? 'Producto' : 'Produto')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                            {paymentMethodNames[item.payment_method] || item.payment_method}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap font-bold text-indigo-600 ${(!isBrl || !item.usd_amount) ? 'text-center' : 'text-right'}`}>
                            {isBrl ? (item.usd_amount ? `$ ${Number(item.usd_amount).toLocaleString('en-US')}` : '-') : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {item.receipt_url ? (
                              <a 
                                href={item.receipt_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition"
                                title={lang === 'es' ? 'Descargar Recibo' : 'Baixar Recibo'}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </a>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'shipping' ? (
          <>
            {/* 上部ヘッダー（フィルター等）の個別カード化 */}
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 font-sans text-left text-black">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">{t.shippingTab}</h2>

              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">{t.filterByCustomer}:</span>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">{t.allCustomers}</option>
                    {getCustomerList().map(customerName => (
                      <option key={customerName} value={customerName}>
                        {customerName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">
                    {lang === 'es' ? 'Período:' : 'Período:'}
                  </span>
                  <div className="flex gap-2 w-full">
                    <select
                      value={purchasedYear}
                      onChange={(e) => setPurchasedYear(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">{lang === 'es' ? 'Año' : 'Ano'}</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                      <option value="2028">2028</option>
                      <option value="2029">2029</option>
                      <option value="2030">2030</option>
                    </select>
                    <select
                      value={purchasedMonth}
                      onChange={(e) => setPurchasedMonth(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">{lang === 'es' ? 'Mes' : 'Mês'}</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString()}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">
                    {lang === 'es' ? 'Estado de envío:' : 'Status de envio:'}
                  </span>
                  <select
                    value={shippingStatusFilter}
                    onChange={(e) => setShippingStatusFilter(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">
                      {lang === 'es' ? 'Todos los estados' : 'Todos os status'}
                    </option>
                    <option value="not_shipped">
                      {lang === 'es' ? 'No enviado' : 'Não enviado'}
                    </option>
                    <option value="arrived_jp">
                      {lang === 'es' ? 'Llegado al almacén de Japón' : 'Chegou ao armazém do Japão'}
                    </option>
                    <option value="in_transit">
                      {lang === 'es' ? 'En tránsito' : 'Em trânsito'}
                    </option>
                    <option value="arrived_local">
                      {lang === 'es' ? 'Llegado al destino' : 'Chegou ao destino'}
                    </option>
                    <option value="ready_for_delivery">
                      {lang === 'es' ? 'Listo para retiro' : 'Pronto para retirada'}
                    </option>
                    <option value="delivered">
                      {lang === 'es' ? 'Entregado' : 'Entregue'}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {getFilteredPurchasedItems().length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500 font-sans text-left">
                <p>{lang === 'es' ? 'No hay información de envío.' : 'Não há informações de envio.'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {getFilteredPurchasedItems()
                  .sort((a, b) => new Date(b.confirmedAt || '').getTime() - new Date(a.confirmedAt || '').getTime())
                  .map((item) => {
                    const cost = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                      ? item.customerCounterOffer
                      : (item.counterOffer || item.maxBid || 0));
                    const totalSalePrice = Math.round(cost || 0);
                    const brlRate = exchangeRates['BRL'] || 5.6;
                    const paidBrazilBrl = Math.ceil(((totalSalePrice * 0.5) * brlRate) / 5) * 5;
                    const paidParaguayUsd = Math.round(totalSalePrice * 0.5);
                    const japanSendAmount = item.japan_send_usd ?? calculateJapanSendAmount(item, totalSalePrice, exchangeRates['JPY'] || exchangeRate || 150);

                    const halfBrlStr = paidBrazilBrl.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                    const halfPrice = paidParaguayUsd;

                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const isB001Linked = item.agentCustomerId === 'B001';
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const isB001Self = item.customerId === 'B001';
                    const countryLower = (item.customerCountry || '').trim().toLowerCase();
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const isBrasilAgent = item.customerId?.startsWith('A') && (countryLower === 'brasil' || countryLower === 'brazil');

                    const getStatusLabel = (status?: string) => {
                      switch (status) {
                        case 'arrived_jp': return lang === 'es' ? 'Llegado al almacén de Japón' : 'Chegou ao armazém do Japão';
                        case 'in_transit': return lang === 'es' ? 'En tránsito' : 'Em trânsito';
                        case 'arrived_local': return lang === 'es' ? 'Llegado al destino' : 'Chegou ao destino';
                        case 'ready_for_delivery': return lang === 'es' ? 'Listo para retiro' : 'Pronto para retirada';
                        case 'delivered': return lang === 'es' ? 'Entregado' : 'Entregue';
                        default: return lang === 'es' ? 'No enviado' : 'Não enviado';
                      }
                    };

                    const shippingStatus = item.shippingStatus || 'not_shipped';
                    const isDetailVisible = ['in_transit', 'arrived_local', 'ready_for_delivery', 'delivered'].includes(shippingStatus);
                    
                    const arrivalDateLabel = shippingStatus === 'delivered' ? (lang === 'es' ? 'Fecha de entrega' : 'Data de entrega') :
                      ['arrived_local', 'ready_for_delivery'].includes(shippingStatus) ? (lang === 'es' ? 'Fecha de llegada' : 'Data de chegada') : (lang === 'es' ? 'Fecha estimada de llegada' : 'Data estimada de chegada');

                    const localCost = calculateLocalCost(item.delivery_location, item, item.shipping_method);

                    return (
                      <div key={item.id} className="bg-white rounded-lg shadow-md p-4 sm:p-6 text-black text-left font-sans">
                        <div className="flex gap-4 mb-3">
                          <div className="relative w-32 h-32 flex-shrink-0">
                            {item.productImage ? (
                              <Image
                                src={item.productImage}
                                alt={item.productTitle}
                                fill
                                unoptimized
                                referrerPolicy="no-referrer"
                                className="object-cover rounded"
                                sizes="128px"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (target && !target.src.includes('customer-icon.png')) {
                                    target.src = '/icons/customer-icon.png';
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border border-gray-200 text-center p-2">
                                <span className="text-xs font-semibold text-gray-500">
                                  {lang === 'es' ? 'Sin foto' : 'Sem foto'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                            <h3 className="text-xs font-semibold line-clamp-2 leading-tight h-[30px] overflow-hidden text-gray-900">{item.productTitle}</h3>

                            <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center justify-between w-full box-border">
                              <span className="text-gray-500 text-xs font-medium">{lang === 'es' ? 'No. de Stock:' : 'Nº de Estoque:'}</span>
                              <span className="font-semibold text-gray-900 text-xs truncate">
                                {item.stockNumber || '-'}
                              </span>
                            </div>

                            <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center justify-between w-full box-border">
                              <span className="text-gray-500 text-xs font-medium">{lang === 'es' ? 'No. de Factura:' : 'Nº da Fatura:'}</span>
                              <span className="font-semibold text-gray-900 text-xs truncate">
                                {item.invoiceNumber || '-'}
                              </span>
                            </div>

                            <div className="w-full">
                              {item.productUrl ? (
                                item.productId?.startsWith('m-') ? (
                                  <a
                                    href={item.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans bg-blue-600"
                                  >
                                    URL
                                  </a>
                                ) : (
                                  <Link
                                    href={`/product/${item.productId}?url=${encodeURIComponent(item.productUrl || '')}&lang=${lang}`}
                                    scroll={false}
                                    onClick={() => {
                                      if (typeof window !== 'undefined') {
                                        saveNavState({
                                          activeTab,
                                          searchType,
                                          categoryHistory,
                                          activeCategoryUrl,
                                          keyword,
                                          searchCondition,
                                          searchPage,
                                          nextPageExists,
                                          products,
                                          scrollY: window.scrollY
                                        });
                                      }
                                    }}
                                    className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans bg-[#ff0033]"
                                  >
                                    {t.viewOnYahoo}
                                  </Link>
                                )
                              ) : (
                                <div className="text-center text-xs text-gray-400 font-bold h-7 bg-gray-100 border border-gray-200 rounded px-2 flex items-center justify-center w-full box-border select-none">
                                  {lang === 'es' ? 'Sin URL' : 'Sem URL'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mb-2">
                          {/* 顧客名と確認日時のボックス */}
                          <div className="h-12 px-3 py-0 bg-gray-50 border border-gray-100 rounded-lg text-xs box-border grid grid-cols-2 gap-2">
                            <div className="flex flex-col justify-center h-full min-w-0">
                              <span className="text-gray-500 text-[10px] leading-tight">
                                {currentUser?.role === 'customer' && currentUser?.agentCustomerId ? (
                                  lang === 'es' ? 'Tu agente:' : 'Seu agente:'
                                ) : (
                                  'Cliente:'
                                )}
                              </span>
                              <span className="font-semibold truncate text-black leading-tight">
                                {item.customerName}
                              </span>
                            </div>
                            <div className="flex flex-col justify-center h-full min-w-0">
                              <span className="text-gray-500 text-[10px] leading-tight">
                                {lang === 'es' ? 'Fecha de confirmación:' : 'Data de confirmação:'}
                              </span>
                              <span className="font-semibold truncate text-black leading-tight">
                                {item.confirmedAt ? formatDateTime(item.confirmedAt, 'customer') : '-'}
                              </span>
                            </div>
                          </div>

                          {item.customerId === 'B001' && currentUser?.customerId === 'B001' ? (
                            <>
                              <div className="h-12 px-3 bg-indigo-50/50 border border-indigo-100 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-indigo-600 font-black text-xs">{lang === 'es' ? 'Monto Total:' : 'Valor Total:'}</span>
                                  {item.paid ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap font-bold">
                                      ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paidAt ? ` ${formatDateTime(item.paidAt, 'customer')}` : ''}
                                    </span>
                                  ) : !item.cancelledAt ? (
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                      {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                    </span>
                                  ) : null}
                                  {item.cancelledAt && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] rounded-full whitespace-nowrap font-bold">
                                      ✗ {lang === 'es' ? 'Cancelado' : 'Cancelado'}
                                    </span>
                                  )}
                                </div>
                                <span className={`text-base font-bold whitespace-nowrap ${item.cancelledAt || item.paid ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>
                                  {convertUSDToSelectedCurrency(totalSalePrice)}
                                </span>
                              </div>

                              <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg space-y-2.5">
                                <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500">{lang === 'es' ? 'Monto en 🇧🇷:' : 'Valor no 🇧🇷:'}</span>
                                    {item.paid_brazil ? (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                        ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_brazil_at ? ` ${formatDateTime(item.paid_brazil_at, 'customer')}` : ''}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                        {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-sm ${item.cancelledAt || item.paid_brazil ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                                    R$ {halfBrlStr}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-xs font-bold text-gray-700 border-t border-gray-200/50 pt-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500">{lang === 'es' ? 'Monto en 🇵🇾:' : 'Valor no 🇵🇾:'}</span>
                                    {item.paid_paraguay ? (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                        ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_paraguay_at ? ` ${formatDateTime(item.paid_paraguay_at, 'customer')}` : ''}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full whitespace-nowrap">
                                        {lang === 'es' ? 'En Paraguay' : 'No Paraguai'}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-sm ${item.cancelledAt || item.paid_paraguay ? 'text-gray-400 line-through' : 'text-amber-600'}`}>
                                    {convertUSDToSelectedCurrency(halfPrice)}
                                  </span>
                                </div>
                              </div>

                              <div className="h-12 px-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between">
                                <span className="text-red-600 font-black text-xs">{lang === 'es' ? 'Envío a Japón' : 'Envio ao Japão'} 🇯🇵:</span>
                                <span className="text-red-600 font-black text-base">
                                  {convertUSDToSelectedCurrency(japanSendAmount)}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500 font-bold text-xs">{lang === 'es' ? 'Monto Total:' : 'Valor Total:'}</span>
                                {item.paid ? (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold rounded-full whitespace-nowrap">
                                    ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paidAt ? ` ${formatDateTime(item.paidAt, 'customer')}` : ''}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full whitespace-nowrap">
                                    {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                  </span>
                                )}
                              </div>
                              <span className={`text-base font-bold whitespace-nowrap ${item.cancelledAt || item.paid ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                                {convertUSDToSelectedCurrency(
                                  item.finalPrice ||
                                  (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0))
                                )}
                              </span>
                            </div>
                          )}

                          <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                            <span className="text-gray-500 text-xs font-bold">{lang === 'es' ? 'Lugar de Entrega:' : 'Local de Entrega:'}</span>
                            <span className="text-sm font-semibold text-black">
                              {getDeliveryLocationName(item.delivery_location)}
                            </span>
                          </div>

                          {item.delivery_location === 'JP' && (
                            <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                              <span className="text-gray-500 text-xs font-bold">{t.shippingStatusLabel}:</span>
                              <span className="text-sm font-semibold text-black">
                                {getStatusLabel(item.shippingStatus)}
                              </span>
                            </div>
                          )}

                          {item.delivery_location !== 'JP' && (
                            <>
                              <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-500 text-xs font-bold">{lang === 'es' ? 'Costo Local:' : 'Custo Local:'}</span>
                                  {item.paid_local ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-full whitespace-nowrap">
                                      ✓ {lang === 'es' ? 'Pagado' : 'Pago'}{item.paid_local_at ? ` ${formatDateTime(item.paid_local_at, 'customer')}` : ''}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                      {lang === 'es' ? 'Pendiente' : 'Pendente'}
                                    </span>
                                  )}
                                </div>
                                <span className={`text-base font-bold ${item.cancelledAt || item.paid_local ? 'text-gray-400 line-through' : 'text-black'}`}>
                                  {formatLocalCost(localCost)}
                                </span>
                              </div>
                              <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                                <span className="text-gray-500 text-xs font-bold">
                                  {t.shippingMethodLabel}:
                                </span>
                                <span className="text-sm font-semibold text-black">
                                  {item.shipping_method === 'air' ? t.shippingMethodAir : t.shippingMethodSea}
                                </span>
                              </div>

                              <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans">
                                <span className="text-gray-500 text-xs font-bold">{t.shippingStatusLabel}:</span>
                                <span className="text-sm font-semibold text-black">
                                  {getStatusLabel(item.shippingStatus)}
                                </span>
                              </div>
                            </>
                          )}

                          {isDetailVisible && (
                            <div className="border border-gray-200 rounded-lg p-2.5 mt-2 bg-gray-50 space-y-2 text-left font-sans text-xs">
                              {/* 上段: 発送日 & 到着予定日 (または到着日/引渡完了日など動的ラベル) */}
                              <div className="flex gap-2">
                                <div className="flex-1 flex flex-col gap-0.5">
                                  <span className="text-gray-500 text-[10px] font-bold">{t.shippingDateLabel}:</span>
                                  <div
                                    className="border border-gray-300 rounded text-xs text-black bg-white w-full h-8 min-w-0 px-2 flex items-center justify-center font-bold"
                                    style={{
                                      lineHeight: '30px',
                                      height: '32px'
                                    }}
                                  >
                                    {item.shippedAt ? formatDateOnly(item.shippedAt, 'customer') : '-'}
                                  </div>
                                </div>
                                <div className="flex-1 flex flex-col gap-0.5">
                                  <span className="text-gray-500 text-[10px] font-bold">{arrivalDateLabel}:</span>
                                  <div
                                    className="border border-gray-300 rounded text-xs text-black bg-white w-full h-8 min-w-0 px-2 flex items-center justify-center font-bold"
                                    style={{
                                      lineHeight: '30px',
                                      height: '32px'
                                    }}
                                  >
                                    {item.estimatedArrivalDate ? formatDateOnly(item.estimatedArrivalDate, 'customer') : '-'}
                                  </div>
                                </div>
                              </div>

                              {/* 中段: 配送業者 & 追跡番号 */}
                              <div className="flex gap-2">
                                <div className="flex-1 flex flex-col gap-0.5">
                                  <span className="text-gray-500 text-[10px] font-bold">{t.carrierLabel}:</span>
                                  <div
                                    className="border border-gray-300 rounded text-xs text-black bg-white w-full h-8 min-w-0 px-2 flex items-center justify-center font-bold truncate"
                                    style={{
                                      lineHeight: '30px',
                                      height: '32px'
                                    }}
                                    title={item.carrier || ''}
                                  >
                                    {item.carrier || '-'}
                                  </div>
                                </div>
                                <div className="flex-1 flex flex-col gap-0.5">
                                  <span className="text-gray-500 text-[10px] font-bold">
                                    {`${t.trackingNumberLabel}:`}
                                  </span>
                                  <div
                                    onClick={() => handleCopyTrackingNumber(item.id, item.trackingNumber || '')}
                                    className="border border-gray-300 rounded text-xs text-black bg-white w-full h-8 min-w-0 px-2 flex items-center justify-center font-bold truncate cursor-pointer hover:bg-gray-100/50 transition relative group active:scale-95"
                                    style={{
                                      lineHeight: '30px',
                                      height: '32px'
                                    }}
                                    title={item.trackingNumber ? (lang === 'es' ? 'Click para copiar' : 'Clique para copiar') : ''}
                                  >
                                    {copiedItemId === item.id ? (
                                      <span className="text-green-600 font-bold">
                                        {lang === 'es' ? '¡Copiado!' : 'Copiado!'}
                                      </span>
                                    ) : (
                                      item.trackingNumber || '-'
                                    )}
                                    {item.trackingNumber && copiedItemId !== item.id && (
                                      <span className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[9px] px-1.5 py-0.5 rounded shadow-md whitespace-nowrap z-10 pointer-events-none opacity-80">
                                        {lang === 'es' ? 'Click para copiar' : 'Clique para copiar'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 下段: 追跡URL */}
                              <div className="flex flex-col gap-0.5">
                                <span className="text-gray-500 text-[10px] font-bold">{lang === 'es' ? 'URL de seguimiento:' : 'URL de rastreamento:'}</span>
                                {item.trackingUrl ? (
                                  <a
                                    href={item.trackingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded flex items-center justify-center text-xs transition"
                                    style={{
                                      lineHeight: '30px',
                                      height: '32px'
                                    }}
                                  >
                                    {t.trackingUrlButton}
                                  </a>
                                ) : (
                                  <div
                                    className="border border-gray-300 rounded text-xs text-gray-400 bg-gray-100 w-full h-8 min-w-0 px-2 flex items-center justify-center font-semibold select-none"
                                    style={{
                                      lineHeight: '30px',
                                      height: '32px'
                                    }}
                                  >
                                    -
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        ) : activeTab === 'mypage' ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-6">{t.myPage}</h2>

            {/* 保証金情報 (Deposit Info) */}
            <div className="mb-6 h-12 px-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100/80 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                  {lang === 'es' ? 'Garantía' : 'Garantia'}:
                </span>
                <span className="text-base sm:text-lg font-bold text-gray-800 leading-none">
                  ${(currentUser?.depositAmount !== undefined && currentUser?.depositAmount !== null) ? currentUser.depositAmount : (currentUser?.role === 'agent' ? 500 : 100)}
                </span>
              </div>
              <div>
                {currentUser?.depositConfirmedAt ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                    ✓ {lang === 'es' ? 'Confirmado' : 'Confirmado'}
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      const depositItem = {
                        id: 'deposit',
                        productTitle: lang === 'es' ? 'Depósito de garantía' : 'Depósito de garantia',
                        finalPrice: (currentUser?.depositAmount !== undefined && currentUser?.depositAmount !== null)
                          ? currentUser.depositAmount
                          : (currentUser?.role === 'agent' ? 500 : 100),
                        stockNumber: 'deposit'
                      };
                      openPaymentModal(depositItem as any);
                    }}
                    className="text-center text-xs text-white font-bold h-8 bg-green-600 hover:bg-green-700 rounded-lg px-3 shadow-sm transition whitespace-nowrap flex items-center justify-center"
                  >
                    {lang === 'es' ? 'Método de Pago' : 'Método de Pagamento'}
                  </button>
                )}
              </div>
            </div>

            {/* 利用規約 PDFボタン */}
            <div className="mb-8">
              <button
                onClick={() => setShowPdfViewerModal(true)}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-indigo-100 bg-white text-indigo-600 font-bold hover:bg-indigo-50 transition"
              >
                <span className="text-lg">📄</span>
                {lang === 'es' ? 'Ver Términos y Condiciones (PDF)' : 'Ver Termos e Condições (PDF)'}
              </button>
            </div>

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
                    className="w-full border border-gray-200 rounded-lg px-4 h-12 bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.fullName}</label>
                  <input
                    type="text"
                    value={profileForm.fullName}
                    onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.whatsapp}</label>
                  <input
                    type="tel"
                    value={profileForm.whatsapp}
                    onChange={(e) => setProfileForm({ ...profileForm, whatsapp: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                    placeholder="+55 11 98765-4321"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {lang === 'es' ? 'Idioma' : 'Idioma'}
                  </label>
                  <select
                    value={profileForm.language}
                    onChange={(e) => setProfileForm({ ...profileForm, language: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white"
                  >
                    <option value="es">Español</option>
                    <option value="pt">Português</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {lang === 'es' ? 'País' : 'País'}
                  </label>
                  <input
                    type="text"
                    value={currentUser?.country || ''}
                    disabled
                    className="w-full border border-gray-200 rounded-lg px-4 h-12 bg-gray-50 text-gray-500"
                  />
                </div>
                {(currentUser?.country || '').trim().toLowerCase() === 'brasil' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">CPF / CNPJ</label>
                    <input
                      type="text"
                      value={profileForm.cpf}
                      onChange={(e) => setProfileForm({ ...profileForm, cpf: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder="000.000.000-00"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {(currentUser?.country || '').trim().toLowerCase() === 'brasil' ? 'CEP' : (lang === 'es' ? 'Código Postal' : 'Código Postal')}
                  </label>
                  <input
                    type="text"
                    value={profileForm.zipCode}
                    onChange={(e) => {
                      if ((currentUser?.country || '').trim().toLowerCase() === 'brasil') {
                        handleMyPageCepChange(e.target.value);
                      } else {
                        setProfileForm({ ...profileForm, zipCode: e.target.value });
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
                    placeholder={(currentUser?.country || '').trim().toLowerCase() === 'brasil' ? '00000-000' : '12345-678'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {lang === 'es' ? 'Estado' : 'Estado'}
                  </label>
                  {(currentUser?.country || '').trim().toLowerCase() === 'brasil' ? (
                    <select
                      value={profileForm.state}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value, city: '' })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white"
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
                      value={profileForm.state || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder={lang === 'es' ? 'Provincia / Estado' : 'Província / Estado'}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {lang === 'es' ? 'Ciudad' : 'Cidade'}
                  </label>
                  {(currentUser?.country || '').trim().toLowerCase() === 'brasil' ? (
                    <select
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12 bg-white"
                      disabled={myPageCitiesLoading}
                    >
                      <option value="" disabled>
                        {myPageCitiesLoading 
                          ? (lang === 'es' ? 'Cargando...' : 'Carregando...') 
                          : (lang === 'es' ? 'Seleccionar ciudad' : 'Selecionar cidade')}
                      </option>
                      {myPageCities.find(c => c.nome === profileForm.city) === undefined && profileForm.city && (
                        <option value={profileForm.city}>{profileForm.city}</option>
                      )}
                      {myPageCities.map((c) => (
                        <option key={c.id} value={c.nome}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={profileForm.city || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder={lang === 'es' ? 'Ciudad' : 'Cidade'}
                    />
                  )}
                </div>
                {(currentUser?.country || '').trim().toLowerCase() === 'brasil' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {lang === 'es' ? 'Avenida' : 'Rua'}
                      </label>
                      <input
                        type="text"
                        value={profileForm.address}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 h-12"
                        placeholder={lang === 'es' ? 'Nombre de la calle o avenida' : 'Nome da rua ou avenida'}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {lang === 'es' ? 'Número' : 'Número'}
                      </label>
                      <input
                        type="text"
                        value={profileForm.addressNumber || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, addressNumber: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 h-12"
                        placeholder="123"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Complemento (opcional)
                      </label>
                      <input
                        type="text"
                        value={profileForm.complement || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, complement: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 h-12"
                        placeholder="Exemplo: Apto 20, Bloco B"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {lang === 'es' ? 'Dirección' : 'Endereço'}
                    </label>
                    <input
                      type="text"
                      value={profileForm.address}
                      onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12"
                      placeholder={lang === 'es' ? 'Calle, Número, Barrio' : 'Rua, Número, Bairro'}
                    />
                  </div>
                )}
                {currentUser?.role === 'customer' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {lang === 'es' ? 'ID del Agente (Opcional)' : 'ID do Agente (Opcional)'}
                    </label>
                    <input
                      type="text"
                      value={profileForm.agentCustomerId}
                      onChange={(e) => setProfileForm({ ...profileForm, agentCustomerId: e.target.value })}
                      placeholder=""
                      className="w-full border border-gray-300 rounded-lg px-4 h-12 font-mono"
                    />
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (profileSaving) return;
                    setProfileSaving(true);
                    try {
                      const isBrasil = (currentUser?.country || '').trim().toLowerCase() === 'brasil';
                      const finalAddress = isBrasil && profileForm.addressNumber
                        ? `${profileForm.address}, ${profileForm.addressNumber}${profileForm.complement ? ', ' + profileForm.complement : ''}`.trim()
                        : profileForm.address;

                      await updateProfile(profileForm.fullName, profileForm.whatsapp, finalAddress, profileForm.zipCode, profileForm.agentCustomerId, profileForm.cpf, profileForm.state, profileForm.city, profileForm.language);
                      const user = await getCurrentUser();
                      setCurrentUser(user);
                      if (user?.language === 'es' || user?.language === 'pt') {
                        setLang(user.language);
                        localStorage.setItem('lang', user.language);
                      }
                      alert((user?.language || lang) === 'es' ? '¡Perfil actualizado!' : 'Perfil atualizado!');
                    } catch (error) {
                      console.error('Profile update error:', error);
                      alert(lang === 'es' ? 'Error al actualizar perfil.' : 'Erro ao atualizar perfil.');
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                  disabled={profileSaving}
                  className="w-full bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
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
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
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
                    className="w-full border border-gray-300 rounded-lg px-4 h-12"
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
                  className="w-full bg-yellow-500 text-white h-12 rounded-lg font-semibold hover:bg-yellow-600 transition disabled:bg-gray-400"
                >
                  {passwordSaving ? '...' : t.changePassword}
                </button>
              </div>
            </div>

            {/* ログアウト */}
            <div className="border-t pt-6 mt-6">
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full bg-red-600 text-white h-12 rounded-lg font-semibold hover:bg-red-700 transition"
              >
                {t.logout}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-md pt-3 px-3.5 pb-4 sm:pt-4 sm:px-6 sm:pb-5 mb-0">
              {/* 検索タイプ切り替え (3タブ化) */}
              <div className="flex border-b mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <button
                  onClick={() => {
                    setSearchType('categories');
                    setProducts([]);
                    setCategoryHistory([]);
                    setActiveCategoryUrl(null);
                    setKeyword('');
                    setSearchUrl('');
                  }}
                  className={`flex-1 min-w-[100px] py-2.5 sm:py-3 px-2 text-xs font-bold tracking-wider border-b-2 transition ${searchType === 'categories' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 font-medium'}`}
                >
                  {t.categoriesTab}
                </button>
                <button
                  onClick={() => {
                    setSearchType('keyword');
                    setProducts([]);
                    setCategoryHistory([]);
                    setActiveCategoryUrl(null);
                    setSearchUrl('');
                  }}
                  className={`flex-1 min-w-[100px] py-2.5 sm:py-3 px-2 text-xs font-bold tracking-wider border-b-2 transition ${searchType === 'keyword' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 font-medium'}`}
                >
                  {t.searchTab}
                </button>
                <button
                  onClick={() => {
                    setSearchType('url');
                    setProducts([]);
                    setCategoryHistory([]);
                    setActiveCategoryUrl(null);
                    setKeyword('');
                  }}
                  className={`flex-1 min-w-[100px] py-2.5 sm:py-3 px-2 text-xs font-bold tracking-wider border-b-2 transition ${searchType === 'url' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 font-medium'}`}
                >
                  {t.urlTab}
                </button>
              </div>

              {searchType === 'url' && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300 font-sans">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder={t.searchPlaceholder}
                      value={searchUrl}
                      onChange={(e) => setSearchUrl(e.target.value)}
                      className="flex-1 px-4 h-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-gray-800 text-sm font-sans"
                    />
                    <button
                      onClick={handleImport}
                      disabled={loading}
                      className="bg-indigo-600 text-white min-w-[120px] px-6 h-12 rounded-lg font-bold hover:bg-indigo-700 transition disabled:bg-indigo-300 whitespace-nowrap text-sm shadow-sm font-sans"
                    >
                      {loading ? '...' : t.import}
                    </button>
                  </div>

                  {/* 引渡し場所（国名）選択ドロップダウン */}
                  <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                      {t.deliveryLocationLabel}
                    </label>
                    <select
                      value={deliveryCountry}
                      onChange={(e) => {
                        const countryCode = e.target.value;
                        setDeliveryCountry(countryCode);
                        if (countryCode === 'JP') {
                          setDeliveryCity('');
                        } else {
                          const country = deliveryLocations.find(c => c.code === countryCode);
                          if (country && country.cities.length > 0) {
                              setDeliveryCity(country.cities[0].code);
                          }
                        }
                      }}
                      className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                    >
                      {deliveryLocations.map(country => (
                        <option key={country.code} value={country.code}>
                          {lang === 'es' ? country.nameEs : country.namePt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 引渡し場所（都市名）選択ドロップダウン */}
                  {deliveryCountry !== 'JP' && (
                    <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                        {lang === 'es' ? 'Ciudad' : 'Cidade'}
                      </label>
                      <select
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                      >
                        {deliveryLocations.find(c => c.code === deliveryCountry)?.cities.map(city => (
                          <option key={city.code} value={city.code}>
                            {lang === 'es' ? city.nameEs : city.namePt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 発送方法選択ドロップダウン */}
                  {deliveryCountry !== 'JP' && (
                    <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                        {t.shippingMethodLabel}
                      </label>
                      <select
                        value={shippingMethod}
                        onChange={(e) => setShippingMethod(e.target.value as any)}
                        className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                      >
                        <option value="sea">{t.shippingMethodSea}</option>
                        <option value="air">{t.shippingMethodAir}</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {searchType === 'categories' && (
                <div className="animate-in fade-in duration-300">
                  {/* 「戻る」ボタン (商品リスト表示中、またはカテゴリ選択中のどちらか一方のみ表示) */}
                  {activeCategoryUrl ? (
                    <div className="mb-4">
                      <button
                        onClick={() => {
                          setActiveCategoryUrl(null);
                          setProducts([]);
                          setSearchPage(1);
                          setNextPageExists(false);
                          if (currentCategory && !currentCategory.sub) {
                            setCategoryHistory(prev => prev.slice(0, -1));
                          }
                        }}
                        className="w-full sm:w-auto text-center text-xs text-indigo-600 hover:underline hover:bg-indigo-100 font-bold h-12 bg-indigo-50 rounded px-6 flex items-center justify-center shadow-sm border border-indigo-100 transition-colors font-sans"
                      >
                        {(() => {
                          let catName = '';
                          if (currentCategory) {
                            catName = lang === 'es' ? currentCategory.es : currentCategory.pt;
                          } else {
                            const catId = getYahooCategoryId(activeCategoryUrl);
                            catName = getCategoryNameById(catId);
                            if (!catName) {
                              const found = CATEGORIES.find(c => c.url && activeCategoryUrl.includes(c.url.split('?')[0]));
                              if (found) {
                                catName = lang === 'es' ? found.es : found.pt;
                              }
                            }
                          }
                          return catName ? `${t.back} (${catName})` : t.back;
                        })()}
                      </button>
                    </div>
                  ) : currentCategory ? (
                    <div className="mb-4">
                      <button
                        onClick={() => setCategoryHistory(prev => prev.slice(0, -1))}
                        className="w-full sm:w-auto text-center text-xs text-indigo-600 hover:underline hover:bg-indigo-100 font-bold h-12 bg-indigo-50 rounded px-6 flex items-center justify-center shadow-sm border border-indigo-100 transition-colors font-sans"
                      >
                        {(() => {
                          const parentName = categoryHistory.length <= 1
                            ? (lang === 'es' ? 'Categorías principales' : 'Categorias principais')
                            : (lang === 'es' ? categoryHistory[categoryHistory.length - 2].es : categoryHistory[categoryHistory.length - 2].pt);
                          return `${t.back} (${parentName})`;
                        })()}
                      </button>
                    </div>
                  ) : null}

                  {/* 汎用 カテゴリ内ワード検索ボックス (JDM車種・部品取り車以外のID有効カテゴリ用) */}
                  {(() => {
                    const catId = activeCategoryUrl 
                      ? getYahooCategoryId(activeCategoryUrl) 
                      : (currentCategory?.url ? getYahooCategoryId(currentCategory.url) : null);

                    // 自動車車体(26360)および部品取り車(2084061280)以外の、有効なカテゴリIDを持つすべてのカテゴリで検索ボックスを表示する
                    const isSearchable = catId && catId !== '26360' && catId !== '2084061280';
                    if (!isSearchable && !activeCategoryUrl) return null;

                    const placeholderText = lang === 'es' 
                      ? 'Buscar por marca o modelo' 
                      : 'Buscar por marca ou modelo';

                    return (
                      <div className="mb-4 animate-in fade-in duration-300 space-y-4">
                        {isSearchable && (
                          <>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder={placeholderText}
                                value={categorySearchKeyword}
                                onChange={(e) => setCategorySearchKeyword(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleCategorySearch(catId);
                                  }
                                }}
                                className="flex-1 px-4 h-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-gray-800 text-sm font-sans"
                              />
                              <button
                                onClick={() => handleCategorySearch(catId)}
                                className="bg-indigo-600 text-white min-w-[100px] px-6 h-12 rounded-lg font-bold hover:bg-indigo-700 transition text-sm shadow-sm font-sans"
                              >
                                {lang === 'es' ? 'Buscar' : 'Buscar'}
                              </button>
                            </div>

                            <div className="flex p-1 bg-gray-100/80 backdrop-blur-sm rounded-xl border border-gray-200/50 w-full max-w-md mx-auto h-11">
                              <button
                                onClick={() => {
                                  setSearchCondition('all');
                                  handleCategorySearch(catId, 'all');
                                }}
                                className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                                  searchCondition === 'all'
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-100 transform scale-[1.02]'
                                    : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                                }`}
                              >
                                {t.condAll}
                              </button>
                              <button
                                onClick={() => {
                                  setSearchCondition('new');
                                  handleCategorySearch(catId, 'new');
                                }}
                                className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                                  searchCondition === 'new'
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-100 transform scale-[1.02]'
                                    : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                                }`}
                              >
                                {t.condNew}
                              </button>
                              <button
                                onClick={() => {
                                  setSearchCondition('used');
                                  handleCategorySearch(catId, 'used');
                                }}
                                className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                                  searchCondition === 'used'
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-100 transform scale-[1.02]'
                                    : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                                }`}
                              >
                                {t.condUsed}
                              </button>
                            </div>
                          </>
                        )}

                        {/* 引渡し場所（国名）選択ドロップダウン */}
                        <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                            {t.deliveryLocationLabel}
                          </label>
                          <select
                            value={deliveryCountry}
                            onChange={(e) => {
                              const countryCode = e.target.value;
                              setDeliveryCountry(countryCode);
                              if (countryCode === 'JP') {
                                setDeliveryCity('');
                              } else {
                                const country = deliveryLocations.find(c => c.code === countryCode);
                                if (country && country.cities.length > 0) {
                                  setDeliveryCity(country.cities[0].code);
                                }
                              }
                            }}
                            className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                          >
                            {deliveryLocations.map(country => (
                              <option key={country.code} value={country.code}>
                                {lang === 'es' ? country.nameEs : country.namePt}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* 引渡し場所（都市名）選択ドロップダウン */}
                        {deliveryCountry !== 'JP' && (
                          <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                              {lang === 'es' ? 'Ciudad' : 'Cidade'}
                            </label>
                            <select
                              value={deliveryCity}
                              onChange={(e) => setDeliveryCity(e.target.value)}
                              className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                            >
                              {deliveryLocations.find(c => c.code === deliveryCountry)?.cities.map(city => (
                                <option key={city.code} value={city.code}>
                                  {lang === 'es' ? city.nameEs : city.namePt}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 発送方法選択ドロップダウン */}
                        {deliveryCountry !== 'JP' && (
                          <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                              {t.shippingMethodLabel}
                            </label>
                            <select
                              value={shippingMethod}
                              onChange={(e) => setShippingMethod(e.target.value as any)}
                              className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                            >
                              <option value="sea">{t.shippingMethodSea}</option>
                              <option value="air">{t.shippingMethodAir}</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* JDM専用 自動車車体カテゴリ内ワード検索ボックス */}
                  {!activeCategoryUrl && currentCategory?.id === 'jdm' && (
                    <div className="mb-4 animate-in fade-in duration-300 space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={lang === 'es' ? 'Buscar por marca o modelo' : 'Buscar por marca ou modelo'}
                          value={jdmSearchKeyword}
                          onChange={(e) => setJdmSearchKeyword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleJdmSearch();
                            }
                          }}
                          className="flex-1 px-4 h-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-gray-800 text-sm font-sans"
                        />
                        <button
                          onClick={() => handleJdmSearch()}
                          className="bg-indigo-600 text-white min-w-[100px] px-6 h-12 rounded-lg font-bold hover:bg-indigo-700 transition text-sm shadow-sm font-sans"
                        >
                          {lang === 'es' ? 'Buscar' : 'Buscar'}
                        </button>
                      </div>

                      <div className="flex p-1 bg-gray-100/80 backdrop-blur-sm rounded-xl border border-gray-200/50 w-full max-w-md mx-auto h-11">
                        <button
                          onClick={() => {
                            setSearchCondition('all');
                            handleJdmSearch('all');
                          }}
                          className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                            searchCondition === 'all'
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-100 transform scale-[1.02]'
                              : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                          }`}
                        >
                          {t.condAll}
                        </button>
                        <button
                          onClick={() => {
                            setSearchCondition('new');
                            handleJdmSearch('new');
                          }}
                          className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                            searchCondition === 'new'
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-100 transform scale-[1.02]'
                              : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                          }`}
                        >
                          {t.condNew}
                        </button>
                        <button
                          onClick={() => {
                            setSearchCondition('used');
                            handleJdmSearch('used');
                          }}
                          className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                            searchCondition === 'used'
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-100 transform scale-[1.02]'
                              : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                          }`}
                        >
                          {t.condUsed}
                        </button>
                      </div>

                      {/* 引渡し場所（国名）選択ドロップダウン */}
                      <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                          {t.deliveryLocationLabel}
                        </label>
                        <select
                          value={deliveryCountry}
                          onChange={(e) => {
                            const countryCode = e.target.value;
                            setDeliveryCountry(countryCode);
                            if (countryCode === 'JP') {
                              setDeliveryCity('');
                            } else {
                              const country = deliveryLocations.find(c => c.code === countryCode);
                              if (country && country.cities.length > 0) {
                                  setDeliveryCity(country.cities[0].code);
                              }
                            }
                          }}
                          className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                        >
                          {deliveryLocations.map(country => (
                            <option key={country.code} value={country.code}>
                              {lang === 'es' ? country.nameEs : country.namePt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 引渡し場所（都市名）選択ドロップダウン */}
                      {deliveryCountry !== 'JP' && (
                        <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                            {lang === 'es' ? 'Ciudad' : 'Cidade'}
                          </label>
                          <select
                            value={deliveryCity}
                            onChange={(e) => setDeliveryCity(e.target.value)}
                            className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                          >
                            {deliveryLocations.find(c => c.code === deliveryCountry)?.cities.map(city => (
                              <option key={city.code} value={city.code}>
                                {lang === 'es' ? city.nameEs : city.namePt}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* 発送方法選択ドロップダウン */}
                      {deliveryCountry !== 'JP' && (
                        <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                            {t.shippingMethodLabel}
                          </label>
                          <select
                            value={shippingMethod}
                            onChange={(e) => setShippingMethod(e.target.value as any)}
                            className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                          >
                            <option value="sea">{t.shippingMethodSea}</option>
                            <option value="air">{t.shippingMethodAir}</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* カテゴリグリッド（商品リスト表示中は非表示にする） */}
                  {!activeCategoryUrl && (
                    <div className="space-y-5 animate-in fade-in duration-300">
                      {/* ① トップ・プロモーションバナー (第1階層のトップ時のみ表示・スリム高さ) */}
                      {!currentCategory && (
                        <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-gray-900 group">
                          {/* スライダー本体 */}
                          <div 
                            className="relative aspect-[16/8.8] sm:aspect-[16/8] w-full cursor-pointer select-none bg-slate-100"
                            onTouchStart={(e) => setBannerTouchStartX(e.touches[0].clientX)}
                            onTouchEnd={(e) => {
                              if (bannerTouchStartX !== null) {
                                const diff = bannerTouchStartX - e.changedTouches[0].clientX;
                                if (diff > 40) {
                                  // 次へ
                                  setCurrentBannerIndex((prev) => (prev + 1) % PROMO_BANNERS.length);
                                } else if (diff < -40) {
                                  // 前へ
                                  setCurrentBannerIndex((prev) => (prev - 1 + PROMO_BANNERS.length) % PROMO_BANNERS.length);
                                }
                                setBannerTouchStartX(null);
                              }
                            }}
                            onClick={() => {
                              const banner = PROMO_BANNERS[currentBannerIndex] as any;
                              if (banner.targetCatId) {
                                const path = findCategoryPath(CATEGORIES, banner.targetCatId);
                                if (path && path.length > 0) {
                                  setCategoryHistory(path);
                                  const targetCat = path[path.length - 1];
                                  if (targetCat.url) {
                                    setCategorySearchKeyword('');
                                    setJdmSearchKeyword('');
                                    const cond = determineConditionFromUrl(targetCat.url);
                                    setSearchCondition(cond);
                                    fetchCategoryItems(targetCat.url, 1);
                                  }
                                }
                              } else if (banner.targetUrl) {
                                const url = banner.targetUrl;
                                setCategorySearchKeyword('');
                                setJdmSearchKeyword('');
                                const cond = determineConditionFromUrl(url);
                                setSearchCondition(cond);
                                fetchCategoryItems(url, 1);
                              } else if (banner.targetKeyword) {
                                setKeyword(banner.targetKeyword);
                                setSearchType('keyword');
                                handleKeywordSearch(banner.targetKeyword);
                              }
                            }}
                          >
                            {PROMO_BANNERS.map((banner, index) => {
                              const bannerSrc = lang === 'es' ? banner.imageEs : banner.imagePt;
                              return (
                                <div
                                  key={banner.id}
                                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                                    index === currentBannerIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                                  }`}
                                >
                                  <img
                                    src={bannerSrc}
                                    alt={lang === 'es' ? banner.titleEs : banner.titlePt}
                                    className="w-full h-full object-cover object-center"
                                  />
                                </div>
                              );
                            })}
                          </div>

                          {/* スライダー ドットインジケーター */}
                          <div className="absolute bottom-2 right-3 z-20 flex gap-1.5 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full">
                            {PROMO_BANNERS.map((_, idx) => (
                              <button
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentBannerIndex(idx);
                                }}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  idx === currentBannerIndex ? 'w-4 bg-emerald-400' : 'w-1.5 bg-white/60 hover:bg-white'
                                }`}
                                aria-label={`Slide ${idx + 1}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ② 人気ブランド・クイックタグ (第1階層のトップ時のみ表示) */}
                      {!currentCategory && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                              🏷️ {t.quickTagsTitle || 'Marcas Populares'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
                            {QUICK_BRAND_TAGS.map((tag) => (
                              <button
                                key={tag.name}
                                onClick={() => {
                                  if (tag.targetCatId) {
                                    const path = findCategoryPath(CATEGORIES, tag.targetCatId);
                                    if (path && path.length > 0) {
                                      setCategoryHistory(path);
                                      const targetCat = path[path.length - 1];
                                      if (tag.keyword) {
                                        // カテゴリ内キーワード検索（BBS, SHIMANO, YAMAHA, G-SHOCK）
                                        setCategorySearchKeyword(tag.keyword);
                                        setJdmSearchKeyword('');
                                        const urlMatch = targetCat.url?.match(/list\/(\d+)/) || targetCat.url?.match(/auccat=(\d+)/);
                                        const catId = urlMatch ? urlMatch[1] : tag.targetCatId;
                                        const searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(tag.keyword)}&auccat=${catId}&va=${encodeURIComponent(tag.keyword)}&b=1&n=50`;
                                        const cond = determineConditionFromUrl(searchUrl);
                                        setSearchCondition(cond);
                                        fetchCategoryItems(searchUrl, 1);
                                      } else if (targetCat.url) {
                                        // カテゴリフォルダへ直接遷移（GUNDAM等）
                                        setCategorySearchKeyword('');
                                        setJdmSearchKeyword('');
                                        const cond = determineConditionFromUrl(targetCat.url);
                                        setSearchCondition(cond);
                                        fetchCategoryItems(targetCat.url, 1);
                                      }
                                    }
                                  } else if (tag.keyword) {
                                    // 通常のキーワード検索（POKEMON等）
                                    setCategoryHistory([]);
                                    setKeyword(tag.keyword);
                                    setSearchType('keyword');
                                    handleKeywordSearch(tag.keyword);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-400 rounded-full text-xs font-bold text-gray-700 hover:text-indigo-600 shadow-sm transition whitespace-nowrap active:scale-95 cursor-pointer"
                              >
                                <span>{tag.emoji}</span>
                                <span>{tag.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ③ カテゴリ一覧 (薄型・低めの2列グリッドカード) */}
                      <div className="space-y-2">
                        {!currentCategory && (
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                              📂 {t.categoriesTitle || 'Categorias'}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-3">
                          {(currentCategory?.sub || CATEGORIES).map((cat) => {
                            const visual = CATEGORY_VISUALS[cat.id];
                            const title = lang === 'es' ? cat.es : cat.pt;
                            const subTag = visual ? (lang === 'es' ? visual.tagEs : visual.tagPt) : '';
                            const bgImage = visual?.image || '/images/categories/vehiculo.jpg';

                            return (
                              <button
                                key={cat.id}
                                onClick={async () => {
                                  if (cat.sub) {
                                    setCategoryHistory(prev => [...prev, cat]);
                                  } else if (cat.url) {
                                    setCategoryHistory(prev => [...prev, cat]);
                                    // 以前の検索文字をクリアする
                                    setCategorySearchKeyword('');
                                    setJdmSearchKeyword('');
                                    const cond = determineConditionFromUrl(cat.url);
                                    setSearchCondition(cond);
                                    fetchCategoryItems(cat.url, 1);
                                  }
                                }}
                                className="group relative flex items-center justify-between px-5 py-3.5 h-[80px] sm:h-[88px] rounded-2xl overflow-hidden shadow-sm hover:shadow-md border border-gray-100 hover:border-indigo-200 text-left transition-all duration-300 active:scale-[0.99] bg-white"
                              >
                                {/* 中央に配置される商品写真（カードサイズギリギリまで最大化・白背景乗算ブレンド） */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                  <img
                                    src={bgImage}
                                    alt={title}
                                    className="h-[90%] sm:h-[95%] w-auto max-w-[78%] sm:max-w-[82%] object-contain mix-blend-multiply opacity-95 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                                    loading="eager"
                                    decoding="async"
                                  />
                                </div>

                                {/* 爽やかなホワイトグラデーションオーバーレイ（テキストの可読性と画像の引き立ちを両立） */}
                                <div className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-white/25 group-hover:from-white/85 group-hover:via-white/60 group-hover:to-white/15 transition-all duration-300 pointer-events-none" />

                                {/* カテゴリ名 & サブテキスト */}
                                <div className="relative z-10 flex-1 min-w-0 pr-3">
                                  <h4 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-indigo-600 tracking-wide truncate transition-colors">
                                    {title}
                                  </h4>
                                  {subTag && (
                                    <p className="text-xs text-slate-600 font-bold truncate mt-0.5 max-w-[80%]">
                                      {subTag}
                                    </p>
                                  )}
                                </div>

                                {/* 矢印ボタン */}
                                <div className="relative z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-md border border-gray-200/80 shadow-xs flex items-center justify-center text-slate-700 font-bold text-sm flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 group-hover:translate-x-1 transition-all">
                                  {cat.sub ? '→' : '↓'}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ④ 注目・おすすめ商品カルーセル (Destaques do Japão) */}
                      {!currentCategory && (
                        <div className="pt-2 space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                              🔥 {t.featuredTitle || (lang === 'es' ? 'Destacados de Japón' : 'Destaques do Japão')}
                            </span>
                          </div>

                          {isFeaturedLoading && featuredItems.length === 0 ? (
                            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-0.5">
                              {[...Array(5)].map((_, i) => (
                                <div
                                  key={`featured-skel-${i}`}
                                  className="flex-shrink-0 w-36 sm:w-44 bg-white border border-gray-100 rounded-xl p-2 shadow-xs animate-pulse"
                                >
                                  <div className="w-full h-28 sm:h-32 rounded-lg bg-gray-200 mb-2" />
                                  <div className="h-3 bg-gray-200 rounded w-5/6 mb-1.5" />
                                  <div className="h-3 bg-gray-200 rounded w-3/5 mb-2" />
                                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                                </div>
                              ))}
                            </div>
                          ) : featuredItems.length > 0 ? (
                            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-0.5">
                              {featuredItems.map((item) => {
                                const itemUrlWithCat = item.url + (item.categoryId ? (item.url.includes('?') ? '&' : '?') + 'auccat=' + item.categoryId : '');
                                const convertedPrice = calculateConvertedPrice(
                                  item.currentPrice,
                                  selectedCurrency,
                                  item.titleJa || item.title,
                                  itemUrlWithCat,
                                  undefined,
                                  item.id
                                );
                                const itemOffered = isProductOffered(item);

                                return (
                                  <button
                                    key={item.id}
                                    disabled={itemOffered}
                                    onClick={() => {
                                      if (itemOffered) return;
                                      setSelectedProduct(item);
                                      setBidForm({
                                        name: (currentUser?.role === 'customer' && currentUser?.agentCustomerId)
                                          ? (currentUser?.agentFullName || '')
                                          : (currentUser?.fullName || ''),
                                        maxBid: calculateConvertedPrice(
                                          item.currentPrice,
                                          'USD',
                                          item.titleJa || item.title,
                                          itemUrlWithCat,
                                          undefined,
                                          item.id
                                        ).toString().replace(/,/g, '')
                                      });
                                      if (item.url) {
                                        fetchProductDetailForOfferSilent(item.url);
                                      }
                                    }}
                                    className={`group flex-shrink-0 w-36 sm:w-44 bg-white border ${itemOffered ? 'border-green-200 bg-green-50/20 cursor-not-allowed' : 'border-gray-200 hover:border-indigo-500 active:scale-95'} rounded-xl p-2 shadow-xs hover:shadow-md transition text-left flex flex-col justify-between`}
                                  >
                                    <div>
                                      <div className="relative w-full h-28 sm:h-32 rounded-lg overflow-hidden bg-gray-50 mb-2 flex items-center justify-center">
                                        <img
                                          src={getOptimizedImageUrl(item.imageUrl || (item.images && item.images[0]) || '')}
                                          alt={item.title}
                                          className={`w-full h-full object-cover ${itemOffered ? '' : 'group-hover:scale-105'} transition duration-300`}
                                          loading="lazy"
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            const originalSrc = item.imageUrl || (item.images && item.images[0]);
                                            if (target && target.src.includes('/api/image-cache') && originalSrc) {
                                              target.src = originalSrc;
                                            } else {
                                              target.src = 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300&auto=format&fit=crop&q=80';
                                            }
                                          }}
                                        />
                                        <span className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                          {item.bids ?? 0} {lang === 'es' ? 'Ofertas' : 'Lances'}
                                        </span>
                                        {itemOffered && (
                                          <span className="absolute top-1.5 right-1.5 bg-green-600/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                                            ✓ {t.offerMade || 'Oferta enviada'}
                                          </span>
                                        )}
                                      </div>
                                      <h5 className={`text-[11px] sm:text-xs font-bold ${itemOffered ? 'text-gray-500' : 'text-gray-800 group-hover:text-indigo-600'} line-clamp-2 leading-tight transition`}>
                                        {item.title}
                                      </h5>
                                    </div>
                                    <div className="mt-2 pt-1 border-t border-gray-100 flex items-center justify-between">
                                      <span className={`text-xs sm:text-sm font-black ${itemOffered ? 'text-gray-400' : 'text-indigo-600'}`}>
                                        {selectedCurrency === 'USD' ? `$ ${convertedPrice}` : `${getCurrencySymbol(selectedCurrency)} ${convertedPrice}`}
                                        <span className="text-[9px] font-normal text-gray-500 ml-1">{selectedCurrency}</span>
                                      </span>
                                      <span className={`text-[10px] ${itemOffered ? 'text-gray-300' : 'text-gray-400 group-hover:text-indigo-600'} transition`}>
                                        {itemOffered ? '✓' : '→'}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {searchType === 'keyword' && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-300 font-sans">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder={t.keywordPlaceholder}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                      className="flex-1 px-4 h-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-gray-800 text-sm"
                    />
                    <button
                      onClick={handleKeywordSearch}
                      disabled={loading || isSearching}
                      className="bg-indigo-600 text-white min-w-[120px] px-6 h-12 rounded-lg font-bold hover:bg-indigo-700 transition disabled:bg-indigo-300 text-sm shadow-sm"
                    >
                      {isSearching ? '...' : t.search}
                    </button>
                  </div>
                  
                  <div className="flex p-1 bg-gray-100/80 backdrop-blur-sm rounded-xl border border-gray-200/50 w-full max-w-md mx-auto h-11">
                    <button
                      onClick={() => {
                        setSearchCondition('all');
                        handleKeywordSearch(undefined, 1, 'all');
                      }}
                      className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                        searchCondition === 'all'
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200 transform scale-[1.02]'
                          : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                      }`}
                    >
                      {t.condAll}
                    </button>
                    <button
                      onClick={() => {
                        setSearchCondition('new');
                        handleKeywordSearch(undefined, 1, 'new');
                      }}
                      className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                        searchCondition === 'new'
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200 transform scale-[1.02]'
                          : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                      }`}
                    >
                      {t.condNew}
                    </button>
                    <button
                      onClick={() => {
                        setSearchCondition('used');
                        handleKeywordSearch(undefined, 1, 'used');
                      }}
                      className={`flex-1 h-full rounded-lg font-bold text-sm transition-all duration-300 text-center flex items-center justify-center ${
                        searchCondition === 'used'
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200 transform scale-[1.02]'
                          : 'text-gray-500 hover:text-indigo-600 hover:bg-white/60'
                      }`}
                    >
                      {t.condUsed}
                    </button>
                  </div>

                  {/* 引渡し場所（国名）選択ドロップダウン */}
                  <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                      {t.deliveryLocationLabel}
                    </label>
                    <select
                      value={deliveryCountry}
                      onChange={(e) => {
                        const countryCode = e.target.value;
                        setDeliveryCountry(countryCode);
                        if (countryCode === 'JP') {
                          setDeliveryCity('');
                        } else {
                          const country = deliveryLocations.find(c => c.code === countryCode);
                          if (country && country.cities.length > 0) {
                              setDeliveryCity(country.cities[0].code);
                          }
                        }
                      }}
                      className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                    >
                      {deliveryLocations.map(country => (
                        <option key={country.code} value={country.code}>
                          {lang === 'es' ? country.nameEs : country.namePt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 引渡し場所（都市名）選択ドロップダウン */}
                  {deliveryCountry !== 'JP' && (
                    <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                        {lang === 'es' ? 'Ciudad' : 'Cidade'}
                      </label>
                      <select
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                      >
                        {deliveryLocations.find(c => c.code === deliveryCountry)?.cities.map(city => (
                          <option key={city.code} value={city.code}>
                            {lang === 'es' ? city.nameEs : city.namePt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 発送方法選択ドロップダウン */}
                  {deliveryCountry !== 'JP' && (
                    <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto animate-in fade-in duration-300">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                        {t.shippingMethodLabel}
                      </label>
                      <select
                        value={shippingMethod}
                        onChange={(e) => setShippingMethod(e.target.value as any)}
                        className="w-full h-11 px-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-700 text-sm font-semibold shadow-sm font-sans cursor-pointer transition text-center"
                      >
                        <option value="sea">{t.shippingMethodSea}</option>
                        <option value="air">{t.shippingMethodAir}</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 並び替えドロップダウン（LOCAL DE ENTREGAの下、右揃え） */}
            {(products.length > 0 || isSearching || loading) && (
              <div className="flex justify-end items-center my-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-500">
                    {lang === 'es' ? 'Ordenar:' : 'Ordenar:'}
                  </span>
                  <div className="relative flex items-center justify-between h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
                    <span className="truncate pr-4">
                      {sortOrder === 'price_asc'
                        ? (lang === 'es' ? 'Precio: Menor a Mayor' : 'Preço: Menor para Maior')
                        : sortOrder === 'price_desc'
                        ? (lang === 'es' ? 'Precio: Mayor a Menor' : 'Preço: Maior para Menor')
                        : sortOrder === 'bids_desc'
                        ? (lang === 'es' ? 'Más populares' : 'Mais populares')
                        : sortOrder === 'new'
                        ? (lang === 'es' ? 'Más recientes' : 'Mais recentes')
                        : (lang === 'es' ? 'Recomendados' : 'Recomendados')}
                    </span>
                    <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                    <select
                      value={sortOrder}
                      onChange={(e) => handleSortChange(e.target.value as any)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    >
                      <option value="featured">{lang === 'es' ? 'Recomendados' : 'Recomendados'}</option>
                      <option value="price_asc">{lang === 'es' ? 'Precio: Menor a Mayor' : 'Preço: Menor para Maior'}</option>
                      <option value="price_desc">{lang === 'es' ? 'Precio: Mayor a Menor' : 'Preço: Maior para Menor'}</option>
                      <option value="bids_desc">{lang === 'es' ? 'Más populares' : 'Mais populares'}</option>
                      <option value="new">{lang === 'es' ? 'Más recientes' : 'Mais recentes'}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div ref={resultsRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              {products.map((product, index) => renderProductCard(product, index, false))}
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


      {
        selectedProduct && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6">
              <h2 className="text-2xl font-bold mb-4">{t.makeOffer}</h2>

              <div className="flex gap-3 mb-4">
                <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100 relative">
                  {selectedProduct.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getOptimizedImageUrl(selectedProduct.imageUrl)}
                      alt={selectedProduct.title || 'Product'}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const originalSrc = selectedProduct.imageUrl;
                        if (target && target.src.includes('/api/image-cache') && originalSrc) {
                          target.src = originalSrc;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-semibold">
                      No Image
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-between min-h-[8rem] h-auto gap-1">
                  <h3 className="text-xs sm:text-sm font-semibold line-clamp-2 leading-tight">{selectedProduct.title}</h3>
                  {selectedProduct.endTime && (
                    <div className="text-left text-[10px] sm:text-xs h-7 flex items-center bg-gray-50 border border-gray-100 rounded px-1.5 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className="text-gray-500 font-medium mr-1">{t.endsIn}:</span>
                      <span className="font-semibold text-red-600">{getTimeRemaining(selectedProduct.endTime, lang, selectedProduct.timeLeft)}</span>
                    </div>
                  )}
                  <div className="text-[10px] sm:text-xs h-7 flex items-center justify-between bg-gray-50 border border-gray-100 rounded px-1.5 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="text-gray-500 font-medium flex items-center gap-1">
                      {t.currentPrice}: USD
                      {isOfferUpdating && (
                        <span className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-indigo-600 border-t-transparent"></span>
                      )}
                    </span>
                    <span className={`font-extrabold text-sm text-indigo-700 transition-opacity duration-200 ${isOfferUpdating ? 'opacity-50' : ''}`}>
                      $ {calculateConvertedPrice(selectedProduct.currentPrice, 'USD', selectedProduct.titleJa || selectedProduct.title, selectedProduct.url + (selectedProduct.categoryId ? (selectedProduct.url.includes('?') ? '&' : '?') + 'auccat=' + selectedProduct.categoryId : ''), currentCategory?.id, selectedProduct.id)}
                    </span>
                  </div>
                  {deliveryCountry !== 'JP' && (() => {
                    const cost = getLocalCost(selectedProduct);
                    const isStringCost = typeof cost === 'string';
                    if (isStringCost) {
                      return (
                        <div className="text-[10px] sm:text-xs h-7 flex items-center justify-center bg-gray-50 border border-gray-100 rounded px-1.5 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                          <span className="text-red-600 font-black tracking-wide">
                            {formatLocalCost(cost)}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-[10px] sm:text-xs h-7 flex items-center justify-between bg-gray-50 border border-gray-100 rounded px-1.5 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                        <span className="text-gray-500 font-medium flex items-center gap-1">
                          {t.localCostLabel}
                        </span>
                        <span className="font-extrabold text-sm text-indigo-700">
                          $ {cost.toLocaleString('en-US')}
                        </span>
                      </div>
                    );
                  })()}
                  {(() => {
                    const featuredDispPrice = calculateConvertedPrice(selectedProduct.currentPrice, 'USD', selectedProduct.titleJa || selectedProduct.title, selectedProduct.url + (selectedProduct.categoryId ? (selectedProduct.url.includes('?') ? '&' : '?') + 'auccat=' + selectedProduct.categoryId : ''), currentCategory?.id, selectedProduct.id);
                    const modalDetailHref = buildProductDetailUrl(selectedProduct, featuredDispPrice);
                    return (
                      <Link
                        href={modalDetailHref}
                        scroll={false}
                        onClick={() => {
                          prepareProductCache(selectedProduct, featuredDispPrice, selectedCurrency);
                          setSelectedProduct(null);
                        }}
                        className="text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 flex items-center justify-center bg-[#ff0033] rounded px-2 w-full cursor-pointer"
                      >
                        {t.viewOnYahoo}
                      </Link>
                    );
                  })()}
                </div>
              </div>

              <form onSubmit={handleBidRequest} className="space-y-3">
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
                        setBidForm({ ...bidForm, name: e.target.value });
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
                      {lang === 'es' ? '⚠️ Ingrese el monto en USD' : '⚠️ Insira o valor em USD'}
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      value={bidForm.maxBid}
                      onChange={(e) => setBidForm({ ...bidForm, maxBid: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 h-12 text-lg font-bold shadow-sm focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300 placeholder:font-normal"
                      required
                      min="1"
                      placeholder="USD"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setBidForm({ name: '', maxBid: '' });
                    }}
                    className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBid}
                    className={`flex-1 bg-indigo-600 text-white h-12 rounded-lg font-semibold transition flex items-center justify-center ${
                      isSubmittingBid ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                    }`}
                  >
                    {isSubmittingBid ? (lang === 'es' ? 'Enviando...' : 'Enviando...') : t.submit}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {
        showCounterModal && selectedRequestForCounter && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">{t.counterOfferAction}</h2>
              <div className="h-12 px-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 font-medium">
                  {lang === 'es' ? 'Contraoferta del administrador:' : 'Contraoferta do administrador:'}
                </span>
                <span className="text-base font-bold text-blue-700">
                  ${Math.round(selectedRequestForCounter.counterOffer || 0).toLocaleString('en-US')}
                </span>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{t.yourCounterOffer}</label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-gray-500 font-semibold">$</span>
                  <input
                    type="number"
                    value={customerCounterAmount}
                    onChange={(e) => setCustomerCounterAmount(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg pl-8 pr-4 focus:outline-none focus:border-blue-500 font-semibold"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCounterModal(false);
                    setSelectedRequestForCounter(null);
                    setCustomerCounterAmount('');
                  }}
                  disabled={isSubmittingCounter}
                  className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={async () => {
                    if (isSubmittingCounter || !customerCounterAmount || isNaN(parseFloat(customerCounterAmount)) || parseFloat(customerCounterAmount) <= 0) return;
                    setIsSubmittingCounter(true);
                    try {
                      await handleCounterOfferResponse(selectedRequestForCounter.id, 'counter', parseFloat(customerCounterAmount));
                      setShowCounterModal(false);
                      setSelectedRequestForCounter(null);
                      setCustomerCounterAmount('');
                    } finally {
                      setIsSubmittingCounter(false);
                    }
                  }}
                  disabled={isSubmittingCounter || !customerCounterAmount || isNaN(parseFloat(customerCounterAmount)) || parseFloat(customerCounterAmount) <= 0}
                  className="flex-1 bg-blue-600 text-white h-12 rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingCounter ? (lang === 'es' ? 'Enviando...' : 'Enviando...') : (lang === 'es' ? 'Enviar' : 'Enviar')}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* オファー金額変更モーダル */}
      {isEditOfferModalOpen && editingOfferRequest && (() => {
        const agreedCounter = getAgreedCounterOffer(editingOfferRequest);
        const isCounterAgreed = agreedCounter !== null;
        const effectiveCurrentBid = isCounterAgreed ? (agreedCounter || 0) : (editingOfferRequest.maxBid || 0);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                {lang === 'es' ? 'Modificar monto de oferta' : 'Modificar valor da oferta'}
              </h3>
              
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-500 mb-1">
                  {isCounterAgreed ? 'Contraoferta (USD)' : `${t.maxBid} (USD)`}
                </p>
                <div className={`text-2xl font-black ${isCounterAgreed ? 'text-blue-700' : 'text-indigo-600'}`}>
                  ${effectiveCurrentBid.toLocaleString('en-US')}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {lang === 'es' ? 'Nuevo monto máximo (USD)' : 'Novo valor máximo (USD)'}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    value={editingOfferAmount}
                    onChange={(e) => setEditingOfferAmount(e.target.value)}
                    className="w-full h-14 pl-10 pr-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-lg font-bold text-black focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {editingOfferRequest.status === 'approved' && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  {lang === 'es'
                    ? `* Para solicitudes aprobadas, el nuevo monto debe ser mayor al actual ($${effectiveCurrentBid}).`
                    : `* Para solicitações aprovadas, o novo valor deve ser maior que o atual ($${effectiveCurrentBid}).`}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsEditOfferModalOpen(false);
                    setEditingOfferRequest(null);
                    setEditingOfferAmount('');
                  }}
                  disabled={isSubmittingEditOffer}
                  className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleEditOfferSubmit}
                  disabled={
                    isSubmittingEditOffer ||
                    !editingOfferAmount ||
                    isNaN(Number(editingOfferAmount)) ||
                    Number(editingOfferAmount) <= 0 ||
                    (editingOfferRequest.status === 'approved' && Number(editingOfferAmount) <= effectiveCurrentBid)
                  }
                  className="flex-1 bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingEditOffer 
                    ? (lang === 'es' ? 'Guardando...' : 'Salvando...') 
                    : (lang === 'es' ? 'Guardar' : 'Salvar')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* お知らせモーダル */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] sm:max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {lang === 'es' ? 'Avisos' : 'Avisos'}
              </h2>
              <button
                onClick={() => setShowNotifications(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-gray-50">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm font-medium">{lang === 'es' ? 'No hay avisos nuevos' : 'Não há avisos novos'}</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 sm:p-4 rounded-xl border transition-all ${!n.is_read ? 'bg-white border-indigo-100 shadow-sm ring-1 ring-indigo-50' : 'bg-gray-50/50 border-gray-100 opacity-80'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${!n.is_read ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'}`}>
                          {(() => {
                            let title = n.title || '';
                            title = title.replace(/\s*\/\s*(Perdido|Ganhado|Aprovada|Rejeitada)/gi, '');
                            if (title === 'Administrador' || title === 'JOGALIBRE' || title === '管理画面' || !title) {
                              const b = n.body || '';
                              if (b.includes('Aprobada') || b.includes('aprovada')) return lang === 'pt' ? '✅ Solicitação Aprovada' : '✅ Solicitud Aprobada';
                              if (b.includes('Rechazada') || b.includes('rejeitada')) return lang === 'pt' ? '❌ Solicitação Rejeitada' : '❌ Solicitud Rechazada';
                              if (b.includes('Contraoferta') || b.includes('contraoferta')) return '💬 Contraoferta';
                              if (b.includes('Ganado') || b.includes('Ganhado')) return lang === 'pt' ? '🎉 Ganhado!' : '🎉 ¡Ganado!';
                              if (b.includes('Perdido') || b.includes('perdido')) return '😢 Perdido';
                              return lang === 'pt' ? '🔔 Notificação' : '🔔 Notificación';
                            }
                            return title;
                          })()}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">
                          {new Date(n.created_at || '').toLocaleString(lang === 'es' ? 'es-ES' : 'pt-BR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 font-semibold truncate overflow-hidden text-ellipsis whitespace-nowrap block w-full">
                        {((n.body || '') as string).replace(/\n+/g, ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-white safe-area-bottom">
              <button
                onClick={clearAllNotifications}
                className="w-full bg-red-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-sm active:scale-[0.99]"
              >
                {lang === 'es' ? 'Borrar avisos' : lang === 'pt' ? 'Limpar avisos' : '通知履歴を消去'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 支払方法選択モーダル */}
      {showPaymentModal && selectedPaymentItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in duration-200 max-h-[90vh]">
            {/* ヘッダー */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {lang === 'es' ? 'Método de Pago' : 'Método de Pagamento'}
                </h2>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                  {selectedPaymentItem.productTitle}
                </p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* コンテンツエリア */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* 金額サマリー */}
              <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-green-50 to-indigo-50 border border-green-100/50 flex justify-between items-center">
                <div>
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    {lang === 'es' ? 'Monto a Pagar' : 'Valor a Pagar'}
                  </p>
                  <p className="text-2xl font-black text-indigo-600">
                    $ {Math.round(
                      selectedPaymentItem.finalPrice ||
                      (selectedPaymentItem.customerCounterOffer && !selectedPaymentItem.customerCounterOfferUsed ? selectedPaymentItem.customerCounterOffer : (selectedPaymentItem.counterOffer || selectedPaymentItem.maxBid || 0))
                    ).toLocaleString('en-US')}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-semibold text-gray-600 bg-white px-2.5 py-1 rounded-full border shadow-sm">
                    {selectedPaymentItem.stockNumber === 'deposit' ? (
                      lang === 'es' ? 'Garantía' : 'Garantia'
                    ) : (
                      `Stock No: ${selectedPaymentItem.stockNumber || '-'}`
                    )}
                  </span>
                </div>
              </div>

              {/* タブ切り替え */}
              <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl mb-5">
                <button
                  type="button"
                  onClick={() => setActivePaymentMethod('bank')}
                  className={`py-2 px-1 text-center rounded-lg font-bold text-xs sm:text-sm transition ${
                    activePaymentMethod === 'bank'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  🏦 {lang === 'es' ? 'Banco' : 'Banco'}
                </button>
                <button
                  type="button"
                  onClick={() => setActivePaymentMethod('paypal')}
                  className={`py-2 px-1 text-center rounded-lg font-bold text-xs sm:text-sm transition ${
                    activePaymentMethod === 'paypal'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  💳 PayPal
                </button>
                <button
                  type="button"
                  onClick={() => setActivePaymentMethod('usdt')}
                  className={`py-2 px-1 text-center rounded-lg font-bold text-xs sm:text-sm transition ${
                    activePaymentMethod === 'usdt'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  🪙 USDT
                </button>
              </div>

              {/* メソッドごとの詳細 */}
              {isLoadingPaymentSettings ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-gray-500">{lang === 'es' ? 'Cargando...' : 'Carregando...'}</p>
                </div>
              ) : (
                <div>
                  {/* 1. 銀行振込 */}
                  {activePaymentMethod === 'bank' && (
                    <div className="space-y-4">
                      <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-2.5 rounded-lg border border-amber-100/50 leading-relaxed">
                        ⚠️ {lang === 'es' 
                          ? 'Realice la transferencia internacional a la siguiente cuenta. Todos los cargos de transferencia corren por su cuenta.' 
                          : 'Realize a transferência internacional para a seguinte conta. Todas as taxas de transferência são por sua conta.'}
                      </p>
                      
                      {(() => {
                        const bankData = paymentSettings?.bank?.[lang] || (lang === 'es' ? {
                          name: "RAKUTEN BANK, LTD.",
                          sucursal: "HEAD OFFICE",
                          swift: "RAKTJPJT",
                          address_bank: "2-16-5 KONAN, MINATO-KU,\nTOKYO, JAPAN",
                          account_number: "252-7951120",
                          account_name: "JOGA INC.",
                          address_joga: "NINOMIYA CUBE 2-A,\n2-17-4 NINOMIYA, TSUKUBA,\nIBARAKI, JAPAN",
                          telefono: "+81-298286721",
                          intermediary_bank: "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
                          intermediary_swift: "SMBCJPJT"
                        } : {
                          name: "RAKUTEN BANK, LTD.",
                          sucursal: "HEAD OFFICE",
                          swift: "RAKTJPJT",
                          address_bank: "2-16-5 KONAN, MINATO-KU,\nTOKYO, JAPAN",
                          account_number: "252-7951120",
                          account_name: "JOGA INC.",
                          address_joga: "NINOMIYA CUBE 2-A,\n2-17-4 NINOMIYA, TSUKUBA,\nIBARAKI, JAPAN",
                          telefono: "+81-298286721",
                          intermediary_bank: "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
                          intermediary_swift: "SMBCJPJT"
                        });

                        return (
                          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs space-y-2.5">
                            {[
                              { label: bankLabels[lang].name, value: bankData.name },
                              { label: bankLabels[lang].sucursal, value: bankData.sucursal },
                              { label: bankLabels[lang].swift, value: bankData.swift },
                              { label: bankLabels[lang].address_bank, value: bankData.address_bank },
                              { label: bankLabels[lang].account_number, value: bankData.account_number },
                              { label: bankLabels[lang].account_name, value: bankData.account_name },
                              { label: bankLabels[lang].address_joga, value: bankData.address_joga },
                              { label: bankLabels[lang].telefono, value: bankData.telefono },
                              { label: bankLabels[lang].intermediary_bank, value: bankData.intermediary_bank },
                              { label: bankLabels[lang].intermediary_swift, value: bankData.intermediary_swift }
                            ].map((row, idx) => {
                              if (!row.value) return null;
                              return (
                                <div key={idx} className="flex justify-between items-start gap-3 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                  <span className="font-bold text-gray-500 select-none w-[32%] shrink-0">{row.label}:</span>
                                  <span className="text-gray-900 font-mono text-right w-[68%] break-words whitespace-pre-wrap">{row.value}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 2. PayPal */}
                  {activePaymentMethod === 'paypal' && (
                    <div className="space-y-4">
                      {(() => {
                        const paypalData = paymentSettings?.paypal || {
                          account_email: "admin@jogalibre.com",
                          link: "https://paypal.me/joga1225",
                          fee_multiplier: 1.08
                        };
                        const basePrice = Math.round(
                          selectedPaymentItem.finalPrice ||
                          (selectedPaymentItem.customerCounterOffer && !selectedPaymentItem.customerCounterOfferUsed ? selectedPaymentItem.customerCounterOffer : (selectedPaymentItem.counterOffer || selectedPaymentItem.maxBid || 0))
                        );
                        const finalPaypalPrice = Math.round(basePrice * (paypalData.fee_multiplier || 1.08));

                        return (
                          <>
                            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs leading-relaxed text-indigo-800 space-y-1">
                              <p className="font-bold">
                                {lang === 'es'
                                  ? 'Para pagos vía PayPal se aplica una comisión de PayPal.'
                                  : 'Para pagamentos via PayPal é aplicada uma comissão do PayPal.'}
                              </p>
                              <p>
                                {lang === 'es'
                                  ? `Monto original ($${basePrice.toLocaleString()}) + Comisión de PayPal (${Math.round(((paypalData.fee_multiplier || 1.08) - 1) * 100)}%)`
                                  : `Valor original ($${basePrice.toLocaleString()}) + Comissão do PayPal (${Math.round(((paypalData.fee_multiplier || 1.08) - 1) * 100)}%)`}
                              </p>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-center">
                              <p className="text-[10px] text-gray-500 uppercase font-bold">{lang === 'es' ? 'Total PayPal' : 'Total PayPal'}</p>
                              <p className="text-3xl font-black text-gray-900 mt-1">${finalPaypalPrice.toLocaleString()}</p>
                            </div>

                            <a
                              href={paypalData.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-center bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 transform hover:scale-[1.02]"
                            >
                              {lang === 'es' ? 'Pagar con PayPal.me' : 'Pagar com PayPal.me'}
                            </a>
                            <p className="text-[10px] text-gray-400 text-center leading-relaxed select-none">
                              {lang === 'es'
                                ? '* Asegúrese de enviar la cantidad exacta en USD.'
                                : '* Certifique-se de enviar o valor exato em USD.'}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* 3. USDT */}
                  {activePaymentMethod === 'usdt' && (
                    <div className="space-y-4">
                      {(() => {
                        const usdtData = paymentSettings?.usdt || {
                          address: "TAgk4wvd5rYQFU9EdwPipBwb7pzUDX52Gc",
                          qr_url: "/images/usdt_qr.png"
                        };

                        return (
                          <>
                            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs leading-relaxed text-red-700 space-y-1">
                              <p className="font-bold">
                                ⚠️ Red: TRC-20 (TRON)
                              </p>
                              <p>
                                {lang === 'es'
                                  ? 'Envíe USDT únicamente a través de la red TRC-20. Transferencias por otras redes resultarán en pérdida permanente de fondos.'
                                  : 'Envie USDT apenas através da rede TRC-20. Transferências por outras redes resultarão na perda permanente de fundos.'}
                              </p>
                            </div>

                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs space-y-3">
                              <div>
                                <p className="font-bold text-gray-500 mb-1">{lang === 'es' ? 'Dirección USDT (TRC-20):' : 'Endereço USDT (TRC-20):'}</p>
                                <div 
                                  onClick={() => copyToClipboard(usdtData.address, 'usdt_address')}
                                  className="flex items-center justify-between gap-2 bg-white border border-gray-200 hover:border-indigo-400 rounded-xl p-2.5 cursor-pointer transition group w-full"
                                  title="Click to Copy"
                                >
                                  <span className="font-mono text-gray-900 text-[10px] xs:text-[11px] sm:text-xs tracking-tighter select-all whitespace-nowrap overflow-visible flex-1">
                                    {usdtData.address}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-bold text-indigo-600 bg-indigo-50 group-hover:bg-indigo-100 px-2 py-1 rounded transition select-none">
                                    {copiedText === 'usdt_address' 
                                      ? (lang === 'es' ? '✓ Copiado' : '✓ Copiado') 
                                      : (lang === 'es' ? 'Copiar' : 'Copiar')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col items-center justify-center py-2 border-t border-gray-200/50 mt-2">
                                <p className="font-bold text-gray-500 mb-2">{lang === 'es' ? 'Código QR para Depósito:' : 'Código QR para Depósito:'}</p>
                                <div className="relative w-40 h-40 bg-white p-2 rounded-xl border shadow-sm">
                                  <Image
                                    src={usdtData.qr_url}
                                    alt="USDT TRC20 QR Code"
                                    width={160}
                                    height={160}
                                    className="object-contain mx-auto"
                                    unoptimized
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <a
                href="https://wa.me/5518996686059"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all duration-200 transform hover:scale-[1.02]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                <span>
                  {lang === 'es' ? 'Enviar comprobante' : 'Enviar comprovante'}
                </span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* B001傘下顧客・ブラジルエージェント向け Stripe一括決済確認モーダル */}
      {showBrlBatchPaymentModal && (() => {
        const unpaidPurchased = getFilteredPurchasedItems().filter(item => !item.paid && !item.cancelledAt);
        const selectedItems = unpaidPurchased.filter(item => selectedBrlItemIds.includes(item.id));
        const totalUsd = selectedItems.reduce((sum, item) => {
          const price = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0));
          return sum + price;
        }, 0);
        const brlRate = (exchangeRates && exchangeRates['BRL']) ? exchangeRates['BRL'] : 5.65;
        // サマリーカードと同じBRL金額算出方式（個々のアイテムを5の位で繰り上げて合計）
        const totalBrl = selectedItems.reduce((sum, item) => {
          const price = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0));
          return sum + Math.ceil((price * brlRate) / 5) * 5;
        }, 0);

        const formatBrlModal = (val: number) => {
          return val.toLocaleString('pt-BR');
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in duration-200 max-h-[90vh]">
              {/* ヘッダー */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>💳</span>
                    <span>{lang === 'es' ? 'Pago en BRL' : 'Pagamento em BRL'}</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedItems.length} {lang === 'es' ? 'ítems seleccionados para pago' : 'itens selecionados para pagamento'}
                  </p>
                </div>
                <button
                  onClick={() => setShowBrlBatchPaymentModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* コンテンツ */}
              <div className="flex-1 overflow-y-auto p-5 font-sans">
                {/* 金額サマリー（ラベル左揃え・金額右揃え1行レイアウト、為替レート非表示） */}
                <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-indigo-50 border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                      Total a Pagar em BRL
                    </p>
                    <p className="text-2xl font-black text-emerald-600">
                      R$ {formatBrlModal(totalBrl)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                      USD
                    </p>
                    <p className="text-sm font-bold text-gray-400">
                      $ {Math.round(totalUsd).toLocaleString('en-US')}
                    </p>
                  </div>
                </div>

                {/* 決済方法選択タブ */}
                <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-xl mb-5">
                  <button
                    type="button"
                    onClick={() => setBrlPaymentMethod('pix')}
                    className={`py-2 px-1 text-center rounded-lg font-bold text-xs sm:text-sm transition cursor-pointer ${
                      brlPaymentMethod === 'pix'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    ❖ PIX
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrlPaymentMethod('card')}
                    className={`py-2.5 px-1 text-center rounded-lg font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      brlPaymentMethod === 'card'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <span className="text-sm sm:text-base">💳</span>
                    <span className="flex flex-col leading-tight text-left">
                      <span className="text-xs sm:text-sm flex items-center gap-1">
                        Cartão
                        {!ENABLE_CREDIT_CARD_PAYMENT && (
                          <span className="text-[9px] bg-yellow-100 text-yellow-800 font-bold px-1.5 py-0.5 rounded leading-none">
                            {lang === 'es' ? 'Próximamente' : 'Em breve'}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] sm:text-xs font-medium opacity-70">(Crédito / Débito)</span>
                    </span>
                  </button>
                </div>

                {/* 各決済方法の説明・プレビュー */}
                {brlPaymentMethod === 'pix' ? (
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-3 text-xs">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <span>❖</span>
                      <span>Pagamento via PIX</span>
                    </div>
                    <p className="text-gray-600 leading-relaxed">
                      {lang === 'es'
                        ? 'Al hacer clic en el botón de abajo, se generará el código QR dinámico de PIX para completar su pago al instante.'
                        : 'Ao clicar no botão abaixo, será gerado o QR Code dinâmico do PIX para concluir seu pagamento instantaneamente.'}
                    </p>
                    <div className="p-3 bg-white rounded-lg border text-gray-500 text-[11px]">
                      • Processamento instantâneo (24/7)<br />
                      • Confirmação automática no sistema
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-indigo-800 font-bold text-sm">
                        <span>💳</span>
                        <span>Cartão de Crédito ou Débito</span>
                      </div>
                      {!ENABLE_CREDIT_CARD_PAYMENT && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded-full">
                          {lang === 'es' ? 'En preparación' : 'Em preparação'}
                        </span>
                      )}
                    </div>
                    {!ENABLE_CREDIT_CARD_PAYMENT ? (
                      <div className="p-3 bg-yellow-50/80 rounded-lg border border-yellow-200 text-yellow-800 text-[11px] leading-relaxed">
                        ⚠️ {lang === 'es'
                          ? 'El pago con tarjeta se encuentra temporalmente en preparación. Por favor, utilice PIX para completar su pago al instante.'
                          : 'O pagamento com cartão está temporariamente em preparação. Por favor, utilize o PIX para concluir seu pagamento instantaneamente.'}
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-600 leading-relaxed">
                          {lang === 'es'
                            ? 'Pago seguro con tarjeta de crédito/débito.'
                            : 'Pagamento seguro com cartão de crédito/débito.'}
                        </p>
                        <div className="p-3 bg-white rounded-lg border text-gray-500 text-[11px]">
                          • Cartões aceitos: Visa, Mastercard, Elo, Hipercard<br />
                          • Criptografia de ponta a ponta (SSL/TLS)
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 選択された商品リスト */}
                <div className="mt-5">
                  <h4 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
                    {lang === 'es' ? 'Ítems en este pago:' : 'Itens neste pagamento:'}
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedItems.map((item) => {
                      const price = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed ? item.customerCounterOffer : (item.counterOffer || item.maxBid || 0));
                      return (
                        <div key={item.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-xs border">
                          <span className="font-semibold text-gray-800 line-clamp-1 flex-1 mr-2">
                            {item.productTitle}
                          </span>
                          <span className="font-bold text-indigo-600 whitespace-nowrap">
                            $ {Math.round(price).toLocaleString('en-US')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* フッターアクションボタン */}
              <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                {!currentUser?.cpf && !pixPaymentResult && (
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      {lang === 'es' ? 'CPF o CNPJ (Requerido para pago)' : 'CPF ou CNPJ (Obrigatório para pagamento)'}
                    </label>
                    <input
                      type="text"
                      value={brlPaymentCpf}
                      onChange={(e) => setBrlPaymentCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
                
                {brlPaymentError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
                    {brlPaymentError}
                  </div>
                )}

                {pixPaymentResult ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-white border-2 border-emerald-500 rounded-xl flex flex-col items-center justify-center">
                      <p className="text-sm font-bold text-gray-700 mb-2">Escaneie o QR Code</p>
                      {/* base64画像を表示 */}
                      <img src={`data:image/jpeg;base64,${pixPaymentResult.qrCodeImage}`} alt="PIX QR Code" className="w-48 h-48 mb-2" />
                      <p className="text-xs text-gray-500">
                        {lang === 'es' ? 'Válido hasta:' : 'Válido até:'} {new Date(pixPaymentResult.expirationDate).toLocaleString()}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-gray-700 text-center">PIX Copia e Cola</p>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={pixPaymentResult.qrCodeText} 
                          className="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs font-mono text-gray-600 outline-none"
                        />
                        <button
                          onClick={async () => {
                            await copyToClipboardSafe(pixPaymentResult.qrCodeText);
                            alert(lang === 'es' ? '¡Código copiado!' : 'Código copiado!');
                          }}
                          className="px-4 py-2 bg-gray-800 text-white text-xs font-bold rounded-lg hover:bg-gray-900 transition"
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        setShowBrlBatchPaymentModal(false);
                        fetchPurchasedItems(); // リストを更新
                      }}
                      className="w-full py-3 bg-gray-200 text-gray-700 font-bold rounded-xl mt-4 hover:bg-gray-300 transition"
                    >
                      {lang === 'es' ? 'Cerrar' : 'Fechar'}
                    </button>
                  </div>
                ) : (
                  (() => {
                    const isCardDisabled = !ENABLE_CREDIT_CARD_PAYMENT && brlPaymentMethod === 'card';
                    const isButtonDisabled = isProcessingBrlPayment || isCardDisabled || (!currentUser?.cpf && !brlPaymentCpf.trim());

                    return (
                      <button
                        type="button"
                        disabled={isButtonDisabled}
                        onClick={() => {
                          if (isCardDisabled) return;
                          handleProcessBrlPayment(totalBrl, selectedItems);
                        }}
                        className={`w-full font-bold py-3.5 px-4 rounded-xl shadow-lg transition duration-200 flex items-center justify-center gap-2 text-sm sm:text-base ${
                          isButtonDisabled
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                        }`}
                      >
                        {isProcessingBrlPayment ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {lang === 'es' ? 'Procesando...' : 'Processando...'}
                          </span>
                        ) : isCardDisabled ? (
                          <span>
                            {lang === 'es' ? 'En preparación' : 'Em preparação'}
                          </span>
                        ) : (
                          <span>
                            {lang === 'es'
                              ? `Proceder al Pago (R$ ${formatBrlModal(totalBrl)})`
                              : `Ir para Pagamento (R$ ${formatBrlModal(totalBrl)})`}
                          </span>
                        )}
                      </button>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 利用規約同意モーダル */}
      {showTermsModal && !currentUser?.termsAcceptedAt && (typeof localStorage === 'undefined' || (localStorage.getItem('jogalibre_terms_accepted') !== 'true' && localStorage.getItem('joga_terms_accepted') !== 'true')) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in duration-300 max-h-[90vh]">
            {/* ヘッダー */}
            <div className="p-6 border-b border-gray-100 bg-indigo-50/50 rounded-t-2xl sticky top-0 z-10">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white text-base">
                  📋
                </span>
                {lang === 'es' ? 'Términos y Condiciones de Uso' : 'Termos e Condições de Uso'}
              </h2>
              <p className="text-sm text-gray-600 mt-2 font-medium">
                {lang === 'es' 
                  ? 'Para comenzar a utilizar JOGALIBRE, por favor lea y acepte las siguientes condiciones importantes:' 
                  : 'Para começar a usar o JOGALIBRE, por favor leia e aceite as seguintes condições importantes:'}
              </p>
            </div>

            {/* コンテンツエリア */}
            <form onSubmit={handleAcceptTerms} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 項目1: 保証金 */}
              <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsChecked.item1}
                  onChange={(e) => setTermsChecked(prev => ({ ...prev, item1: e.target.checked }))}
                  className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1 text-sm text-gray-700">
                  <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span className="text-indigo-600">1.</span>
                    {lang === 'es' ? 'Aceptación del Depósito' : 'Aceitação do Depósito'}
                  </div>
                  <div>
                    {currentUser?.role === 'agent' ? (
                      lang === 'es' ? (
                        <>
                          Para utilizar el sistema, se requiere un depósito de garantía (<span className="text-red-500 font-extrabold">USD 500</span>). Se reembolsará en su totalidad al cancelar la cuenta, siempre que no haya pagos pendientes.
                        </>
                      ) : (
                        <>
                          Para utilizar o sistema, é necessário um depósito de garantia (<span className="text-red-500 font-extrabold">USD 500</span>). O valor será reembolsado integralmente no cancelamento da conta, desde que não haja pagamentos pendentes.
                        </>
                      )
                    ) : (
                      lang === 'es' ? (
                        <>
                          Para utilizar el sistema, se requiere un depósito de garantía (<span className="text-red-500 font-extrabold">USD 100</span>). Se reembolsará en su totalidad al cancelar la cuenta, siempre que no haya pagos pendientes.
                        </>
                      ) : (
                        <>
                          Para utilizar o sistema, é necessário um depósito de garantia (<span className="text-red-500 font-extrabold">USD 100</span>). O valor será reembolsado integralmente no cancelamento da conta, desde que não haja pagamentos pendentes.
                        </>
                      )
                    )}
                  </div>
                </div>
              </label>

              {/* 項目2: キャンセル不可 */}
              <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsChecked.item2}
                  onChange={(e) => setTermsChecked(prev => ({ ...prev, item2: e.target.checked }))}
                  className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1 text-sm text-gray-700">
                  <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span className="text-indigo-600">2.</span>
                    {lang === 'es' ? 'Ofertas No Cancelables' : 'Lances Não Canceláveis'}
                  </div>
                  <div>
                    {lang === 'es'
                      ? 'Debido a las especificaciones del sistema de Japón, una vez que el administrador ha realizado una oferta, no se puede cancelar, modificar ni realizar devoluciones bajo ninguna circunstancia.'
                      : 'Devido às especificações do sistema do Japão, após o administrador efetuar o lance, não é possível cancelar, alterar ou realizar devoluções sob nenhuma circunstância.'}
                  </div>
                </div>
              </label>

              {/* 項目3: 支払い期限 */}
              <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsChecked.item3}
                  onChange={(e) => setTermsChecked(prev => ({ ...prev, item3: e.target.checked }))}
                  className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1 text-sm text-gray-700">
                  <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span className="text-indigo-600">3.</span>
                    {lang === 'es' ? 'Plazo de Pago' : 'Prazo de Pagamento'}
                  </div>
                  <div>
                    {lang === 'es'
                      ? 'Debe completar el pago utilizando el método seleccionado y enviar el comprobante dentro de los 2 días posteriores a la adjudicación del producto (compra confirmada). Si se excede el plazo, la garantía se aplicará como multa y se suspenderá la cuenta.'
                      : 'Você deve concluir o pagamento utilizando o método selecionado e enviar o comprovante dentro de 2 dias após a arrematação do produto (compra confirmada). Se o prazo for excedido, a garantia será aplicada como multa e a conta será suspensa.'}
                  </div>
                </div>
              </label>

              {/* 項目4: 諸経費・関税の自己負担 */}
              <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsChecked.item4}
                  onChange={(e) => setTermsChecked(prev => ({ ...prev, item4: e.target.checked }))}
                  className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1 text-sm text-gray-700">
                  <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span className="text-indigo-600">4.</span>
                    {lang === 'es' ? 'Gastos y Aduanas' : 'Custos e Alfândega'}
                  </div>
                  <div>
                    {lang === 'es'
                      ? 'Además del monto mostrado, el envío internacional y los aranceles generados en la importación corren por cuenta del cliente. Asimismo, el monto mostrado antes de ofertar no incluye el envío nacional en Japón, y el monto total puede aumentar debido a la contraoferta del administrador.'
                      : 'Além do valor exibido, o frete internacional e os impostos de importação correm por conta do cliente. Além disso, o valor exibido antes de dar o lance não inclui o frete nacional no Japão, e o valor total pode aumentar devido à contraoferta do administrador.'}
                  </div>
                </div>
              </label>

              {/* 項目5: 現状渡しの同意 */}
              <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsChecked.item5}
                  onChange={(e) => setTermsChecked(prev => ({ ...prev, item5: e.target.checked }))}
                  className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="flex-1 text-sm text-gray-700">
                  <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span className="text-indigo-600">5.</span>
                    {lang === 'es' ? 'Compra en Estado Actual' : 'Compra no Estado Atual'}
                  </div>
                  <div>
                    {lang === 'es'
                      ? 'Especialmente en el caso de artículos usados, usted acepta que comprende los riesgos de mal funcionamiento, arañazos o suciedad, y no realizará reclamaciones ni devoluciones. Por favor, verifique bien el estado utilizando la traducción u otros medios antes de realizar una oferta. En caso de accidentes durante el envío, se aplicarán las normas de la empresa de transporte.'
                      : 'Especialmente no caso de itens usados, você aceita que compreende os riscos de mau funcionamento, arranhões ou sujeira, e não realizará reclamações ou devoluções. Por favor, verifique bem o estado usando a tradução ou outros meios antes de fazer um lance. Os acidentes de envio serão regidos pelas normas da transportadora.'}
                  </div>
                </div>
              </label>

              {/* 項目6: B001/ブラジルエージェント向け - 現地引き渡し・税関免責 */}
              {(currentUser?.customerId === 'B001' || currentUser?.agentCustomerId === 'B001' || (currentUser?.role === 'agent' && ((currentUser?.country || '').toLowerCase() === 'brasil' || (currentUser?.country || '').toLowerCase() === 'brazil'))) && (
                <label className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={termsChecked.item6}
                    onChange={(e) => setTermsChecked(prev => ({ ...prev, item6: e.target.checked }))}
                    className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1 text-sm text-gray-700">
                    <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                      <span className="text-indigo-600">6.</span>
                      {lang === 'es' ? 'Reconocimiento de Retiro Local y Exención Aduanera' : 'Reconhecimento de Retirada Local e Isenção Aduaneira'}
                    </div>
                    <div className="space-y-2 text-xs text-gray-600">
                      {lang === 'es' ? (
                        <>
                          <p>1. EL CLIENTE declara estar consciente de que la entrega de las mercancías intermediadas por la plataforma JOGALIBRE ocurrirá exclusivamente en territorio paraguayo, en la dirección indicada al momento del retiro.</p>
                          <p>2. La responsabilidad de JOGALIBRE (FF GLOBAL NEGOCIOS E INTERMEDIAÇÕES) y de sus socios internacionales se limita estrictamente a la disponibilidad del producto en el lugar de retiro acordado.</p>
                          <p>3. Toda obligación referente al transporte transfronterizo, tránsito aduanero, declaración de equipaje acompañado y pago de tributos o tasas ante la Receita Federal de Brasil (conforme a la cuota de exención de tributos terrestres vigente) es de responsabilidad única, exclusiva e intransferible del CLIENTE.</p>
                          <p>4. JOGALIBRE no se responsabiliza por eventuales retenciones, incautaciones, multas o penalidades aplicadas por las autoridades fiscales o policiales en el cruce de la frontera o en territorio brasileño.</p>
                        </>
                      ) : (
                        <>
                          <p>1. O CLIENTE declara estar ciente de que a entrega das mercadorias intermediadas pela plataforma JOGALIBRE ocorrerá exclusivamente em território paraguaio, no endereço indicado no momento da retirada.</p>
                          <p>2. A responsabilidade da JOGALIBRE (FF GLOBAL NEGOCIOS E INTERMEDIAÇÕES) e de seus parceiros internacionais limita-se estritamente à disponibilização do produto no local de retirada acordado.</p>
                          <p>3. Toda e qualquer obrigação referente ao transporte transfronteiriço, trânsito aduaneiro, declaração de bagagem acompanhada e pagamento de tributos ou taxas perante a Receita Federal do Brasil (conforme a cota de isenção de tributos terrestres vigente) é de responsabilidade única, exclusiva e intransferível do CLIENTE.</p>
                          <p>4. A JOGALIBRE não se responsabiliza por eventuais retenções, apreensões, multas ou penalidades aplicadas pelas autoridades fiscais ou policiais na travessia da fronteira ou em território brasileiro.</p>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              )}

              {/* フッター / 送信ボタン */}
              <div className="pt-4 border-t border-gray-100 sticky bottom-0 bg-white">
                <button
                  type="submit"
                  disabled={!termsChecked.item1 || !termsChecked.item2 || !termsChecked.item3 || !termsChecked.item4 || !termsChecked.item5 || ((currentUser?.customerId === 'B001' || currentUser?.agentCustomerId === 'B001' || (currentUser?.role === 'agent' && ((currentUser?.country || '').toLowerCase() === 'brasil' || (currentUser?.country || '').toLowerCase() === 'brazil'))) && !termsChecked.item6)}
                  className={`w-full py-4 rounded-xl font-bold text-base transition duration-200 shadow-lg ${
                    (termsChecked.item1 && termsChecked.item2 && termsChecked.item3 && termsChecked.item4 && termsChecked.item5 && (!(currentUser?.customerId === 'B001' || currentUser?.agentCustomerId === 'B001' || (currentUser?.role === 'agent' && ((currentUser?.country || '').toLowerCase() === 'brasil' || (currentUser?.country || '').toLowerCase() === 'brazil'))) || termsChecked.item6))
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-200'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  {lang === 'es' ? 'Aceptar y comenzar' : 'Aceitar e começar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 保証金入金催促モーダル */}
      {showDepositReminder && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[140] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col my-8 animate-in fade-in zoom-in duration-300 relative p-6">
            {/* 閉じるボタン ✕ */}
            <button
              onClick={() => setHasClosedDepositReminder(true)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition duration-200 font-bold"
              aria-label="Close"
            >
              ✕
            </button>

            {/* ヘッダー */}
            <div className="text-center mt-2 mb-4">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-500 text-2xl mx-auto mb-3">
                ⚠️
              </span>
              <h2 className="text-lg sm:text-xl font-black text-gray-900">
                {(currentUser?.language || lang) === 'es' ? 'Depósito de Garantía Requerido' : 'Depósito de Garantia Necessário'}
              </h2>
            </div>

            {/* 説明文 */}
            <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
              {(currentUser?.language || lang) === 'es' 
                ? 'Para comenzar a realizar ofertas en las subastas de Yahoo Japón, es necesario completar el pago del depósito de garantía.' 
                : 'Para começar a realizar lances nos leilões do Yahoo Japão, é necessário concluir o pagamento do depósito de garantia.'}
            </p>

            {/* 保証金ボックス */}
            <div className="h-14 px-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100/80 shadow-sm flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                  {(currentUser?.language || lang) === 'es' ? 'Garantía' : 'Garantia'}:
                </span>
                <span className="text-base sm:text-lg font-bold text-gray-800 leading-none">
                  ${(currentUser?.depositAmount !== undefined && currentUser?.depositAmount !== null) ? currentUser.depositAmount : (currentUser?.role === 'agent' ? 500 : 100)}
                </span>
              </div>
              <div>
                <button
                  onClick={() => {
                    const depositItem = {
                      id: 'deposit',
                      productTitle: (currentUser?.language || lang) === 'es' ? 'Depósito de garantía' : 'Depósito de garantia',
                      finalPrice: (currentUser?.depositAmount !== undefined && currentUser?.depositAmount !== null)
                        ? currentUser.depositAmount
                        : (currentUser?.role === 'agent' ? 500 : 100),
                      stockNumber: 'deposit'
                    };
                    openPaymentModal(depositItem as any);
                    setHasClosedDepositReminder(true);
                  }}
                  className="text-center text-xs text-white font-bold h-9 bg-green-600 hover:bg-green-700 rounded-lg px-3 shadow-sm transition whitespace-nowrap flex items-center justify-center"
                >
                  {(currentUser?.language || lang) === 'es' ? 'Método de Pago' : 'Método de Pagamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ログアウト確認モーダル */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-150 text-center">
            <div className="flex justify-center items-center gap-2 mb-6 max-w-full">
              <Image src="/icons/logo-mark.png" alt="JOGALIBRE Mark" width={28} height={28} className="object-contain h-6 sm:h-7 w-6 sm:w-7 flex-shrink-0" priority />
              <Image src="/icons/logo-text.png" alt="JOGALIBRE Text" width={321} height={24} className="object-contain h-6 sm:h-7 w-auto flex-shrink min-w-[120px] max-w-[200px]" priority />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {lang === 'es' ? 'Confirmar cierre de sesión' : lang === 'pt' ? 'Confirmar saída' : 'ログアウトの確認'}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {lang === 'es' ? '¿Estás seguro de que deseas cerrar sesión?' : lang === 'pt' ? 'Tem certeza de que deseja sair?' : 'ログアウトしてもよろしいですか？'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                {lang === 'es' ? 'Cancelar' : lang === 'pt' ? 'Cancelar' : 'キャンセル'}
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors shadow-sm text-sm"
              >
                {lang === 'es' ? 'Cerrar sesión' : lang === 'pt' ? 'Sair' : 'ログアウト'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal (For PWA and in-app viewing) */}
      {showPdfViewerModal && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/90 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-4 bg-white border-b shadow-sm">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <span className="text-xl">📄</span>
              {lang === 'es' ? 'Términos y Condiciones' : 'Termos e Condições'}
            </h3>
            <button
              onClick={() => setShowPdfViewerModal(false)}
              className="px-5 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-bold transition-colors flex items-center gap-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              {lang === 'es' ? 'Cerrar' : 'Fechar'}
            </button>
          </div>
          <div className="flex-1 w-full p-2 sm:p-4 md:p-8 flex justify-center items-center">
            <iframe
              src="/api/terms-pdf"
              className="w-full h-full max-w-4xl rounded-xl shadow-2xl bg-white"
              title="Terms PDF"
            />
          </div>
        </div>
      )}

    </div>
  );
}
