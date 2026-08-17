'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { signIn, signOut, getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/push-notifications';
import { formatDateTime, formatDateOnly, getTimeRemaining, calculateLocalCost, calculateJapanSendAmount, calculateDefaultFobCost, calculateDefaultShippingCost, calculateProductBidJpy, deliveryLocations, getCountryNameJa, getCityNameJa } from '@/lib/utils';
import { BidRequest } from '@/lib/types';

// 管理者画面用のPWA manifest差し替え
function useAdminManifest() {
  useEffect(() => {
    // manifest を管理者用に差し替え
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.setAttribute('href', '/manifest-admin.json');
    }
    // favicon を管理者用に差し替え
    const iconLink = document.querySelector('link[rel="icon"]');
    if (iconLink) {
      iconLink.setAttribute('href', '/icons/admin-icon.png');
    }
    const appleIconLink = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIconLink) {
      appleIconLink.setAttribute('href', '/icons/admin-icon.png');
    }
  }, []);
}

export default function AdminDashboard() {
  useAdminManifest();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [bidRequests, setBidRequests] = useState<BidRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [shippingCostJpy, setShippingCostJpy] = useState('');
  const [fobCostJpy, setFobCostJpy] = useState('1,500');
  const [selectedRequest, setSelectedRequest] = useState<BidRequest | null>(null);
  const [actionType, setActionType] = useState<'reject' | 'counter' | 'won' | null>(null);
  const [finalPriceInput, setFinalPriceInput] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [totalJpyInput, setTotalJpyInput] = useState('');
  const [wonPriceJpyInput, setWonPriceJpyInput] = useState('');
  const [wonShippingJpyInput, setWonShippingJpyInput] = useState('');
  const [wonFobJpyInput, setWonFobJpyInput] = useState('');
  const [exchangeRate, setExchangeRate] = useState(150);
  const [exchangeRates, setExchangeRates] = useState<{ [key: string]: number }>({ JPY: 150, BRL: 5.6, PYG: 7500 });
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  const [activeTab, setActiveTab] = useState<'requests' | 'purchased' | 'deposits' | 'shipping' | 'customers' | 'agents' | 'financials'>('requests');
  const [purchasedItems, setPurchasedItems] = useState<BidRequest[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [agentsList, setAgentsList] = useState<any[]>([]);
  
  // Financials State
  const [financialMonth, setFinancialMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [financialData, setFinancialData] = useState<any>(null);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);
  
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    depositAmount: 0,
    depositConfirmed: false,
    agentCustomerId: ''
  });
  const [editingStockItem, setEditingStockItem] = useState<{ id: string; title: string; stockNumber: string } | null>(null);
  const [editingInvoiceItem, setEditingInvoiceItem] = useState<{ id: string; title: string; invoiceNumber: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null); // ヤフオク同期中のリクエストID

  // ヤフオク以外の商品の手動追加用ステート
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualAddForm, setManualAddForm] = useState({
    productTitle: '',
    productUrl: '',
    customerId: '',
    createdAt: '',
    finalPrice: '',
    deliveryCountry: 'JP',
    deliveryCity: '',
    shippingMethod: 'sea',
  });

  // クライアントマウント時に今日の日付をセットする
  useEffect(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    const todayStr = localToday.toISOString().split('T')[0];
    setManualAddForm(prev => ({
      ...prev,
      createdAt: todayStr
    }));
  }, []);
  const [manualAddImage, setManualAddImage] = useState<File | null>(null);
  const [manualAddImagePreview, setManualAddImagePreview] = useState<string | null>(null);
  const [isSubmittingManualAdd, setIsSubmittingManualAdd] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSelectedCustomerInfo = (customerId: string) => {
    if (!customerId) return null;
    const customer = customersList.find(c => c.customer_id === customerId);
    if (customer) {
      const agent = customer.agent_customer_id
        ? agentsList.find(a => a.customer_id === customer.agent_customer_id)
        : null;
      return {
        role: 'customer',
        name: customer.full_name || customer.email.split('@')[0],
        agentName: agent ? (agent.full_name || agent.email.split('@')[0]) : null,
      };
    }
    const agent = agentsList.find(a => a.customer_id === customerId);
    if (agent) {
      return {
        role: 'agent',
        name: agent.full_name || agent.email.split('@')[0],
        agentName: null,
      };
    }
    return null;
  };

  const getDeliveryLocationName = (loc?: string, city?: string) => {
    if (city) return city;
    if (loc === 'JP') return '日本 🇯🇵';
    if (loc === 'ASU') return 'アスンシオン 🇵🇾';
    if (loc === 'CDE') return 'シウダー・デル・エステ 🇵🇾';
    if (loc === 'ENC') return 'エンカルナシオン 🇵🇾';
    if (loc === 'PJC') return 'ペドロ・フアン・カバジェロ 🇵🇾';
    if (loc === 'SNT') return 'サンティアゴ 🇨🇱';
    if (loc === 'IQQ') return 'イキケ 🇨🇱';
    if (loc === 'LPZ') return 'ラパス 🇧🇴';
    if (loc === 'SCZ') return 'サンタ・クルス 🇧🇴';
    if (loc === 'BUE') return 'ブエノスアイレス 🇦🇷';
    return loc || '-';
  };

  const getCurrencySymbol = (currency: string) => {
    if (currency === 'USD') return '$';
    if (currency === 'BRL') return 'R$';
    if (currency === 'PYG') return '₲';
    if (currency === 'CLP') return 'CLP$';
    if (currency === 'BOB') return 'Bs';
    if (currency === 'ARS') return '$';
    return currency;
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
      finalConverted = Math.ceil(rounded / 10) * 10;
    } else if (targetCurrency === 'PYG' || targetCurrency === 'CLP' || targetCurrency === 'ARS') {
      finalConverted = Math.ceil(rounded / 1000) * 1000;
    } else {
      finalConverted = Math.ceil(rounded);
    }
    
    return `${getCurrencySymbol(targetCurrency)} ${finalConverted.toLocaleString('en-US').replace(/,/g, '.')}`;
  };

  const formatLocalCost = (cost: number | string, targetCurrency: string = selectedCurrency): string => {
    if (typeof cost === 'string') {
      const lower = cost.trim().toLowerCase();
      if (lower === 'unavailable' || lower === '発送不可' || lower === 'no disponible' || lower === 'não disponível') {
        return '発送不可 ❌';
      }
      if (lower === 'consultar' || lower === '要問い合わせ' || lower === '要問合せ') {
        return '要問い合わせ 💬';
      }
      return cost;
    }
    return convertUSDToSelectedCurrency(cost, targetCurrency);
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAddForm.productTitle || !manualAddForm.customerId || !manualAddForm.finalPrice || !manualAddForm.createdAt) {
      alert('必須項目を入力してください。');
      return;
    }
    setIsSubmittingManualAdd(true);

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localToday = new Date(today.getTime() - (offset * 60 * 1000));
      const todayStr = localToday.toISOString().split('T')[0];
      const isToday = manualAddForm.createdAt === todayStr;

      // 配送先の設定
      const deliveryLocation = manualAddForm.deliveryCountry === 'JP' ? 'JP' : manualAddForm.deliveryCity;
      const deliveryCountryName = getCountryNameJa(manualAddForm.deliveryCountry);
      const deliveryCityName = manualAddForm.deliveryCountry === 'JP' ? null : getCityNameJa(manualAddForm.deliveryCountry, manualAddForm.deliveryCity);

      const formData = new FormData();
      formData.append('productTitle', manualAddForm.productTitle);
      if (manualAddForm.productUrl) {
        formData.append('productUrl', manualAddForm.productUrl);
      }
      formData.append('customerId', manualAddForm.customerId);
      formData.append('createdAt', manualAddForm.createdAt);
      formData.append('isToday', isToday ? 'true' : 'false');
      formData.append('finalPrice', manualAddForm.finalPrice);
      formData.append('deliveryLocation', deliveryLocation);
      if (deliveryCountryName) formData.append('deliveryCountry', deliveryCountryName);
      if (deliveryCityName) formData.append('deliveryCity', deliveryCityName);
      formData.append('shippingMethod', manualAddForm.shippingMethod);
      if (manualAddImage) {
        formData.append('image', manualAddImage);
      }

      const res = await fetch('/api/bid-request/manual', {
        method: 'POST',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: formData
      });

      if (res.ok) {
        alert('商品を登録しました。');
        setShowManualAddModal(false);
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const localToday = new Date(today.getTime() - (offset * 60 * 1000));
        const todayStr = localToday.toISOString().split('T')[0];
        setManualAddForm({
          productTitle: '',
          productUrl: '',
          customerId: '',
          createdAt: todayStr,
          finalPrice: '',
          deliveryCountry: 'JP',
          deliveryCity: '',
          shippingMethod: 'sea',
        });
        setManualAddImage(null);
        setManualAddImagePreview(null);
        fetchBidRequests();
      } else {
        const errorData = await res.json();
        alert('登録に失敗しました: ' + (errorData.error || res.statusText));
      }
    } catch (error) {
      console.error('Error submitting manual add:', error);
      alert('通信エラーが発生しました。');
    } finally {
      setIsSubmittingManualAdd(false);
    }
  };

  // 入金管理用のステート
  const [depositsList, setDepositsList] = useState<any[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [depositForm, setDepositForm] = useState({
    customerId: '',
    depositDate: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'bank',
    currency: 'USD',
    usdAmount: '',
    depositType: '商品代金'
  });
  const [editingDeposit, setEditingDeposit] = useState<any | null>(null);
  const [editDepositForm, setEditDepositForm] = useState({
    depositDate: '',
    amount: '',
    paymentMethod: 'bank',
    currency: 'USD',
    usdAmount: '',
    depositType: '商品代金'
  });
  const [depositFilterCustomer, setDepositFilterCustomer] = useState<string>('all');
  const [depositFilterYear, setDepositFilterYear] = useState<string>('all');
  const [depositFilterMonth, setDepositFilterMonth] = useState<string>('all');

  // 入金登録フォーム用および編集モーダル用のB001紐づき・ブラジルAGT判定
  const selectedCustInfoForForm = customersList.find(c => c.customerId === depositForm.customerId) || agentsList.find(a => a.customerId === depositForm.customerId);
  const parentAgentForForm = selectedCustInfoForForm?.agentCustomerId ? agentsList.find(a => a.customerId === selectedCustInfoForForm.agentCustomerId) : null;
  const isB001LinkedForForm = selectedCustInfoForForm?.customerId === 'B001' || selectedCustInfoForForm?.agentCustomerId === 'B001';
  const isBrasilAgentForForm = 
    (selectedCustInfoForForm?.customerId?.startsWith('A') && 
      ((selectedCustInfoForForm?.country || '').trim().toLowerCase() === 'brasil' || 
       (selectedCustInfoForForm?.country || '').trim().toLowerCase() === 'brazil')) ||
    (parentAgentForForm?.customerId?.startsWith('A') &&
      ((parentAgentForForm?.country || '').trim().toLowerCase() === 'brasil' || 
       (parentAgentForForm?.country || '').trim().toLowerCase() === 'brazil')) ||
    ((selectedCustInfoForForm?.country || '').trim().toLowerCase() === 'brasil' || 
     (selectedCustInfoForForm?.country || '').trim().toLowerCase() === 'brazil');
  const isB001LinkedOrBrasilForForm = isB001LinkedForForm || isBrasilAgentForForm;

  const selectedCustInfoForEdit = editingDeposit ? (customersList.find(c => c.customerId === editingDeposit.customer_id) || agentsList.find(a => a.customerId === editingDeposit.customer_id)) : null;
  const parentAgentForEdit = selectedCustInfoForEdit?.agentCustomerId ? agentsList.find(a => a.customerId === selectedCustInfoForEdit.agentCustomerId) : null;
  const isB001LinkedForEdit = selectedCustInfoForEdit?.customerId === 'B001' || selectedCustInfoForEdit?.agentCustomerId === 'B001';
  const isBrasilAgentForEdit = 
    (selectedCustInfoForEdit?.customerId?.startsWith('A') && 
      ((selectedCustInfoForEdit?.country || '').trim().toLowerCase() === 'brasil' || 
       (selectedCustInfoForEdit?.country || '').trim().toLowerCase() === 'brazil')) ||
    (parentAgentForEdit?.customerId?.startsWith('A') &&
      ((parentAgentForEdit?.country || '').trim().toLowerCase() === 'brasil' || 
       (parentAgentForEdit?.country || '').trim().toLowerCase() === 'brazil')) ||
    ((selectedCustInfoForEdit?.country || '').trim().toLowerCase() === 'brasil' || 
     (selectedCustInfoForEdit?.country || '').trim().toLowerCase() === 'brazil');
  const isB001LinkedOrBrasilForEdit = isB001LinkedForEdit || isBrasilAgentForEdit;

  // 招待コード管理用のステートと関数
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [latestGeneratedCode, setLatestGeneratedCode] = useState<string>('');

  const fetchInviteCodes = async () => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/admin/invite-code', {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      if (data.inviteCodes) {
        setInviteCodes(data.inviteCodes);
      }
    } catch (err) {
      console.error('Error fetching invite codes:', err);
    }
  };

  const handleGenerateInviteCode = async () => {
    if (isGeneratingCode) return;
    setIsGeneratingCode(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/admin/invite-code', {
        method: 'POST',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      if (res.ok && data.inviteCode) {
        setLatestGeneratedCode(data.inviteCode.code);
        fetchInviteCodes();
      } else {
        alert('招待コードの生成に失敗しました: ' + (data.error || ''));
      }
    } catch (err) {
      console.error('Error generating invite code:', err);
      alert('通信エラーが発生しました。');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('コピーしました: ' + text);
  };

  // ヤフオク最新情報を同期・復旧する処理
  const handleSyncYahooProduct = async (requestItem: BidRequest) => {
    if (isSyncing) return;
    setIsSyncing(requestItem.id);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/admin/sync-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ requestId: requestItem.id })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message);
        await fetchBidRequests(); // データを再取得して表示を更新
      } else {
        alert(data.message || data.error || 'ヤフオク同期に失敗しました。');
      }
    } catch (err) {
      console.error('Error syncing yahoo product:', err);
      alert('通信エラーが発生しました。');
    } finally {
      setIsSyncing(null);
    }
  };

  const fetchUsersData = async () => {
    setLoadingUsers(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;
      
      const res = await fetch(`/api/admin/users?t=${Date.now()}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        cache: 'no-store'
      });
      const data = await res.json();
      if (data.customers) setCustomersList(data.customers);
      if (data.agents) setAgentsList(data.agents);
    } catch (error) {
      console.error('Error fetching users data:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          userId: editingUser.id,
          depositAmount: editForm.depositAmount,
          depositConfirmed: editForm.depositConfirmed,
          agentCustomerId: editingUser.role === 'customer' ? editForm.agentCustomerId : undefined
        })
      });

      if (res.ok) {
        alert('ユーザー情報を更新しました');
        setEditingUser(null);
        fetchUsersData();
      } else {
        const err = await res.json();
        alert(`更新に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('通信エラーが発生しました');
    }
  };
  const fetchDeposits = async () => {
    setLoadingDeposits(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;
      
      const res = await fetch('/api/admin/deposits', {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();
      if (data.deposits) {
        setDepositsList(data.deposits);
      }
    } catch (error) {
      console.error('Error fetching deposits:', error);
    } finally {
      setLoadingDeposits(false);
    }
  };

  const handleCreateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositForm.customerId || !depositForm.depositDate || !depositForm.amount || !depositForm.paymentMethod) {
      alert('すべての項目を入力してください');
      return;
    }

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const isBRL = isB001LinkedOrBrasilForForm && depositForm.currency === 'BRL';
      const actualPaymentMethod = isBRL ? `${depositForm.paymentMethod}_brl` : depositForm.paymentMethod;
      const usdAmount = isBRL && depositForm.usdAmount ? parseFloat(depositForm.usdAmount) : null;

      // BRL入金時のUSD換算額は必須
      if (isBRL && !depositForm.usdAmount) {
        alert('BRL入金の場合はUSD換算額を入力してください');
        return;
      }

      const res = await fetch('/api/admin/deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          customerId: depositForm.customerId,
          depositDate: depositForm.depositDate,
          amount: parseFloat(depositForm.amount),
          paymentMethod: actualPaymentMethod,
          usdAmount: usdAmount,
          depositType: depositForm.depositType
        })
      });

      if (res.ok) {
        alert('入金情報を登録しました');
        setDepositForm({
          ...depositForm,
          customerId: '',
          amount: '',
          currency: 'USD',
          paymentMethod: 'bank',
          usdAmount: '',
          depositType: '商品代金'
        });
        fetchDeposits();
      } else {
        const err = await res.json();
        alert(`登録に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error creating deposit:', error);
      alert('通信エラーが発生しました');
    }
  };

  const fetchFinancials = async (month: string) => {
    setIsLoadingFinancials(true);
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;
      const res = await fetch(`/api/admin/financials?month=${month}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setFinancialData(data);
      } else {
        setFinancialData(null);
      }
    } catch (error) {
      console.error('Error fetching financials:', error);
      setFinancialData(null);
    } finally {
      setIsLoadingFinancials(false);
    }
  };

  const handleUpdateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeposit) return;

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const isBRL = isB001LinkedOrBrasilForEdit && editDepositForm.currency === 'BRL';
      const actualPaymentMethod = isBRL ? `${editDepositForm.paymentMethod}_brl` : editDepositForm.paymentMethod;
      const usdAmount = isBRL && editDepositForm.usdAmount ? parseFloat(editDepositForm.usdAmount) : null;

      // BRL入金時のUSD換算額は必須
      if (isBRL && !editDepositForm.usdAmount) {
        alert('BRL入金の場合はUSD換算額を入力してください');
        return;
      }

      const res = await fetch('/api/admin/deposits', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          id: editingDeposit.id,
          depositDate: editDepositForm.depositDate,
          amount: parseFloat(editDepositForm.amount),
          paymentMethod: actualPaymentMethod,
          usdAmount: usdAmount,
          depositType: editDepositForm.depositType
        })
      });

      if (res.ok) {
        alert('入金情報を更新しました');
        setEditingDeposit(null);
        fetchDeposits();
      } else {
        const err = await res.json();
        alert(`更新に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error updating deposit:', error);
      alert('通信エラーが発生しました');
    }
  };

  const handleDeleteDeposit = async (id: string) => {
    if (!confirm('この入金履歴を削除してもよろしいですか？')) return;

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/admin/deposits?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });

      if (res.ok) {
        alert('入金履歴を削除しました');
        setEditingDeposit(null);
        fetchDeposits();
      } else {
        const err = await res.json();
        alert(`削除に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error deleting deposit:', error);
      alert('通信エラーが発生しました');
    }
  };

  const getFilteredDeposits = () => {
    let filtered = depositsList;

    if (depositFilterCustomer !== 'all') {
      if (depositFilterCustomer === 'B001_FFGN') {
        const linkedCustomerIds = customersList
          .filter(c => c.agentCustomerId === 'B001')
          .map(c => c.customerId);
        const brasilAgentIds = [
          ...customersList.filter(c => c.customerId?.startsWith('A') && ((c.country || '').trim().toLowerCase() === 'brasil' || (c.country || '').trim().toLowerCase() === 'brazil')).map(c => c.customerId),
          ...agentsList.filter(a => a.customerId?.startsWith('A') && ((a.country || '').trim().toLowerCase() === 'brasil' || (a.country || '').trim().toLowerCase() === 'brazil')).map(a => a.customerId)
        ];
        filtered = filtered.filter(item => 
          item.customer_id === 'B001' || linkedCustomerIds.includes(item.customer_id) || brasilAgentIds.includes(item.customer_id)
        );
      } else {
        filtered = filtered.filter(item => item.customer_id === depositFilterCustomer);
      }
    }

    if (depositFilterYear !== 'all') {
      filtered = filtered.filter(item => {
        if (!item.deposit_date) return false;
        const date = new Date(item.deposit_date);
        return date.getFullYear().toString() === depositFilterYear;
      });
    }

    if (depositFilterMonth !== 'all') {
      filtered = filtered.filter(item => {
        if (!item.deposit_date) return false;
        const date = new Date(item.deposit_date);
        return (date.getMonth() + 1).toString() === depositFilterMonth;
      });
    }

    return filtered;
  };

  const exportDepositsCSV = () => {
    const items = getFilteredDeposits();

    if (items.length === 0) {
      alert('エクスポートするデータがありません。');
      return;
    }

    const headers = ['日付', 'ID', '氏名', '通貨', '入金額', '内容', '支払方法', 'USD換算額'];

    const customerMap = new Map<string, string>();
    customersList.forEach(c => customerMap.set(c.customerId, c.fullName || c.customerName || ''));
    agentsList.forEach(a => customerMap.set(a.customerId, a.fullName || a.customerName || ''));

    const paymentMethodNames: Record<string, string> = {
      bank: '銀行',
      paypal: 'PayPal',
      usdt: 'USDT',
      card: 'カード',
      card_brl: 'カード (BRL)',
      pix_brl: 'PIX',
      cash_brl: '現金 (BRL)',
      cash: '現金',
      pix: 'PIX'
    };

    const rows = items.map(item => {
      const name = customerMap.get(item.customer_id) || '';
      const isBrl = item.payment_method?.endsWith('_brl');
      const currency = isBrl ? 'BRL' : 'USD';
      const usdEquivalent = item.usd_amount !== null && item.usd_amount !== undefined ? item.usd_amount : item.amount;
      return [
        item.deposit_date.replace(/-/g, '/'),
        item.customer_id,
        `"${name.replace(/"/g, '""')}"`,
        currency,
        item.amount,
        `"${(item.deposit_type || '').replace(/"/g, '""')}"`,
        paymentMethodNames[item.payment_method] || item.payment_method,
        usdEquivalent
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `JOGALIBRE_入金履歴_${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [purchasedYear, setPurchasedYear] = useState<string>('all');
  const [purchasedMonth, setPurchasedMonth] = useState<string>('all');
  const [shippingStatusFilter, setShippingStatusFilter] = useState<string>('all');

  const [notificationStatus, setNotificationStatus] = useState<'loading' | 'enabled' | 'disabled' | 'unsupported'>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

      if (data && data.some((n: any) => !n.is_read)) {
        await supabase
          .from('app_notifications')
          .update({ is_read: true })
          .eq('user_id', currentUser.id)
          .eq('is_read', false);
        fetchUnreadCount();
      }
    } catch (e) {
      console.error('Error fetching admin notifications:', e);
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

      if (!error && count !== null) {
        setUnreadCount(count);
      }
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

  useEffect(() => {
    if (currentUser) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);


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

  // セッションチェック（最初に実行）
  useEffect(() => {
    // 初回セッション復元
    getCurrentUser().then(user => {
      if (user?.role === 'admin') {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
    }).catch(() => {
      setCurrentUser(null);
    }).finally(() => {
      setLoading(false);
    });

    // セッション変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setLoading(false);
      } else if (session?.user) {
        // SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED 等でセッション復元
        const user = await getCurrentUser(session.user);
        if (user?.role === 'admin') {
          setCurrentUser(user);
        } else if (event === 'SIGNED_IN') {
          // 管理者以外がログインした場合
          await supabase.auth.signOut({ scope: 'local' });
          alert('管理者アカウントでログインしてください');
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 1. ログイン時に全タブの情報を一括並列取得（全タブ事前ロード）
  // ログイン完了時にすべてのタブデータを先読みしておくことで、タブ切り替え時の待ち時間を0msにします
  useEffect(() => {
    if (currentUser) {
      Promise.allSettled([
        fetchBidRequests(),
        fetchPurchasedItems(),
        fetchShippingContainers(),
        fetchDeposits(),
        fetchUsersData(),
        fetchFinancials(financialMonth),
        fetchInviteCodes(),
        fetchExchangeRate()
      ]);
    }
  }, [currentUser]);

  // 2. タブ切り替え時または定期更新（バックグラウンドで最新データを同期）
  useEffect(() => {
    if (currentUser) {
      if (activeTab === 'requests') {
        fetchBidRequests();
      } else if (activeTab === 'purchased') {
        fetchPurchasedItems();
        fetchShippingContainers();
      } else if (activeTab === 'deposits') {
        fetchDeposits();
        fetchUsersData();
        fetchPurchasedItems();
      } else if (activeTab === 'shipping') {
        fetchPurchasedItems();
        fetchUsersData();
        fetchShippingContainers();
      } else if (activeTab === 'financials') {
        fetchFinancials(financialMonth);
      } else {
        fetchUsersData();
        if (activeTab === 'agents') {
          fetchInviteCodes();
        }
      }
      fetchExchangeRate();

      // 定期更新は入札リクエスト画面のみとする
      let interval: NodeJS.Timeout | null = null;
      if (activeTab === 'requests') {
        interval = setInterval(fetchBidRequests, 30000);
      }
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [currentUser, activeTab, financialMonth]);

  // PWA (ホーム画面追加時) 向けのカスタム Pull-to-Refresh 実装
  useEffect(() => {
    let startY = 0;
    let isPulling = false;
    let isAtTop = true;

    const handleTouchStart = (e: TouchEvent) => {
      isAtTop = window.scrollY <= 5;
      if (isAtTop) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || !isAtTop) return;
      const pullDistance = e.touches[0].clientY - startY;
      setIsRefreshing(pullDistance > 100);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isPulling || !isAtTop) return;
      const pullDistance = e.changedTouches[0].clientY - startY;

      if (pullDistance > 120 && isAtTop) {
        setIsRefreshing(true);
        setTimeout(async () => {
          try {
            if (activeTab === 'purchased') {
              await fetchPurchasedItems();
            } else if (activeTab === 'requests') {
              await fetchBidRequests();
            } else if (activeTab === 'deposits') {
              await fetchDeposits();
              await fetchUsersData();
              await fetchPurchasedItems();
            } else if (activeTab === 'shipping') {
              await fetchUsersData();
              await fetchPurchasedItems();
              await fetchShippingContainers();
            } else {
              await fetchUsersData();
            }
          } catch (error) {
            console.error('Refresh error:', error);
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
  }, [activeTab, currentUser]);

  // 通知状態チェック＆自動再登録
  useEffect(() => {
    if (currentUser) {
      // ブラウザの許可状態を確認
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          // ブラウザ許可済みの場合は即座に通知有効（🔕 通知停止）状態を保持
          setNotificationStatus('enabled');
          (async () => {
            try {
              const subscription = await requestNotificationPermission();
              if (subscription) {
                await fetch('/api/push-subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: currentUser.id, subscription }),
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
          setNotificationStatus('disabled'); // default
        }
      } else {
        setNotificationStatus('unsupported');
      }
    }
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(loginForm.email, loginForm.password);
      // onAuthStateChange が SIGNED_IN イベントで自動的にユーザーを設定する
      // ロールチェックは onAuthStateChange 内で行われる（admin のみ setCurrentUser）
      setLoginForm({ email: '', password: '' });
    } catch (error) {
      console.error('Login error:', error);
      alert('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    }
  };

  const handleLogout = async () => {
    // ログアウト前にPushサブスクリプションを削除
    if (currentUser) {
      try {
        await fetch('/api/push-subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
      } catch (err) {
        console.error('Push subscription cleanup error:', err);
      }
    }
    // 直ちにログアウト完了状態にしてログイン画面を表示（ページリロードや読み込み中画面を出さない）
    setLoading(false);
    setCurrentUser(null);
    await signOut();
  };

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

  // 為替レートをフォーマットするヘルパー関数
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




  const getFilteredPurchasedItems = () => {
    let filtered = purchasedItems;

    // 発送タブでは取消済の商品は非表示
    if (activeTab === 'shipping') {
      filtered = filtered.filter(item => !item.cancelledAt);
    }

    // 顧客IDでフィルタリング
    if (selectedCustomer !== 'all') {
      if (selectedCustomer === 'B001') {
        filtered = filtered.filter(item => {
          const isB001 = item.customerId === 'B001';
          const isB001Linked = item.agentCustomerId === 'B001';
          const countryLower = (item.customerCountry || '').trim().toLowerCase();
          const isBrasilAgent = item.customerId?.startsWith('A') && (countryLower === 'brasil' || countryLower === 'brazil');
          return isB001 || isB001Linked || isBrasilAgent;
        });
      } else {
        filtered = filtered.filter(item => item.customerId === selectedCustomer);
      }
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

    // 発送ステータスでフィルタリング（発送タブの場合のみ）
    if (activeTab === 'shipping' && shippingStatusFilter !== 'all') {
      filtered = filtered.filter(item => {
        const status = item.shippingStatus || 'not_shipped';
        return status === shippingStatusFilter;
      });
    }

    return filtered;
  };

  const fetchBidRequests = async () => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
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
        productTitleEs: req.product_title_es as string,
        productTitlePt: req.product_title_pt as string,
        productUrl: req.product_url as string,
        productImage: req.product_image as string,
        productPrice: req.product_price,
        productEndTime: req.product_end_time,
        maxBid: req.max_bid,
        customerName: req.customer_name,
        customerEmail: req.customer_email,
        customerFullName: req.customer_full_name,
        customerWhatsapp: req.customer_whatsapp,
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
        customerId: req.customer_id,
        customerRole: req.customer_role,
        agentCustomerId: req.agent_customer_id as string | null | undefined,
        customerCountry: req.customer_country as string | null | undefined,
        delivery_location: req.delivery_location as string | undefined,
        delivery_city: req.delivery_city as string | undefined,
        delivery_country: req.delivery_country as string | undefined,
        shipping_method: req.shipping_method as string | undefined,
        paid_local: req.paid_local || false,
        paid_local_at: req.paid_local_at as string | null | undefined,
        totalJpy: req.total_jpy
      }));

      setBidRequests(convertedRequests);
      setLoading(false);  // ← これを追加
    } catch (error) {
      console.error('Error fetching bid requests:', error);
      setLoading(false);  // ← エラー時も追加
    }
  };

  const fetchPurchasedItems = async () => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request?purchased=true', {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });
      const data = await res.json();

      // スネークケースからキャメルケースに変換
      const convertedItems = (data.purchasedItems || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        productTitle: item.product_title as string,
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
        paid: item.paid || false,
        paid_brazil: item.paid_brazil || false,
        paid_brazil_at: item.paid_brazil_at as string | null | undefined,
        paid_paraguay: item.paid_paraguay || false,
        paid_paraguay_at: item.paid_paraguay_at as string | null | undefined,
        paid_japan: item.paid_japan || false,
        paid_japan_at: item.paid_japan_at as string | null | undefined,
        stockNumber: item.stock_number as string,
        invoiceNumber: item.invoice_number as string,
        productId: item.product_id as string,
        customerId: item.customer_id as string,
        agentCustomerId: item.agent_customer_id as string | null | undefined,
        customerCountry: item.customer_country as string | null | undefined,
        delivery_location: item.delivery_location as string | undefined,
        delivery_city: item.delivery_city as string | undefined,
        delivery_country: item.delivery_country as string | undefined,
        shipping_method: item.shipping_method as string | undefined,
        paid_local: item.paid_local || false,
        paid_local_at: item.paid_local_at as string | null | undefined,
        totalJpy: item.total_jpy,
        cancelledAt: item.cancelledAt as string | null | undefined,
        shippingStatus: item.shipping_status as string | undefined,
        shippedAt: item.shipped_at as string | null | undefined,
        carrier: item.carrier as string | null | undefined,
        trackingNumber: item.tracking_number as string | null | undefined,
        trackingUrl: item.tracking_url as string | null | undefined,
        estimatedArrivalDate: item.estimated_arrival_date as string | null | undefined,
        updatedAt: item.updated_at as string | null | undefined,
        shippingUpdatedAt: item.shipping_updated_at as string | null | undefined
      }));

      setPurchasedItems(convertedItems);
    } catch (error) {
      console.error('Error fetching purchased items:', error);
    }
  };

  const getCustomerIdList = () => {
    const uniqueIds = new Set<string>();
    purchasedItems.forEach(item => {
      if (item.customerId) {
        uniqueIds.add(item.customerId);
      }
    });
    return Array.from(uniqueIds).sort((a, b) => a.localeCompare(b));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getCustomerTotalById = (customerId: string) => {
    return purchasedItems
      .filter(item => item.customerId === customerId)
      .reduce((sum, item) => sum + (item.finalPrice || 0), 0);
  };

  const updateStatus = async (id: string, status: string, reason?: string, counterOfferAmount?: number, shippingJpy?: number, totalJpy?: number) => {
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
          id,
          status,
          rejectReason: reason,
          counterOffer: counterOfferAmount,
          shippingCostJpy: shippingJpy,
          totalJpy: totalJpy
        })
      });

      if (res.ok) {
        fetchBidRequests();
        setSelectedRequest(null);
        setActionType(null);
        setRejectReason('');
        setShippingCostJpy('');
        setFobCostJpy('1,500');

        // プッシュ通知を送信（対象顧客のリクエストを特定）
        const targetRequest = bidRequests.find(r => r.id === id);
        const email = targetRequest?.customerEmail;
        if (email) {
          const lang = targetRequest?.language || 'es';
          const itemTitle = (lang === 'pt' ? (targetRequest as any)?.productTitlePt : (targetRequest as any)?.productTitleEs) || targetRequest?.productTitle || 'Item';
          let notifyTitle = 'Administrador';
          let notifyBody = lang === 'pt' ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;

          if (status === 'approved') {
            notifyTitle = lang === 'pt' ? '✅ Solicitação Aprovada' : '✅ Solicitud Aprobada';
            notifyBody = lang === 'pt' ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;
          } else if (status === 'rejected') {
            notifyTitle = lang === 'pt' ? '❌ Solicitação Rejeitada' : '❌ Solicitud Rechazada';
            notifyBody = lang === 'pt' ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;
          } else if (status === 'counter_offer') {
            notifyTitle = lang === 'pt' ? '💬 Contra-oferta' : '💬 Contraoferta';
            notifyBody = lang === 'pt'
              ? `Produto: ${itemTitle}`
              : `Producto: ${itemTitle}`;
          }

          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bidRequestId: id,
              email,
              title: notifyTitle,
              body: notifyBody,
              url: '/',
            }),
          }).catch(err => console.error('Push notification error:', err));
        }
      } else {
        console.error('updateStatus failed:', res.status);
        alert('更新に失敗しました。ページをリロードしてください。');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const updateFinalStatus = async (id: string, finalStatus: string, finalPrice?: number, totalJpy?: number, japanSendUsd?: number) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, finalStatus, finalPrice, totalJpy, japanSendUsd })
      });

      if (res.ok) {
        fetchBidRequests();
        setSelectedRequest(null);
        setActionType(null);
        setFinalPriceInput('');

        // プッシュ通知を送信（対象顧客のリクエストを特定）
        const targetRequest = bidRequests.find(r => r.id === id);
        const email = targetRequest?.customerEmail;
        if (email) {
          const lang = targetRequest?.language || 'es';
          const itemTitle = (lang === 'pt' ? targetRequest?.productTitlePt : targetRequest?.productTitleEs) || targetRequest?.productTitle || 'Item';
          let notifyTitle = 'Resultado';
          let notifyBody = lang === 'pt' ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;

          if (finalStatus === 'won') {
            notifyTitle = lang === 'pt' ? '🎉 Ganhado!' : '🎉 ¡Ganado!';
            notifyBody = lang === 'pt' ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;
          } else if (finalStatus === 'lost') {
            notifyTitle = '😢 Perdido';
            notifyBody = lang === 'pt' ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;
          }

          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bidRequestId: id,
              email,
              title: notifyTitle,
              body: notifyBody,
              url: '/',
            }),
          }).catch(err => console.error('Push notification error:', err));
        }
      } else {
        console.error('updateFinalStatus failed:', res.status);
        alert('更新に失敗しました。ページをリロードしてください。');
      }
    } catch (error) {
      console.error('Error updating final status:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const confirmCustomerRejection = async (id: string) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      if (!accessToken) {
        alert('セッションが切れています。ページをリロードしてください。');
        window.location.reload();
        return;
      }

      const res = await fetch('/api/bid-request?id=' + id, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (res.ok) {
        fetchBidRequests();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Delete failed:', res.status, errorData);
        alert('削除に失敗しました。ページをリロードしてください。');
      }
    } catch (error) {
      console.error('Error confirming rejection:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const updatePaidStatus = async (id: string, paid: boolean) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, paid })
      });

      if (res.ok) {
        fetchPurchasedItems();
      }
    } catch (error) {
      console.error('Error updating paid status:', error);
    }
  };

  const updatePaidSplitStatus = async (id: string, updates: { paid_brazil?: boolean; paid_paraguay?: boolean; paid_japan?: boolean; paid_local?: boolean }) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, ...updates })
      });

      if (res.ok) {
        fetchPurchasedItems();
      }
    } catch (error) {
      console.error('Error updating paid split status:', error);
    }
  };

  const updateStockNumber = async (id: string, stockNumber: string) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, stockNumber: stockNumber.trim() || null })
      });

      if (res.ok) {
        fetchPurchasedItems();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`在庫番号の更新に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error updating stock number:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const updateInvoiceNumber = async (id: string, invoiceNumber: string) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, invoiceNumber: invoiceNumber.trim() || null })
      });

      if (res.ok) {
        fetchPurchasedItems();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`請求書番号の更新に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error updating invoice number:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const handleUpdateStockNumber = (id: string, title: string, currentStockNumber: string) => {
    setEditingStockItem({ id, title, stockNumber: currentStockNumber || '' });
  };

  const handleUpdateInvoiceNumber = (id: string, title: string, currentInvoiceNumber: string) => {
    setEditingInvoiceItem({ id, title, invoiceNumber: currentInvoiceNumber || '' });
  };

  const handleCancelItem = async (itemId: string, currentCancelled: boolean) => {
    const actionText = currentCancelled ? 'キャンセルの取り消し' : 'キャンセル';
    if (!window.confirm(`この商品の購入を${actionText}しますか？`)) {
      return;
    }
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
          id: itemId,
          cancelledAt: currentCancelled ? null : new Date().toISOString()
        })
      });
      if (res.ok) {
        alert(`${actionText}しました`);
        fetchPurchasedItems();
      } else {
        const err = await res.json();
        alert(`処理に失敗しました: ${err.error || ''}`);
      }
    } catch (error) {
      console.error('Error cancelling item:', error);
      alert('通信エラーが発生しました');
    }
  };

  // 発送コンテナ登録用のステートと関数
  const [shippingContainers, setShippingContainers] = useState<any[]>([]);
  const [shippingContainerForm, setShippingContainerForm] = useState({
    containerCode: '',
    shippedAt: '',
    estimatedArrivalDate: '',
    carrier: '',
    trackingNumber: '',
    trackingUrl: ''
  });

  const fetchShippingContainers = async () => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch(`/api/admin/shipping-containers?t=${Date.now()}`, {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        cache: 'no-store'
      });
      const data = await res.json();
      if (data.containers) {
        setShippingContainers(data.containers);
      }
    } catch (err) {
      console.error('Error fetching shipping containers:', err);
    }
  };

  const handleCreateShippingContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingContainerForm.containerCode.trim()) {
      alert('管理番号を入力してください');
      return;
    }

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/admin/shipping-containers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({
          containerCode: shippingContainerForm.containerCode.trim(),
          shippedAt: shippingContainerForm.shippedAt,
          estimatedArrivalDate: shippingContainerForm.estimatedArrivalDate,
          carrier: shippingContainerForm.carrier.trim(),
          trackingNumber: shippingContainerForm.trackingNumber.trim(),
          trackingUrl: shippingContainerForm.trackingUrl.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '登録に失敗しました');
        return;
      }

      alert('発送情報を登録しました');
      setShippingContainerForm({
        containerCode: '',
        shippedAt: '',
        estimatedArrivalDate: '',
        carrier: '',
        trackingNumber: '',
        trackingUrl: ''
      });
      await fetchShippingContainers();
    } catch (err) {
      console.error('Error creating shipping container:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert('登録に失敗しました。: ' + errMsg);
    }
  };

  const handleSelectContainer = (itemId: string, containerCode: string) => {
    if (!containerCode) return;
    const container = shippingContainers.find(c => c.container_code === containerCode);
    if (!container) return;

    const formattedShippedAt = container.shipped_at ? container.shipped_at.split('T')[0] : '';
    const formattedEstimatedArrival = container.estimated_arrival_date || '';

    setShippingForm(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        shippedAt: formattedShippedAt,
        estimatedArrivalDate: formattedEstimatedArrival,
        carrier: container.carrier || '',
        trackingNumber: container.tracking_number || '',
        trackingUrl: container.tracking_url || ''
      }
    }));
  };

  const getSelectedContainerCode = (itemId: string) => {
    const shippedAt = getShippingValue(itemId, 'shippedAt');
    const estimatedArrivalDate = getShippingValue(itemId, 'estimatedArrivalDate');
    const carrier = getShippingValue(itemId, 'carrier');
    const trackingNumber = getShippingValue(itemId, 'trackingNumber');
    const trackingUrl = getShippingValue(itemId, 'trackingUrl');

    const match = shippingContainers.find(c => {
      const cShippedAt = c.shipped_at ? c.shipped_at.split('T')[0] : '';
      const cEstimatedArrival = c.estimated_arrival_date || '';
      return (
        (c.tracking_number || '') === trackingNumber &&
        cShippedAt === shippedAt &&
        cEstimatedArrival === estimatedArrivalDate &&
        (c.carrier || '') === carrier &&
        (c.tracking_url || '') === trackingUrl
      );
    });

    return match ? match.container_code : '';
  };

  const [shippingForm, setShippingForm] = useState<Record<string, {
    shippingStatus?: string;
    shippedAt?: string;
    carrier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedArrivalDate?: string;
  }>>({});

  const toInputDateFormat = (dateString?: string | null) => {
    if (!dateString) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getShippingValue = (itemId: string, field: 'shippingStatus' | 'shippedAt' | 'carrier' | 'trackingNumber' | 'trackingUrl' | 'estimatedArrivalDate') => {
    if (shippingForm[itemId] && shippingForm[itemId][field] !== undefined) {
      return shippingForm[itemId][field] as string;
    }
    const item = purchasedItems.find(i => i.id === itemId);
    if (!item) return '';
    
    if (field === 'shippingStatus') return item.shippingStatus || 'not_shipped';
    if (field === 'shippedAt') return item.shippedAt ? toInputDateFormat(item.shippedAt) : '';
    if (field === 'carrier') return item.carrier || '';
    if (field === 'trackingNumber') return item.trackingNumber || '';
    if (field === 'trackingUrl') return item.trackingUrl || '';
    if (field === 'estimatedArrivalDate') return item.estimatedArrivalDate ? toInputDateFormat(item.estimatedArrivalDate) : '';
    return '';
  };

  const handleShippingChange = (itemId: string, field: string, value: string) => {
    setShippingForm(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  const handleUpdateShipping = async (itemId: string) => {
    const currentForm = shippingForm[itemId] || {};
    const item = purchasedItems.find(i => i.id === itemId);
    if (!item) return;

    const payload = {
      id: itemId,
      shipping_status: currentForm.shippingStatus !== undefined ? currentForm.shippingStatus : (item.shippingStatus || 'not_shipped'),
      shipped_at: currentForm.shippedAt !== undefined ? (currentForm.shippedAt || null) : (item.shippedAt || null),
      carrier: currentForm.carrier !== undefined ? (currentForm.carrier || null) : (item.carrier || null),
      tracking_number: currentForm.trackingNumber !== undefined ? (currentForm.trackingNumber || null) : (item.trackingNumber || null),
      tracking_url: currentForm.trackingUrl !== undefined ? (currentForm.trackingUrl || null) : (item.trackingUrl || null),
      estimated_arrival_date: currentForm.estimatedArrivalDate !== undefined ? (currentForm.estimatedArrivalDate || null) : (item.estimatedArrivalDate || null),
    };

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('発送情報を更新しました。');
        await fetchPurchasedItems();

        // 発送ステータスが変更されている場合、プッシュ通知を送信
        const previousStatus = item.shippingStatus || 'not_shipped';
        const newStatus = payload.shipping_status;
        if (newStatus !== previousStatus && newStatus !== 'not_shipped') {
          const email = item.customerEmail;
          if (email) {
            const lang = item.language || 'es';
            const itemName = item.stockNumber || 'Item';
            
            let notifyTitle = '';
            let notifyBody = '';

            if (newStatus === 'arrived_jp') {
              notifyTitle = lang === 'pt' ? '📦 Chegou ao armazém no Japão' : '📦 Llegó al almacén en Japón';
              notifyBody = lang === 'pt' ? `O produto [${itemName}] chegou ao armazém no Japão.` : `El producto [${itemName}] llegó al almacén en Japón.`;
            } else if (newStatus === 'in_transit') {
              notifyTitle = lang === 'pt' ? '🚢 Em trânsito' : '🚢 En tránsito';
              notifyBody = lang === 'pt' ? `O produto [${itemName}] partiu.` : `El producto [${itemName}] ha salido.`;
            } else if (newStatus === 'arrived_local') {
              notifyTitle = lang === 'pt' ? '📍 Chegou ao local' : '📍 Llegó al destino local';
              notifyBody = lang === 'pt' ? `O produto [${itemName}] chegou à região local.` : `El producto [${itemName}] llegó a la región local.`;
            } else if (newStatus === 'ready_for_delivery') {
              notifyTitle = lang === 'pt' ? '✅ Pronto para retirada' : '✅ Listo para entrega';
              notifyBody = lang === 'pt' ? `O produto [${itemName}] está pronto para ser retirado.` : `El producto [${itemName}] está listo para ser entregado.`;
            } else if (newStatus === 'delivered') {
              notifyTitle = lang === 'pt' ? '🎉 Entrega concluída' : '🎉 Entrega completada';
              notifyBody = lang === 'pt' ? `O produto [${itemName}] foi entregue com sucesso.` : `El producto [${itemName}] ha sido entregado con éxito.`;
            }

            if (notifyTitle) {
              fetch('/api/push-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bidRequestId: itemId,
                  email,
                  title: notifyTitle,
                  body: notifyBody,
                  url: '/',
                }),
              }).catch(err => console.error('Shipping push notification error:', err));
            }
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert('更新に失敗しました: ' + (err.error || ''));
      }
    } catch (error) {
      console.error('Error updating shipping info:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const renderShippingForm = (item: BidRequest) => {
    const shippingStatus = getShippingValue(item.id, 'shippingStatus');
    const isDetailVisible = ['in_transit', 'arrived_local', 'ready_for_delivery', 'delivered'].includes(shippingStatus);
    
    const arrivalDateLabel = shippingStatus === 'delivered' ? '引渡完了日' :
      ['arrived_local', 'ready_for_delivery'].includes(shippingStatus) ? '到着日' : '到着予定日';

    return (
      <div className="mb-2 font-sans text-xs space-y-2 text-left">
        {/* 発送ステータスボックス (h-12) */}
        <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
          <span className="text-gray-500 font-medium">発送ステータス:</span>
          {isDetailVisible && (
            <select
              value={getSelectedContainerCode(item.id)}
              onChange={(e) => handleSelectContainer(item.id, e.target.value)}
              className="border border-gray-300 rounded bg-white text-black text-xs font-semibold h-8 flex-1 mx-2 min-w-0"
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                padding: '0 8px',
                lineHeight: '30px',
              }}
            >
              <option value="">選択</option>
              {shippingContainers.map(c => (
                <option key={c.id} value={c.container_code}>
                  {c.container_code}
                </option>
              ))}
            </select>
          )}
          <select
            value={shippingStatus}
            onChange={(e) => handleShippingChange(item.id, 'shippingStatus', e.target.value)}
            className="border border-gray-300 rounded bg-white text-black text-xs font-bold h-8 w-[calc(50%-4px)] min-w-0 text-center"
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              padding: '0 8px',
              lineHeight: '30px',
              textAlign: 'center',
              textAlignLast: 'center'
            }}
          >
            <option value="not_shipped">未発送</option>
            <option value="arrived_jp">日本倉庫到着</option>
            <option value="in_transit">輸送中</option>
            <option value="arrived_local">現地到着</option>
            <option value="ready_for_delivery">引渡可能</option>
            <option value="delivered">引渡完了</option>
          </select>
        </div>

        {/* 発送情報詳細ボックス */}
        {isDetailVisible && (
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-3 font-sans text-xs">
            {/* 上段: 発送日 & 到着予定日（動的） */}
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-gray-500 text-[10px] font-semibold">発送日:</span>
                <input
                  type="date"
                  value={getShippingValue(item.id, 'shippedAt')}
                  onChange={(e) => handleShippingChange(item.id, 'shippedAt', e.target.value)}
                  className="border border-gray-300 rounded text-xs text-black bg-white w-full h-8 min-w-0"
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: '0 8px',
                    lineHeight: '30px'
                  }}
                />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-gray-500 text-[10px] font-semibold">{arrivalDateLabel}:</span>
                <input
                  type="date"
                  value={getShippingValue(item.id, 'estimatedArrivalDate')}
                  onChange={(e) => handleShippingChange(item.id, 'estimatedArrivalDate', e.target.value)}
                  className="border border-gray-300 rounded text-xs text-black bg-white w-full h-8 min-w-0"
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: '0 8px',
                    lineHeight: '30px'
                  }}
                />
              </div>
            </div>

            {/* 中段: 配送業者 & 追跡番号 */}
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-gray-500 text-[10px] font-semibold">配送業者:</span>
                <input
                  type="text"
                  placeholder="手入力..."
                  value={getShippingValue(item.id, 'carrier')}
                  onChange={(e) => handleShippingChange(item.id, 'carrier', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white w-full h-8 box-border min-w-0"
                />
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-gray-500 text-[10px] font-semibold">
                  追跡番号:
                </span>
                <input
                  type="text"
                  placeholder="手入力..."
                  value={getShippingValue(item.id, 'trackingNumber')}
                  onChange={(e) => handleShippingChange(item.id, 'trackingNumber', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white w-full h-8 box-border min-w-0"
                />
              </div>
            </div>

            {/* 下段: 追跡URL */}
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-[10px] font-semibold">追跡URL:</span>
              <input
                type="text"
                placeholder="URLを入力..."
                value={getShippingValue(item.id, 'trackingUrl')}
                onChange={(e) => handleShippingChange(item.id, 'trackingUrl', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white w-full h-8 box-border min-w-0"
              />
            </div>
          </div>
        )}

        {/* 発送情報を更新ボタン（最下段・右下・入力ボックスのサイズに統一） */}
        <div className="mt-3 flex justify-between items-center px-3">
          <div className="text-[10px] text-gray-500 font-semibold font-sans">
            更新日時: {item.shippingUpdatedAt ? formatDateTime(item.shippingUpdatedAt, 'admin') : '未更新'}
          </div>
          <button
            onClick={() => handleUpdateShipping(item.id)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 rounded px-2 text-xs transition w-[calc(50%-4px)] flex items-center justify-center"
          >
            発送情報を更新
          </button>
        </div>
      </div>
    );
  };

  const handleReject = () => {
    if (selectedRequest) {
      updateStatus(selectedRequest.id, 'rejected', rejectReason.trim());
    }
  };

  const formatCommaSeparatedNumber = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    if (!clean) return '';
    return parseInt(clean, 10).toLocaleString('en-US');
  };

  const handleCounterOffer = () => {
    if (selectedRequest) {
      const defaultFob = selectedRequest ? calculateDefaultFobCost(selectedRequest.productTitle, selectedRequest.productUrl) : 1500;
      const fob = fobCostJpy.replace(/,/g, '').trim() ? parseFloat(fobCostJpy.replace(/,/g, '')) : defaultFob;
      const defaultShipping = selectedRequest ? calculateDefaultShippingCost(selectedRequest.productTitle, selectedRequest.productUrl) : 0;
      const shipping = shippingCostJpy.replace(/,/g, '').trim() ? parseFloat(shippingCostJpy.replace(/,/g, '')) : defaultShipping;

      const totalJpy = (selectedRequest.productPrice || 0) + shipping + fob;
      // エージェント(A始まり)は利益率20% (除数 0.8)
      // ただし、国名ブラジルのエージェントは利益率30% (除数 0.7)
      // B001に紐づく顧客は利益率50% (除数 0.5)
      // 一般顧客(C始まりなど)は利益率40% (除数 0.6)
      let profitDivisor = 0.6;
      if (selectedRequest.customerId === 'B001') {
        profitDivisor = 0.9;
      } else if (selectedRequest.agentCustomerId === 'B001') {
        profitDivisor = 0.5;
      } else if (selectedRequest.customerId?.startsWith('A')) {
        const countryLower = (selectedRequest.customerCountry || '').trim().toLowerCase();
        if (countryLower === 'brasil' || countryLower === 'brazil') {
          profitDivisor = 0.7;
        } else {
          profitDivisor = 0.8;
        }
      }
      const priceWithProfit = totalJpy / profitDivisor;
      const usdPrice = priceWithProfit / exchangeRate;
      const roundedUsd = Math.ceil(usdPrice / 10) * 10;

      updateStatus(selectedRequest.id, 'counter_offer', undefined, roundedUsd, shipping, totalJpy);
    }
  };

  // CSVエクスポート機能
  const exportPurchasedItemsCSV = () => {
    const items = getFilteredPurchasedItems()
      .sort((a, b) => new Date(b.confirmedAt || '').getTime() - new Date(a.confirmedAt || '').getTime());

    if (items.length === 0) {
      alert('エクスポートするデータがありません。');
      return;
    }

    // CSVヘッダー
    const headers = ['日付', 'ID', '氏名', '顧客名またはAGT', 'メール', 'WhatsApp', '商品名', '確定金額(USD)', '支払状況', '商品URL'];

    // CSVデータ行
    const rows = items.map(item => {
      const isB001Linked = item.agentCustomerId === 'B001';
      const countryLower = (item.customerCountry || '').trim().toLowerCase();
      const isBrasilAgent = item.customerId?.startsWith('A') && (countryLower === 'brasil' || countryLower === 'brazil');
      
      const cost = item.finalPrice || 0;
      let finalPriceOutput = '';
      
      if (cost > 0) {
        if (isB001Linked || isBrasilAgent) {
          const jpyRate = exchangeRates['JPY'] || exchangeRate || 150;
          finalPriceOutput = String(item.japan_send_usd ?? calculateJapanSendAmount(item, Math.round(cost), jpyRate));
        } else {
          finalPriceOutput = String(Math.round(cost));
        }
      }

      return [
        formatDateTime(item.confirmedAt || ''),
        item.customerId || '',
        item.customerFullName || '',
        item.customerName || '',
        item.customerEmail || '',
        item.customerWhatsapp || '',
        `"${(item.productTitle || '').replace(/"/g, '""')}"`,
        finalPriceOutput,
        item.cancelledAt ? 'キャンセル済み' : (item.paid ? '支払い済み' : '未払い'),
        item.productUrl || ''
      ];
    });

    // BOM付きUTF-8でCSV生成（Excelで文字化けしないように）
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // ダウンロード
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `JOGALIBRE_購入履歴_${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '保留中',
      approved: '承認済',
      rejected: '却下',
      counter_offer: 'カウンターオファー',
      completed: '完了'
    };
    return statusMap[status] || status;
  };

  const getFinalStatusColor = (finalStatus: string) => {
    switch (finalStatus) {
      case 'won': return 'bg-green-100 text-green-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getFinalStatusText = (finalStatus: string) => {
    const statusMap: Record<string, string> = {
      won: '落札',
      lost: '落札できず'
    };
    return statusMap[finalStatus] || '';
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="flex justify-center items-center gap-1.5 sm:gap-2 mb-6 mt-2 max-w-full">
            <Image src="/icons/logo-mark.png" alt="JOGALIBRE" width={32} height={32} className="object-contain w-auto h-6 sm:h-8 animate-pulse flex-shrink-0" priority />
            <Image src="/icons/logo-text.png" alt="JOGALIBRE" width={428} height={32} className="object-contain w-auto h-6 sm:h-8 animate-pulse flex-shrink min-w-[120px]" priority />
          </div>
          <div className="text-gray-500 text-sm font-bold">読み込み中...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4 pt-20">
        <div className="bg-white p-4 sm:p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="flex justify-center items-center gap-1.5 sm:gap-2 mb-6 mt-2 max-w-full">
            <Image src="/icons/logo-mark.png" alt="JOGALIBRE" width={32} height={32} className="object-contain w-auto h-6 sm:h-8 flex-shrink-0" priority />
            <Image src="/icons/logo-text.png" alt="JOGALIBRE" width={428} height={32} className="object-contain w-auto h-6 sm:h-8 flex-shrink min-w-[120px]" priority />
          </div>
          <p className="text-gray-600 mb-6 text-center font-bold">管理者ログイン</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">メールアドレス</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 h-12 py-0 box-border text-base bg-white text-black focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">パスワード</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 h-12 py-0 box-border text-base bg-white text-black focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center text-base"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* PWA用 Pull-to-Refresh インジケーター */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center py-4 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-300">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      )}

      <header className="bg-white shadow pt-3.5 sm:pt-4">
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
              ログアウト
            </button>
          </div>

          {/* 2行目: 件数サマリー & 通知確認ボタン */}
          <div className="flex justify-between items-center">
            <div className="text-xs sm:text-sm text-gray-700 font-bold">
              保留中: <span className="font-bold text-indigo-600">
                {bidRequests.filter(req => req.status === 'pending').length}
              </span>
              {' '}
              合計: <span className="font-bold">{bidRequests.length}件</span>
            </div>

            <button
              onClick={() => {
                setShowNotifications(true);
                fetchNotifications();
              }}
              className="relative flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold hover:bg-indigo-100 transition-colors"
            >
              <span>通知内容確認</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white animate-pulse font-bold">
                  {unreadCount}
                </span>
              )}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* メインエリア（顧客画面と同じbg-gray-100背景上にコントロール配置） */}
      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* コントロールエリア (WhatsApp, Push, 通貨, 更新, 為替レート) */}
        <div className="flex flex-col gap-2">
          {/* WhatsApp + プッシュ通知ボタン（半幅ずつ） */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href="whatsapp://"
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
              <span>顧客対応</span>
            </a>
            <button
              onClick={async () => {
                if (!currentUser) return;

                if (notificationStatus === 'enabled') {
                  // 無効化
                  try {
                    await fetch('/api/push-subscribe', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: currentUser.id }),
                    });
                    setNotificationStatus('disabled');
                    alert('通知を停止しました');
                  } catch (err) {
                    console.error('Error disabling notifications:', err);
                  }
                } else {
                  // 有効化
                  const permission = getNotificationPermission();
                  if (permission === 'unsupported') {
                    alert('このブラウザはプッシュ通知に対応していません');
                    return;
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
                      alert('通知を受け取る設定にしました！');
                    }
                  } catch (err) {
                    console.error('Error enabling notifications:', err);
                    alert('通知設定に失敗しました');
                  }
                }
              }}
              className={`flex-1 h-12 rounded-lg transition text-sm sm:text-base flex items-center justify-center ${notificationStatus === 'enabled'
                ? 'bg-gray-500 text-white hover:bg-gray-600'
                : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
              {notificationStatus === 'enabled' ? '🔕 通知停止' : '🔔 通知受取'}
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="w-1/2 h-12 px-3 bg-white border border-gray-300 rounded-lg text-sm sm:text-base font-medium shadow-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
              style={{ textAlign: 'center', textAlignLast: 'center' }}
            >
              <option value="USD">USD 🇺🇸</option>
              <option value="BRL">BRL 🇧🇷</option>
              <option value="PYG">PYG 🇵🇾</option>
              <option value="CLP">CLP 🇨🇱</option>
              <option value="BOB">BOB 🇧🇴</option>
              <option value="ARS">ARS 🇦🇷</option>
            </select>
            <button
              onClick={() => {
                if (activeTab === 'requests') fetchBidRequests();
                else if (activeTab === 'purchased') fetchPurchasedItems();
                else if (activeTab === 'deposits') { fetchDeposits(); fetchUsersData(); }
                else if (activeTab === 'shipping') { fetchPurchasedItems(); fetchUsersData(); fetchShippingContainers(); }
                else {
                  fetchUsersData();
                  if (activeTab === 'agents') {
                    fetchInviteCodes();
                  }
                }
              }}
              className="bg-indigo-600 text-white h-12 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base w-1/2 flex items-center justify-center"
            >
              🔁 更新
            </button>
          </div>

          <div className="w-full h-12 bg-white border border-gray-300 rounded-lg text-sm sm:text-base flex items-center justify-center font-medium shadow-sm text-gray-700">
            為替レート: <span className="font-bold text-indigo-600 ml-1.5">
              {selectedCurrency === 'USD'
                ? `USD 1 = JPY ${formatExchangeRate(exchangeRates['JPY'] || exchangeRate || 150, 'USD')}`
                : `USD 1 = ${selectedCurrency} ${formatExchangeRate(exchangeRates[selectedCurrency] || 0, selectedCurrency)}`
              }
            </span>
          </div>
        </div>

      {/* タブナビゲーション */}
      <nav className="bg-white border-b sticky top-0 z-10 w-full overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="max-w-5xl mx-auto px-1 sm:px-4">
          <div className="flex justify-between sm:justify-center gap-1 sm:gap-4 md:gap-8">
            {[
              { key: 'requests' as const, label: '申請', icon: '📋' },
              { key: 'purchased' as const, label: '購入', icon: '🛒' },
              { key: 'deposits' as const, label: '入金', icon: '💵' },
              { key: 'shipping' as const, label: '発送', icon: '📦' },
              { key: 'customers' as const, label: '顧客', icon: '👥' },
              { key: 'agents' as const, label: 'AGT', icon: '👔' },
              { key: 'financials' as const, label: '財務', icon: '📊' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                }}
                className={`flex-1 sm:flex-initial py-2 px-1.5 sm:px-4 md:px-6 text-center text-xs sm:text-sm font-semibold border-b-2 transition shrink-0 ${activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <span className="block text-base sm:text-lg mb-0.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="pt-2">
        {activeTab === 'requests' && (
          <div className="flex flex-col gap-4 w-full">
            <button
              onClick={() => {
                fetchUsersData();
                setShowManualAddModal(true);
              }}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 font-sans shrink-0"
            >
              ヤフオク以外の購入商品を追加
            </button>

            {bidRequests.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">オファーリクエストなし</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bidRequests
                .sort((a, b) => {
                  const now = new Date().getTime();
                  const timeA = a.productEndTime ? new Date(a.productEndTime).getTime() : Infinity;
                  const timeB = b.productEndTime ? new Date(b.productEndTime).getTime() : Infinity;

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
                  <div key={request.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4">
                    <div className="flex gap-4 mb-2">
                      <div className="relative w-32 h-32 flex-shrink-0">
                        {request.productImage ? (
                          <Image
                            src={request.productImage}
                            alt={request.productTitle}
                            fill
                            className="object-cover rounded"
                            sizes="128px"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border border-gray-200 text-center p-2 text-black font-sans">
                            <span className="text-xs font-semibold text-gray-500">
                              写真なし
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
                            <span className="text-gray-500 text-xs font-medium mr-1">終了まで:</span>
                            <span className="font-semibold text-red-600 text-xs truncate">
                              {request.productEndTime ? getTimeRemaining(request.productEndTime, 'ja') : '-'}
                            </span>
                          </div>
                        </div>

                        {/* 3. ステータスバッジ (h-7) */}
                        <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center gap-1 w-full box-border overflow-x-auto whitespace-nowrap">
                          {request.finalStatus ? (
                            // 落札または落札できずが確定している場合
                            <>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getStatusColor(request.status)}`}>
                                {getStatusText(request.status)}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getFinalStatusColor(request.finalStatus)}`}>
                                {getFinalStatusText(request.finalStatus)}
                              </span>
                            </>
                          ) : (
                            // 落札結果がまだない場合
                            <>
                              {request.status === 'rejected' && request.customerCounterOffer ? (
                                <>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-purple-100 text-purple-800">
                                    カウンターオファー
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-red-100 text-red-800">
                                    却下
                                  </span>
                                </>
                              ) : request.status === 'approved' && request.customerCounterOfferUsed ? (
                                // 顧客が管理者のカウンターオファーを「承認」した場合
                                <>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-blue-100 text-blue-800">
                                    カウンターオファー
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-green-100 text-green-800">
                                    承認済
                                  </span>
                                </>
                              ) : request.status === 'approved' && !request.customerCounterOfferUsed && request.customerCounterOffer ? (
                                // 管理者が顧客のカウンターオファーを「承認」した場合
                                <>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-purple-100 text-purple-800">
                                    カウンターオファー
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-green-100 text-green-800">
                                    承認済
                                  </span>
                                </>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                                  request.status === 'counter_offer' && request.customerCounterOffer
                                    ? 'bg-purple-100 text-purple-800'
                                    : getStatusColor(request.status)
                                }`}>
                                  {getStatusText(request.status)}
                                </span>
                              )}
                              {request.adminNeedsConfirm && request.status !== 'rejected' && request.status !== 'approved' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-red-100 text-red-800">
                                  却下
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* 4. ヤフオクURLボタン (h-7) */}
                        <div className="w-full">
                          {request.productUrl ? (
                            <a
                              href={request.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans ${
                                request.productId?.startsWith('m-') ? 'bg-blue-600' : 'bg-[#ff0033]'
                              }`}
                            >
                              {request.productId?.startsWith('m-') ? 'URL' : 'ヤフオクURL'}
                            </a>
                          ) : (
                            <div className="text-center text-xs text-gray-400 font-bold h-7 bg-gray-100 border border-gray-200 rounded px-2 flex items-center justify-center w-full box-border select-none font-sans">
                              URLなし
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 商品入札額 (日本円表示) */}
                    {(() => {
                      const activeMaxBidUsd = request.customerCounterOffer && !request.customerCounterOfferUsed
                        ? request.customerCounterOffer
                        : (request.counterOffer || request.maxBid || 0);

                      const jpyRate = exchangeRates['JPY'] || exchangeRate || 150;
                      const productBidJpy = calculateProductBidJpy(
                        activeMaxBidUsd,
                        request.customerId,
                        request.agentCustomerId,
                        request.customerCountry,
                        request.productTitle,
                        request.productUrl,
                        jpyRate
                      );

                      return (
                        <div className="mb-2 h-12 px-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                          <span className="text-xs text-emerald-800 font-semibold">商品入札額:</span>
                          <span className="text-base font-extrabold text-emerald-700">
                            ¥ {productBidJpy.toLocaleString('ja-JP')}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 font-medium">希望入札額:</span>
                        <span className="text-base font-bold text-indigo-600">
                          $ {Math.round(request.maxBid || 0).toLocaleString('en-US')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleSyncYahooProduct(request)}
                        disabled={isSyncing === request.id}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 bg-white border border-indigo-200 rounded px-2 py-1 shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        {isSyncing === request.id ? (
                          <svg className="animate-spin h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : '🔄'}
                        <span>同期</span>
                      </button>
                    </div>

                    {(() => {
                      const isB001Linked = request.agentCustomerId === 'B001';
                      const countryLower = (request.customerCountry || '').trim().toLowerCase();
                      const isBrasilAgent = request.customerId?.startsWith('A') && (countryLower === 'brasil' || countryLower === 'brazil');

                      if (!isB001Linked && !isBrasilAgent) return null;

                      const cost = request.customerCounterOffer && !request.customerCounterOfferUsed
                        ? request.customerCounterOffer
                        : (request.counterOffer || request.maxBid || 0);
                      let japanAmount = 0;
                      if (isB001Linked) {
                        japanAmount = Math.ceil(((cost * 0.5) / 0.6) / 10) * 10;
                      } else if (isBrasilAgent) {
                        japanAmount = Math.ceil(((cost * 0.7) / 0.8) / 10) * 10;
                      }

                      return (
                        <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 font-medium">日本支払額:</span>
                            <span className="text-base font-bold text-indigo-600">
                              $ {japanAmount.toLocaleString('en-US')}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="h-24 px-3 py-0 bg-gray-50 border border-gray-100 rounded-lg text-xs mb-2 box-border grid grid-rows-2 grid-cols-2">
                      <div className="flex flex-col justify-center h-12">
                        <span className="text-gray-500 text-[10px] leading-tight">ID:</span>
                        <span className="font-semibold truncate text-black leading-tight">{request.customerId}</span>
                      </div>
                      <div className="flex flex-col justify-center h-12">
                        <span className="text-gray-500 text-[10px] leading-tight">リクエスト日時:</span>
                        <span className="font-semibold truncate text-black leading-tight">{formatDateTime(request.createdAt)}</span>
                      </div>
                      <div className="flex flex-col justify-center h-12">
                        <span className="text-gray-500 text-[10px] leading-tight">氏名:</span>
                        <span className="font-semibold truncate text-black leading-tight">{request.customerFullName || request.customerName}</span>
                      </div>
                      <div className="flex flex-col justify-center h-12">
                        <span className="text-gray-500 text-[10px] leading-tight">
                          {request.customerId?.startsWith('C') && request.agentCustomerId ? 'エージェント名:' : '顧客名:'}
                        </span>
                        <span className="font-semibold truncate text-black leading-tight">{request.customerName}</span>
                      </div>
                    </div>

                    {request.status === 'rejected' && request.rejectReason && !request.customerCounterOffer && (
                      <div className="h-12 px-3 bg-red-50 rounded-lg flex items-center text-xs mb-2 gap-1.5">
                        <span className="text-xs text-gray-500 font-medium">却下理由:</span>
                        <span className="text-xs font-semibold text-red-700 truncate">{request.rejectReason}</span>
                      </div>
                    )}

                    {request.finalStatus === 'won' && (
                      <div className="mb-2 h-12 px-3 bg-green-100 border border-green-200 rounded-lg flex items-center justify-between shadow-sm">
                        <span className="text-xs text-gray-500 font-medium">落札金額:</span>
                        <span className="text-base font-bold text-green-800">
                          $ {Math.round(request.finalPrice || 0).toLocaleString('en-US')}
                        </span>
                      </div>
                    )}

                    {request.counterOffer && request.finalStatus !== 'won' && !(request.status === 'approved' && request.customerCounterOffer && !request.customerCounterOfferUsed) && (
                      <div className="mb-2 h-12 px-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between w-full">
                        <span className="text-xs text-gray-500 font-medium">カウンターオファー:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-bold text-blue-700">
                            $ {Math.round(request.counterOffer || 0).toLocaleString('en-US')}
                          </span>
                        </div>
                      </div>
                    )}

                    {request.customerCounterOffer && !request.customerCounterOfferUsed && request.finalStatus !== 'won' && (
                      <div className="mb-2 h-12 px-3 bg-purple-50 border border-purple-100 rounded-lg flex items-center justify-between w-full">
                        <span className="text-xs text-gray-500 font-medium">顧客からのカウンターオファー:</span>
                        <span className="text-base font-bold text-purple-700">
                          $ {Math.round(request.customerCounterOffer).toLocaleString('en-US')}
                        </span>
                      </div>
                    )}

                    {request.adminNeedsConfirm && !request.customerCounterOffer && (
                      <div className="mb-2 p-3 bg-red-50 rounded-lg">
                        <p className="text-sm text-red-800 font-semibold">顧客がカウンターオファーを拒否しました</p>
                      </div>
                    )}

                    {/* 商品渡し場所 (引渡場所) */}
                    <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-black font-sans text-xs">
                      <span className="text-gray-500 font-medium">
                        引渡場所:
                      </span>
                      <span className="font-semibold text-black">
                        {getDeliveryLocationName(request.delivery_location, request.delivery_city)}
                      </span>
                    </div>

                    {/* 現地費用 */}
                    {request.delivery_location !== 'JP' && (
                      <>
                        <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-black font-sans text-xs">
                          <span className="text-gray-500 font-medium">
                            現地費用:
                          </span>
                          <span className={`text-base font-bold ${typeof calculateLocalCost(request.delivery_location, request, request.shipping_method) === 'string' ? 'text-red-600' : 'text-gray-800'}`}>
                            {formatLocalCost(calculateLocalCost(request.delivery_location, request, request.shipping_method), 'USD')}
                          </span>
                        </div>
                        {/* 発送方法 */}
                        <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between text-black font-sans text-xs">
                          <span className="text-gray-500 font-medium">
                            発送方法:
                          </span>
                          <span className="font-semibold text-black">
                            {request.shipping_method === 'air' ? '航空便 ✈️' : 'コンテナ 🚢'}
                          </span>
                        </div>
                      </>
                    )}

                    {/* 各種アクションボタン */}
                    {request.status === 'counter_offer' && !request.customerCounterOffer && !request.adminNeedsConfirm && (
                      <button
                        onClick={() => {
                          setSelectedRequest(request);
                          setActionType('reject');
                        }}
                        className="w-full bg-red-600 text-white h-12 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base mb-2 flex items-center justify-center"
                      >
                        却下 (オファー取り消し)
                      </button>
                    )}

                    {request.customerCounterOffer && !request.customerCounterOfferUsed && request.finalStatus !== 'won' && !request.adminNeedsConfirm && request.status === 'counter_offer' && (
                      <div className="flex flex-col gap-2 w-full mb-2">
                        <button
                          onClick={() => updateStatus(request.id, 'approved')}
                          className="w-full bg-green-600 text-white h-12 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center text-sm sm:text-base"
                        >
                          承認
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('reject');
                          }}
                          className="w-full bg-red-600 text-white h-12 rounded-lg font-semibold hover:bg-red-700 transition flex items-center justify-center text-sm sm:text-base"
                        >
                          却下
                        </button>
                      </div>
                    )}

                    {request.customerCounterOffer && !request.customerCounterOfferUsed && request.finalStatus !== 'won' && request.status === 'rejected' && request.rejectReason && (
                      <div className="h-12 px-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-1.5 shadow-sm mb-2">
                        <span className="text-xs text-gray-500 font-medium shrink-0">却下理由:</span>
                        <span className="text-xs font-semibold text-red-600 truncate">{request.rejectReason}</span>
                      </div>
                    )}

                    {request.status === 'pending' && !request.adminNeedsConfirm && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          onClick={() => updateStatus(request.id, 'approved')}
                          className="w-full sm:flex-1 bg-green-600 text-white h-12 shrink-0 px-4 rounded-lg font-semibold hover:bg-green-700 transition text-sm sm:text-base flex items-center justify-center"
                        >
                          承認
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            const defaultFob = calculateDefaultFobCost(request.productTitle, request.productUrl);
                            setFobCostJpy(defaultFob.toLocaleString('en-US'));
                            const defaultShipping = calculateDefaultShippingCost(request.productTitle, request.productUrl);
                            setShippingCostJpy(defaultShipping > 0 ? defaultShipping.toLocaleString('en-US') : '');
                            setActionType('counter');
                          }}
                          className="w-full sm:flex-1 bg-blue-600 text-white h-12 shrink-0 px-4 rounded-lg font-semibold hover:bg-blue-700 transition text-sm sm:text-base flex items-center justify-center"
                        >
                          カウンターオファー
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('reject');
                          }}
                          className="w-full sm:flex-1 bg-red-600 text-white h-12 shrink-0 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center"
                        >
                          却下
                        </button>
                      </div>
                    )}

                    {request.status === 'approved' && !request.finalStatus && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            // 推奨金額を初期値としてセット（カウンターオファー優先、なければ最大入札額）
                            const suggestedPrice = request.customerCounterOfferUsed 
                              ? (request.counterOffer || request.maxBid || 0)
                              : (request.customerCounterOffer || request.counterOffer || request.maxBid || 0);
                            setFinalPriceInput(Math.round(suggestedPrice).toString());
                            const defaultShipping = calculateDefaultShippingCost(request.productTitle, request.productUrl);
                            const defaultFob = calculateDefaultFobCost(request.productTitle, request.productUrl);
                            setWonPriceJpyInput((request.productPrice || 0).toString());
                            setWonShippingJpyInput(defaultShipping.toString());
                            setWonFobJpyInput(defaultFob.toString());
                            setActionType('won');
                          }}
                          className="w-full sm:flex-1 bg-green-600 text-white h-12 shrink-0 px-4 rounded-lg font-semibold hover:bg-green-700 transition text-sm sm:text-base flex items-center justify-center"
                        >
                          落札
                        </button>
                        <button
                          onClick={() => updateFinalStatus(request.id, 'lost')}
                          className="w-full sm:flex-1 bg-red-600 text-white h-12 shrink-0 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base flex items-center justify-center"
                        >
                          落札できず
                        </button>
                      </div>
                    )}



                    {request.approvedAt && (
                      <div className="mt-3 text-sm text-gray-600">
                        承認: {formatDateTime(request.approvedAt)}
                      </div>
                    )}

                    {/* 最下部の削除を確認ボタン */}
                    {(request.status === 'rejected' || 
                      (request.adminNeedsConfirm && !request.customerCounterOffer) || 
                      request.finalStatus === 'lost') && (
                      <button
                        onClick={() => confirmCustomerRejection(request.id)}
                        className="w-full bg-red-600 text-white px-4 h-12 rounded-lg font-semibold hover:bg-red-700 transition flex items-center justify-center mt-2"
                      >
                        削除を確認
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

        {/* 履歴タブ */}
        {activeTab === 'purchased' && (
          <>
            {/* 上部ヘッダー（フィルター等）の個別カード化 */}
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">購入商品</h2>

              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">ID:</span>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">すべてのID</option>
                    <option value="B001">B001 FFGN</option>
                    {getCustomerIdList().filter(id => id !== 'B001').map(id => {
                      const firstMatch = purchasedItems.find(item => item.customerId === id);
                      const name = firstMatch ? (firstMatch.customerFullName || firstMatch.customerName) : '';
                      return (
                        <option key={id} value={id}>
                          {id} {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">期間:</span>
                  <div className="flex gap-2 w-full">
                    <select
                      value={purchasedYear}
                      onChange={(e) => setPurchasedYear(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">すべての年</option>
                      <option value="2026">2026年</option>
                      <option value="2027">2027年</option>
                      <option value="2028">2028年</option>
                      <option value="2029">2029年</option>
                      <option value="2030">2030年</option>
                    </select>
                    <select
                      value={purchasedMonth}
                      onChange={(e) => setPurchasedMonth(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">すべての月</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString()}>{m}月</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={exportPurchasedItemsCSV}
                  className="w-full h-12 bg-emerald-600 text-white px-4 rounded-lg font-semibold hover:bg-emerald-700 transition text-sm sm:text-base flex items-center justify-center"
                >
                  📥 CSVダウンロード
                </button>
              </div>

              {/* 期間集計カード */}
              {purchasedItems.length > 0 && (() => {
                const filteredItemsForSummary = getFilteredPurchasedItems();
                const summaryTotal = filteredItemsForSummary
                  .reduce((sum, item) => {
                    if (item.cancelledAt) return sum;
                    const cost = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                      ? item.customerCounterOffer
                      : (item.counterOffer || item.maxBid || 0));
                    const isB001Linked = item.agentCustomerId === 'B001';
                    const isB001Self = item.customerId === 'B001';
                    const countryLower = (item.customerCountry || '').trim().toLowerCase();
                    const isBrasilAgent = item.customerId?.startsWith('A') && (countryLower === 'brasil' || countryLower === 'brazil');

                    if (isB001Self || isB001Linked || isBrasilAgent) {
                      const japanSendAmount = item.japan_send_usd ?? calculateJapanSendAmount(item, Math.round(cost), exchangeRates['JPY'] || exchangeRate || 150);
                      return sum + japanSendAmount;
                    }
                    return sum + Math.round(cost);
                  }, 0);

                const unpaidSummaryTotal = filteredItemsForSummary
                  .reduce((sum, item) => {
                    if (item.cancelledAt) return sum;
                    const cost = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                      ? item.customerCounterOffer
                      : (item.counterOffer || item.maxBid || 0));
                    const isB001Linked = item.agentCustomerId === 'B001';
                    const isB001Self = item.customerId === 'B001';
                    const countryLower = (item.customerCountry || '').trim().toLowerCase();
                    const isBrasilAgent = item.customerId?.startsWith('A') && (countryLower === 'brasil' || countryLower === 'brazil');

                    if (isB001Self || isB001Linked || isBrasilAgent) {
                      const japanSendAmount = item.japan_send_usd ?? calculateJapanSendAmount(item, Math.round(cost), exchangeRates['JPY'] || exchangeRate || 150);
                      return sum + (item.paid_japan ? 0 : japanSendAmount);
                    }
                    return sum + (item.paid ? 0 : cost);
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

                return (
                  <div className="flex flex-col gap-3">
                    <div className="bg-white border border-indigo-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-indigo-500">合計金額</span>
                      <span className="text-base font-black text-indigo-600">
                        $ {Math.round(summaryTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="bg-white border border-red-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-red-500">未入金額</span>
                      <span className="text-base font-black text-red-600">
                        $ {Math.round(unpaidSummaryTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="bg-white border border-green-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-gray-500 font-sans">現地費用合計金額</span>
                      <span className="text-base font-black text-black font-sans">
                        $ {Math.round(localCostTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="bg-white border border-red-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-red-500 font-sans">現地費用未入金額</span>
                      <span className="text-base font-black text-red-600 font-sans">
                        $ {Math.round(unpaidLocalCostTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {purchasedItems.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <p className="text-gray-500 text-lg">購入済み商品がありません</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {getFilteredPurchasedItems()
                    .sort((a, b) => new Date(b.confirmedAt || '').getTime() - new Date(a.confirmedAt || '').getTime())
                    .map((item) => (
                      <div key={item.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4">
                        <div className="flex gap-4 mb-2">
                          <div className="relative w-32 h-32 flex-shrink-0">
                            {item.productImage ? (
                              <Image
                                src={item.productImage}
                                alt={item.productTitle}
                                fill
                                className="object-cover rounded"
                                sizes="128px"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border border-gray-200 text-center p-2 text-black font-sans">
                                <span className="text-xs font-semibold text-gray-500 font-sans">
                                  写真なし
                                </span>
                              </div>
                            )}
                            {/* キャンセルボタン（✕印） */}
                            <button
                              onClick={() => handleCancelItem(item.id, !!item.cancelledAt)}
                              className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all duration-200 z-10 ${
                                item.cancelledAt
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-white/95 text-gray-500 hover:bg-red-600 hover:text-white'
                              }`}
                              title={item.cancelledAt ? "キャンセルを取り消す" : "購入をキャンセルする"}
                            >
                              <span className="text-xs font-bold font-sans">✕</span>
                            </button>
                          </div>
                          <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                            {/* 1. 商品タイトル */}
                            <h3 className="text-xs font-semibold line-clamp-2 leading-tight h-[30px] overflow-hidden">{item.productTitle}</h3>

                            {/* 2. 在庫番号表示ボックス (h-7) */}
                            <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center justify-between w-full box-border">
                              <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis mr-2">
                                <span className="text-gray-500 text-xs font-medium mr-1">在庫番号:</span>
                                <span className="font-semibold text-gray-900 text-xs truncate">
                                  {item.stockNumber || '-'}
                                </span>
                              </div>
                              <button
                                onClick={() => handleUpdateStockNumber(item.id, item.productTitle, item.stockNumber || '')}
                                className="text-xs text-indigo-600 hover:text-indigo-800 underline font-semibold shrink-0"
                              >
                                {item.stockNumber ? '編集' : '追加'}
                              </button>
                            </div>

                            {/* 3. 請求書番号表示ボックス (h-7) */}
                            <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center justify-between w-full box-border">
                              <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis mr-2">
                                <span className="text-gray-500 text-xs font-medium mr-1">請求書番号:</span>
                                <span className="font-semibold text-gray-900 text-xs truncate">
                                  {item.invoiceNumber || '-'}
                                </span>
                              </div>
                              <button
                                onClick={() => handleUpdateInvoiceNumber(item.id, item.productTitle, item.invoiceNumber || '')}
                                className="text-xs text-indigo-600 hover:text-indigo-800 underline font-semibold shrink-0"
                              >
                                {item.invoiceNumber ? '編集' : '追加'}
                              </button>
                            </div>

                            {/* 4. ヤフオクURLボタン (h-7) */}
                            <div className="w-full">
                              {item.productUrl ? (
                                <a
                                  href={item.productUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans ${
                                    item.productId?.startsWith('m-') ? 'bg-blue-600' : 'bg-[#ff0033]'
                                  }`}
                                >
                                  {item.productId?.startsWith('m-') ? 'URL' : 'ヤフオクURL'}
                                </a>
                              ) : (
                                <div className="text-center text-xs text-gray-400 font-bold h-7 bg-gray-100 border border-gray-200 rounded px-2 flex items-center justify-center w-full box-border select-none font-sans">
                                  URLなし
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 申請タブと全く同じ申請内容ボックス（h-24） */}
                        <div className="h-24 px-3 py-0 bg-gray-50 border border-gray-100 rounded-lg text-xs mb-2 box-border grid grid-rows-2 grid-cols-2">
                          <div className="flex flex-col justify-center h-12">
                            <span className="text-gray-500 text-[10px] leading-tight">ID:</span>
                            <span className="font-semibold truncate text-black leading-tight">{item.customerId}</span>
                          </div>
                          <div className="flex flex-col justify-center h-12">
                            <span className="text-gray-500 text-[10px] leading-tight">確認日時:</span>
                            <span className="font-semibold truncate text-black leading-tight">{formatDateTime(item.confirmedAt || '')}</span>
                          </div>
                          <div className="flex flex-col justify-center h-12">
                            <span className="text-gray-500 text-[10px] leading-tight">氏名:</span>
                            <span className="font-semibold truncate text-black leading-tight">{item.customerFullName || item.customerName}</span>
                          </div>
                          <div className="flex flex-col justify-center h-12">
                            <span className="text-gray-500 text-[10px] leading-tight">
                              {item.customerId?.startsWith('C') && item.agentCustomerId ? 'エージェント名:' : '顧客名:'}
                            </span>
                            <span className="font-semibold truncate text-black leading-tight">{item.customerName}</span>
                          </div>
                        </div>

                        {/* 支払情報 & 金額ボックス */}
                        {item.customerId === 'B001' && false ? ( // B001用特別金額ボックスは廃止し他顧客と統一
                          (() => {
                            const cost = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                              ? item.customerCounterOffer
                              : (item.counterOffer || item.maxBid || 0));
                            const totalSalePrice = Math.round(cost || 0);
                            const brlRate = exchangeRates['BRL'] || 5.6;
                            const paidBrazilBrl = Math.ceil(((totalSalePrice * 0.5) * brlRate) / 10) * 10;
                            const paidParaguayUsd = Math.round(totalSalePrice * 0.5);

                            const japanSendAmount = item.japan_send_usd ?? calculateJapanSendAmount(item, totalSalePrice, exchangeRates['JPY'] || exchangeRate || 150);

                            // BRL表記フォーマット関数
                            const formatBrl = (amount: number) => {
                              const rounded = Math.round(amount);
                              return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                            };

                            return (
                              <>
                                <div className="space-y-2 mb-2 bg-gray-50 p-3 rounded-lg border border-gray-100 font-sans text-xs">
                                  {/* 1段目: 合計支払額 */}
                                  <div className="flex items-center justify-between font-bold text-gray-700">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-500">合計支払額:</span>
                                      {item.paid ? (
                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] rounded-full whitespace-nowrap">
                                          ✓ 支払済
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded-full whitespace-nowrap">
                                          未入金
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-sm ${item.paid ? 'text-gray-400 line-through' : 'text-indigo-600'}`}>
                                      ${totalSalePrice.toLocaleString('en-US')}
                                    </span>
                                  </div>

                                  {/* 2段目: 支払額 🇧🇷 */}
                                  <div className="flex items-center justify-between font-bold text-gray-700 border-t border-gray-200/50 pt-2">
                                    <label className="flex items-center cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={item.paid_brazil}
                                        onChange={(e) => updatePaidSplitStatus(item.id, { paid_brazil: e.target.checked })}
                                        className="w-4 h-4 mr-1.5 cursor-pointer text-green-600 border-gray-300 rounded focus:ring-green-500"
                                      />
                                      <span className="text-gray-500">支払額 🇧🇷:</span>
                                      {item.paid_brazil && item.paid_brazil_at && (
                                        <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium">
                                          ✓ 支払済 ({formatDateTime(item.paid_brazil_at || '')})
                                        </span>
                                      )}
                                    </label>
                                    <span className={`text-sm ${item.paid_brazil ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                                      R$ {formatBrl(paidBrazilBrl)}
                                    </span>
                                  </div>

                                  {/* 3段目: 支払額 🇵🇾 */}
                                  <div className="flex items-center justify-between font-bold text-gray-700 border-t border-gray-200/50 pt-2">
                                    <label className="flex items-center cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={item.paid_paraguay}
                                        onChange={(e) => updatePaidSplitStatus(item.id, { paid_paraguay: e.target.checked })}
                                        className="w-4 h-4 mr-1.5 cursor-pointer text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                                      />
                                      <span className="text-gray-500">支払額 🇵🇾:</span>
                                      {item.paid_paraguay && item.paid_paraguay_at && (
                                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium">
                                          ✓ 支払済 ({formatDateTime(item.paid_paraguay_at || '')})
                                        </span>
                                      )}
                                    </label>
                                    <span className={`text-sm ${item.paid_paraguay ? 'text-gray-400 line-through' : 'text-amber-600'}`}>
                                      ${paidParaguayUsd.toLocaleString('en-US')}
                                    </span>
                                  </div>

                                  {/* 4段目: 支払額 🇯🇵 */}
                                  <div className={`flex items-center justify-between font-bold text-gray-700 border-t border-gray-200/50 pt-2 bg-red-50 -mx-3 p-3`}>
                                    <label className="flex items-center cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={item.paid_japan}
                                        onChange={(e) => updatePaidSplitStatus(item.id, { paid_japan: e.target.checked })}
                                        className="w-4 h-4 mr-1.5 cursor-pointer text-red-600 border-gray-300 rounded focus:ring-red-500"
                                      />
                                      <span className="text-red-600 font-black">支払額 🇯🇵:</span>
                                      {item.paid_japan && item.paid_japan_at && (
                                        <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-bold font-sans">
                                          ✓ 支払済 ({formatDateTime(item.paid_japan_at || '')})
                                        </span>
                                      )}
                                    </label>
                                    <span className={`text-sm ${item.paid_japan ? 'text-red-400 line-through' : 'text-red-600 font-black'}`}>
                                      ${Math.round(japanSendAmount).toLocaleString('en-US')}
                                    </span>
                                  </div>

                                  {/* 5段目: 現地費用 (管理画面・B001用チェックボックス付) */}
                                  {item.delivery_location !== 'JP' && (
                                    <div className="flex items-center justify-between font-bold text-gray-700 border-t border-gray-200/50 pt-2 bg-green-50 -mx-3 -mb-3 p-3 rounded-b-lg">
                                      <label className="flex items-center cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={item.paid_local}
                                          onChange={(e) => updatePaidSplitStatus(item.id, { paid_local: e.target.checked })}
                                          className="w-4 h-4 mr-1.5 cursor-pointer text-green-600 border-gray-300 rounded focus:ring-green-500"
                                        />
                                        <span className="text-black font-black">現地費用:</span>
                                        {item.paid_local && item.paid_local_at && (
                                          <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium">
                                            ✓ 支払済 ({formatDateTime(item.paid_local_at || '')})
                                          </span>
                                        )}
                                      </label>
                                      <span className={`text-base font-bold ${item.paid_local ? 'text-gray-400 line-through' : (typeof calculateLocalCost(item.delivery_location, item, item.shipping_method) === 'string' ? 'text-red-600' : 'text-black font-black')}`}>
                                        {formatLocalCost(calculateLocalCost(item.delivery_location, item, item.shipping_method), 'USD')}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* 商品渡し場所 (B001用) */}
                                <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                                  <span className="text-gray-500 font-medium">引渡場所:</span>
                                  <span className="font-semibold text-black">{getDeliveryLocationName(item.delivery_location, item.delivery_city)}</span>
                                </div>

                                {/* 発送方法 (B001用) */}
                                {item.delivery_location !== 'JP' && (
                                  <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                                    <span className="text-gray-500 font-medium">発送方法:</span>
                                    <span className="font-semibold text-black">{item.shipping_method === 'air' ? '航空便 ✈️' : 'コンテナ 🚢'}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()
                        ) : (
                          <>
                            <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                              <label className="flex items-center cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={item.paid}
                                  onChange={(e) => updatePaidStatus(item.id, e.target.checked)}
                                  className="w-4 h-4 mr-1.5 cursor-pointer text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                                  disabled={!!item.cancelledAt}
                                />
                                <span className="text-gray-700 font-semibold">顧客支払額:</span>
                                <div className="flex flex-col gap-0.5 ml-1.5">
                                  {item.paid && item.paidAt && (
                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[9px] rounded whitespace-nowrap font-bold font-sans">
                                      ✓ 支払済 ({formatDateTime(item.paidAt)})
                                    </span>
                                  )}
                                  {item.cancelledAt && (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] rounded whitespace-nowrap font-bold font-sans">
                                      ✗ 取消済 ({formatDateTime(item.cancelledAt)})
                                    </span>
                                  )}
                                  {!item.paid && !item.cancelledAt && (
                                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] rounded whitespace-nowrap font-medium font-sans">
                                      未入金
                                    </span>
                                  )}
                                </div>
                              </label>
                              <span className={`text-base font-bold whitespace-nowrap ${item.cancelledAt || item.paid ? 'text-gray-400 line-through' : 'text-emerald-600'}`}>
                                $ {Math.round(item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                                  ? item.customerCounterOffer
                                  : (item.counterOffer || item.maxBid || 0))).toLocaleString('en-US')}
                              </span>
                            </div>

                            {/* 日本支払額 (ブラジルエージェント or B001紐づき顧客用・チェックボックス付) */}
                            {(item.agentCustomerId === 'B001' || (item.customerId?.startsWith('A') && ((item.customerCountry || '').toLowerCase().trim() === 'brasil' || (item.customerCountry || '').toLowerCase().trim() === 'brazil'))) && (() => {
                              const totalSalePrice = Math.round(item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                                ? item.customerCounterOffer
                                : (item.counterOffer || item.maxBid || 0)));
                              const japanSendAmount = item.japan_send_usd ?? calculateJapanSendAmount(item, totalSalePrice, exchangeRates['JPY'] || exchangeRate || 150);

                              return (
                                <div className="mb-2 h-12 px-3 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between font-sans text-xs">
                                  <label className="flex items-center cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={item.paid_japan}
                                      onChange={(e) => updatePaidSplitStatus(item.id, { paid_japan: e.target.checked })}
                                      className="w-4 h-4 mr-1.5 cursor-pointer text-red-600 border-gray-300 rounded focus:ring-red-500"
                                    />
                                    <span className="text-red-600 font-black">日本支払額:</span>
                                    {item.paid_japan && item.paid_japan_at && (
                                      <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-bold font-sans">
                                        ✓ 支払済 ({formatDateTime(item.paid_japan_at)})
                                      </span>
                                    )}
                                  </label>
                                  <span className={`text-base font-bold ${item.paid_japan ? 'text-red-400 line-through' : 'text-red-600'}`}>
                                    $ {Math.round(japanSendAmount).toLocaleString('en-US')}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* 商品渡し場所 (通常顧客用) */}
                            <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                              <span className="text-gray-500 font-medium">引渡場所:</span>
                              <span className="font-semibold text-black">{getDeliveryLocationName(item.delivery_location, item.delivery_city)}</span>
                            </div>

                            {/* 現地費用 (通常顧客用・チェックボックス付) */}
                            {item.delivery_location !== 'JP' && (
                              <>
                                <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                                  <label className="flex items-center cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={item.paid_local}
                                      onChange={(e) => updatePaidSplitStatus(item.id, { paid_local: e.target.checked })}
                                      className="w-4 h-4 mr-1.5 cursor-pointer text-green-600 border-gray-300 rounded focus:ring-green-500"
                                    />
                                    <span className="text-gray-500">現地費用:</span>
                                    {item.paid_local && item.paid_local_at && (
                                      <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium font-sans">
                                        ✓ 支払済 ({formatDateTime(item.paid_local_at)})
                                      </span>
                                    )}
                                  </label>
                                  <span className={`text-base font-bold ${item.paid_local ? 'text-gray-400 line-through' : (typeof calculateLocalCost(item.delivery_location, item, item.shipping_method) === 'string' ? 'text-red-600' : 'text-black')}`}>
                                    {formatLocalCost(calculateLocalCost(item.delivery_location, item, item.shipping_method), 'USD')}
                                  </span>
                                </div>
                                {/* 発送方法 */}
                                <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                                  <span className="text-gray-500 font-medium">発送方法:</span>
                                  <span className="font-semibold text-black">
                                    {item.shipping_method === 'air' ? '航空便 ✈️' : 'コンテナ 🚢'}
                                  </span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                </div>


              </>
            )}
          </>
        )}

        {/* 顧客タブ */}
        {activeTab === 'customers' && (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 font-sans">顧客リスト</h2>
              <button
                onClick={fetchUsersData}
                disabled={loadingUsers}
                className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-100 transition text-sm flex items-center gap-1"
              >
                {loadingUsers ? '読み込み中...' : '🔁 更新'}
              </button>
            </div>

            {/* サマリーカード */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 font-sans">
              <div className="bg-white border border-gray-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-gray-500">保証金確認済 / 登録顧客数</span>
                <span className="text-base font-bold text-indigo-600">
                  {customersList.filter(c => c.depositConfirmedAt).length} / {customersList.length} 名
                </span>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-gray-500">未入金 / 入金済</span>
                <span className="text-base font-bold flex items-center gap-1.5">
                  <span className="text-red-600">
                    $ {Math.round(customersList.reduce((sum, c) => sum + c.unpaidAmount, 0)).toLocaleString('en-US')}
                  </span>
                  <span className="text-gray-400">/</span>
                  <span className="text-green-600">
                    $ {Math.round(customersList.reduce((sum, c) => sum + c.paidAmount, 0)).toLocaleString('en-US')}
                  </span>
                </span>
              </div>
            </div>

            {loadingUsers ? (
              <div className="text-center py-12 text-gray-500 font-sans">データを読み込み中...</div>
            ) : customersList.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-sans">顧客データが存在しません</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm font-sans">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">ID / 氏名</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">国名</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">WhatsApp</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">担当AGT</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">規約同意</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">保証金</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">未入金</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">入金済</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">操作</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">最終ログイン</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {customersList.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 whitespace-nowrap text-left">
                          <div className="font-bold text-gray-900">{customer.customerId}</div>
                          <div className="text-xs text-gray-500">{customer.fullName}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                          {customer.country || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {customer.whatsapp ? (
                            <a
                              href={`https://wa.me/${customer.whatsapp.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center bg-[#25D366] hover:bg-[#128C7E] text-white w-8 h-8 rounded-full shadow-sm transition"
                              title="WhatsApp"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4"
                              >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-medium text-center">
                          {customer.agentCustomerId ? (
                            <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                              👔 {customer.agentCustomerId}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 text-center">
                          {customer.termsAcceptedAt ? (
                            <span>{formatDateOnly(customer.termsAcceptedAt)}</span>
                          ) : (
                            <span className="text-red-500 font-medium">未同意</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-bold text-gray-900">$ {customer.depositAmount}</span>
                            {customer.depositConfirmedAt ? (
                              <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-[10px] font-semibold">
                                確認済
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px] font-semibold">
                                未入金
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="font-bold text-red-600">
                            $ {Math.round(customer.unpaidAmount).toLocaleString('en-US')}
                          </div>
                          <div className="text-xs text-gray-500">({customer.unpaidCount} 件)</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="font-bold text-green-600">
                            $ {Math.round(customer.paidAmount).toLocaleString('en-US')}
                          </div>
                          <div className="text-xs text-gray-500">({customer.paidCount} 件)</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <button
                            onClick={() => {
                              setEditingUser(customer);
                              setEditForm({
                                depositAmount: customer.depositAmount,
                                depositConfirmed: !!customer.depositConfirmedAt,
                                agentCustomerId: customer.agentCustomerId || ''
                              });
                            }}
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                          >
                            編集
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">
                          {customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* エージェントタブ */}
        {activeTab === 'agents' && (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 font-sans">エージェントリスト</h2>
              <button
                onClick={fetchUsersData}
                disabled={loadingUsers}
                className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-100 transition text-sm flex items-center gap-1"
              >
                {loadingUsers ? '読み込み中...' : '🔁 更新'}
              </button>
            </div>

            {/* サマリーカード */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 font-sans">
              <div className="bg-white border border-gray-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-gray-500">保証金確認済 / 登録AGT数</span>
                <span className="text-base font-bold text-indigo-600">
                  {agentsList.filter(a => a.depositConfirmedAt).length} / {agentsList.length} 名
                </span>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-gray-500">未入金 / 入金済（管理顧客）</span>
                <span className="text-base font-bold flex items-center gap-1.5">
                  <span className="text-red-600">
                    $ {Math.round(agentsList.reduce((sum, a) => sum + a.unpaidAmount, 0)).toLocaleString('en-US')}
                  </span>
                  <span className="text-gray-400">/</span>
                  <span className="text-green-600">
                    $ {Math.round(agentsList.reduce((sum, a) => sum + a.paidAmount, 0)).toLocaleString('en-US')}
                  </span>
                </span>
              </div>
              <div className="bg-white border border-gray-100 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-gray-500">未入金 / 入金済（AGT）</span>
                <span className="text-base font-bold flex items-center gap-1.5">
                  <span className="text-red-600">
                    $ {Math.round(agentsList.reduce((sum, a) => sum + (a.selfUnpaidAmount || 0), 0)).toLocaleString('en-US')}
                  </span>
                  <span className="text-gray-400">/</span>
                  <span className="text-green-600">
                    $ {Math.round(agentsList.reduce((sum, a) => sum + (a.selfPaidAmount || 0), 0)).toLocaleString('en-US')}
                  </span>
                </span>
              </div>
            </div>

            {/* 招待コード管理セクション */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 mb-6 font-sans">
              <h3 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-1.5">
                🔑 エージェント招待コード管理
              </h3>
              <div className="flex flex-col gap-3 mb-4 w-full">
                <button
                  onClick={handleGenerateInviteCode}
                  disabled={isGeneratingCode}
                  className="bg-indigo-600 text-white w-full h-12 rounded-lg font-semibold hover:bg-indigo-700 transition text-sm flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {isGeneratingCode ? '生成中...' : '✨ 新規招待コード生成'}
                </button>
                {latestGeneratedCode && (
                  <div className="bg-white border border-indigo-200 rounded-lg h-12 px-3 flex items-center justify-between w-full shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">最新コード:</span>
                      <span className="font-mono font-bold text-indigo-700 select-all">{latestGeneratedCode}</span>
                    </div>
                    <button
                      onClick={() => handleCopyText(latestGeneratedCode)}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold px-3 py-1.5 rounded transition"
                    >
                      コピー
                    </button>
                  </div>
                )}
              </div>

              {inviteCodes.length > 0 ? (
                <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg max-h-60 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs font-sans">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-center font-semibold text-gray-500">コード</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-500">有効期限</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-500">状態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {inviteCodes.map((code) => {
                        const isExpired = new Date(code.expiresAt).getTime() < Date.now();
                        return (
                          <tr key={code.code} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 text-center font-mono font-bold text-gray-700 select-all">{code.code}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{formatDateOnly(code.expiresAt)}</td>
                            <td className="px-3 py-2 text-center">
                              {code.used ? (
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] font-bold whitespace-nowrap">使用済</span>
                              ) : isExpired ? (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold whitespace-nowrap">期限切れ</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-[10px] font-bold whitespace-nowrap">有効</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-2">生成された招待コードはありません。</p>
              )}
            </div>

            {loadingUsers ? (
              <div className="text-center py-12 text-gray-500 font-sans">データを読み込み中...</div>
            ) : agentsList.length === 0 ? (
              <div className="text-center py-12 text-gray-500 font-sans">エージェントデータが存在しません</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm font-sans">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">ID / 氏名</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">国名</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">WhatsApp</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">管理顧客</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">規約同意</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">保証金</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">未入金</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">入金済</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">操作</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">最終ログイン</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {agentsList.map((agent) => (
                      <tr key={agent.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 whitespace-nowrap text-left">
                          <div className="font-bold text-gray-900">{agent.customerId}</div>
                          <div className="text-xs text-gray-500">{agent.fullName}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                          {agent.country || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {agent.whatsapp ? (
                            <a
                              href={`https://wa.me/${agent.whatsapp.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center bg-[#25D366] hover:bg-[#128C7E] text-white w-8 h-8 rounded-full shadow-sm transition"
                              title="WhatsApp"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4"
                              >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-gray-700">
                          {agent.customersCount} 名
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 text-center">
                          {agent.termsAcceptedAt ? (
                            <span>{formatDateOnly(agent.termsAcceptedAt)}</span>
                          ) : (
                            <span className="text-red-500 font-medium">未同意</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-bold text-gray-900">$ {agent.depositAmount}</span>
                            {agent.depositConfirmedAt ? (
                              <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-[10px] font-semibold">
                                確認済
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px] font-semibold">
                                未入金
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="font-bold text-red-600">
                            $ {Math.round(agent.selfUnpaidAmount || 0).toLocaleString('en-US')}
                          </div>
                          <div className="text-xs text-gray-500">({agent.selfUnpaidCount || 0} 件)</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="font-bold text-green-600">
                            $ {Math.round(agent.selfPaidAmount || 0).toLocaleString('en-US')}
                          </div>
                          <div className="text-xs text-gray-500">({agent.selfPaidCount || 0} 件)</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <button
                            onClick={() => {
                              setEditingUser(agent);
                              setEditForm({
                                depositAmount: agent.depositAmount,
                                depositConfirmed: !!agent.depositConfirmedAt,
                                agentCustomerId: ''
                              });
                            }}
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                          >
                            編集
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">
                          {agent.lastLoginAt ? formatDateTime(agent.lastLoginAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 入金タブ */}
        {activeTab === 'financials' && (
          <div className="flex flex-col gap-6 w-full p-4 sm:p-6 bg-gray-50 rounded-xl min-h-[500px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">📊 財務ダッシュボード</h2>
                <p className="text-gray-500 text-sm mt-1">B001傘下顧客およびブラジルエージェントの売上集計</p>
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border">
                <span className="text-gray-600 font-medium">対象月:</span>
                <input 
                  type="month" 
                  value={financialMonth}
                  onChange={(e) => {
                    setFinancialMonth(e.target.value);
                    fetchFinancials(e.target.value);
                  }}
                  className="border-none bg-transparent focus:ring-0 text-indigo-700 font-bold outline-none"
                />
              </div>
            </div>

            {isLoadingFinancials ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : financialData ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                {/* 顧客支払額 */}
                <div className="bg-white rounded-xl shadow border border-gray-100 p-6 flex flex-col justify-center">
                  <div className="text-sm font-bold text-gray-500 mb-2">顧客支払額</div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xl font-bold text-red-500">
                      未入金 USD {financialData.unpaidCustomerPayment?.toFixed(2)}
                    </span>
                    <span className="text-2xl font-black text-gray-800">
                      / 合計 USD {financialData.totalCustomerPayment?.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* システム利用料 (FFGN売上) */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow p-6 flex flex-col justify-center text-white">
                  <div className="text-sm font-bold text-indigo-100 mb-2">システム利用料 (FFGN売上)</div>
                  <div className="text-3xl font-black">
                    合計 USD {financialData.systemFee?.toFixed(2)}
                  </div>
                </div>

                {/* 商品立替金 (JOGAへの送金) */}
                <div className="bg-white rounded-xl shadow border border-gray-100 p-6 flex flex-col justify-center">
                  <div className="text-sm font-bold text-gray-500 mb-2">商品立替金 (株式会社JOGAへ送金する分)</div>
                  <div className="text-3xl font-black text-blue-600">
                    合計 USD {financialData.japanPayout?.toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-center h-64 text-gray-400">
                データが取得できませんでした
              </div>
            )}
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="space-y-6">
            {/* 入金登録カード */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6 font-sans">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900">入金登録</h2>
              <form onSubmit={handleCreateDeposit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">顧客</label>
                    <select
                      value={depositForm.customerId}
                      onChange={(e) => setDepositForm({ ...depositForm, customerId: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                      required
                    >
                      <option value="">顧客を選択してください</option>
                      {customersList.map(c => (
                        <option key={c.id} value={c.customerId}>
                          {c.customerId} {c.fullName || c.customerName}
                        </option>
                      ))}
                      {agentsList.map(a => (
                        <option key={a.id} value={a.customerId}>
                          {a.customerId} {a.fullName || a.customerName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">入金確認日</label>
                    <input
                      type="date"
                      value={depositForm.depositDate}
                      onChange={(e) => setDepositForm({ ...depositForm, depositDate: e.target.value })}
                      className="w-full h-12 block min-w-0 max-w-full box-border border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                      style={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        display: 'block',
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        padding: '0 10px',
                        lineHeight: '46px'
                      }}
                      required
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      {isB001LinkedOrBrasilForForm ? '通貨 / 入金額' : '入金額 (USD)'}
                    </label>
                    {isB001LinkedOrBrasilForForm ? (
                      <div className="flex gap-2">
                        <select
                          value={depositForm.currency}
                          onChange={(e) => {
                            const newCurrency = e.target.value;
                            const defaultMethod = newCurrency === 'BRL' ? 'pix' : 'bank';
                            setDepositForm({ 
                              ...depositForm, 
                              currency: newCurrency,
                              paymentMethod: defaultMethod
                            });
                          }}
                          className="w-1/3 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border focus:ring-2 focus:ring-indigo-500 outline-none"
                          style={{ textAlign: 'center', textAlignLast: 'center' }}
                        >
                          <option value="USD">USD</option>
                          <option value="BRL">BRL</option>
                        </select>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                            {depositForm.currency === 'BRL' ? 'R$' : '$'}
                          </span>
                          <input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={depositForm.amount}
                            onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                            className="w-full h-12 border border-gray-300 rounded-lg pl-8 pr-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-black box-border"
                            required
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={depositForm.amount}
                          onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                          className="w-full h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-black box-border"
                          required
                        />
                      </div>
                    )}
                  </div>
                  {isB001LinkedOrBrasilForForm && depositForm.currency === 'BRL' && (
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">USD 換算</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={depositForm.usdAmount}
                          onChange={(e) => setDepositForm({ ...depositForm, usdAmount: e.target.value })}
                          className="w-full h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-black box-border"
                          required
                        />
                      </div>
                    </div>
                  )}
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">内容</label>
                    <select
                      value={depositForm.depositType}
                      onChange={(e) => setDepositForm({ ...depositForm, depositType: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                      required
                    >
                      <option value="商品代金">商品代金</option>
                      <option value="現地費用">現地費用</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">入金方法</label>
                    <select
                      value={depositForm.paymentMethod}
                      onChange={(e) => setDepositForm({ ...depositForm, paymentMethod: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                      required
                    >
                      {(() => {
                        if (isB001LinkedOrBrasilForForm) {
                          if (depositForm.currency === 'BRL') {
                            return (
                              <>
                                <option value="pix">PIX</option>
                                <option value="card">カード</option>
                                <option value="cash">現金</option>
                                <option value="bank">銀行</option>
                              </>
                            );
                          } else {
                            return (
                              <>
                                <option value="bank">銀行</option>
                                <option value="paypal">PayPal</option>
                                <option value="usdt">USDT</option>
                                <option value="card">カード</option>
                                <option value="cash">現金</option>
                              </>
                            );
                          }
                        } else {
                          return (
                            <>
                              <option value="bank">銀行</option>
                              <option value="paypal">PayPal</option>
                              <option value="usdt">USDT</option>
                              <option value="cash">現金</option>
                            </>
                          );
                        }
                      })()}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full h-12 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition text-sm sm:text-base mt-2 flex items-center justify-center"
                >
                  登録する
                </button>
              </form>
            </div>

            {/* フィルター＆抽出合計金額カード */}
            <div className="bg-white rounded-lg shadow p-4 sm:p-6 font-sans">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">ID:</span>
                  <select
                    value={depositFilterCustomer}
                    onChange={(e) => setDepositFilterCustomer(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">すべてのID</option>
                    <option value="B001_FFGN">B001 FFGN</option>
                    {(() => {
                      const allIds = new Set<string>();
                      depositsList.forEach(d => allIds.add(d.customer_id));
                      return Array.from(allIds).sort().map(id => {
                        const cust = customersList.find(c => c.customerId === id) || agentsList.find(a => a.customerId === id);
                        const name = cust ? (cust.fullName || cust.customerName) : '';
                        return (
                          <option key={id} value={id}>
                            {id} {name}
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">期間:</span>
                  <div className="flex gap-2 w-full">
                    <select
                      value={depositFilterYear}
                      onChange={(e) => setDepositFilterYear(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">すべての年</option>
                      <option value="2026">2026年</option>
                      <option value="2027">2027年</option>
                      <option value="2028">2028年</option>
                      <option value="2029">2029年</option>
                      <option value="2030">2030年</option>
                    </select>
                    <select
                      value={depositFilterMonth}
                      onChange={(e) => setDepositFilterMonth(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">すべての月</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString()}>{m}月</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={exportDepositsCSV}
                  className="w-full h-12 bg-emerald-600 text-white px-4 rounded-lg font-semibold hover:bg-emerald-700 transition text-sm sm:text-base flex items-center justify-center"
                >
                  📥 CSVダウンロード
                </button>
              </div>

              {/* 抽出合計金額カード & 集計ボックス */}
              {(() => {
                // 期間・顧客フィルターを適用した商品代金の USD 入金合計
                const currentFilteredTotalUsd = getFilteredDeposits()
                  .filter(item => item.deposit_type === '商品代金' || !item.deposit_type)
                  .reduce((sum, item) => {
                    const isBrl = item.payment_method?.endsWith('_brl');
                    return sum + (isBrl ? (item.usd_amount || 0) : (item.amount || 0));
                  }, 0);

                // 期間・顧客フィルターを適用した現地費用の USD 入金合計
                const currentFilteredTotalLocalCostUsd = getFilteredDeposits()
                  .filter(item => item.deposit_type === '現地費用')
                  .reduce((sum, item) => {
                    const isBrl = item.payment_method?.endsWith('_brl');
                    return sum + (isBrl ? (item.usd_amount || 0) : (item.amount || 0));
                  }, 0);

                // 現地費用合計・未入金の計算用
                // 入金タブ側の顧客・期間（年・月）フィルターを適用した購入商品リスト
                const targetPurchasedForLocalCost = purchasedItems.filter(item => {
                  if (item.cancelledAt) return false;
                  if (depositFilterCustomer !== 'all') {
                    if (depositFilterCustomer === 'B001_FFGN') {
                      const linkedCustomerIds = customersList
                        .filter(c => c.agentCustomerId === 'B001')
                        .map(c => c.customerId);
                      const brasilAgentIds = [
                        ...customersList.filter(c => c.customerId?.startsWith('A') && ((c.country || '').trim().toLowerCase() === 'brasil' || (c.country || '').trim().toLowerCase() === 'brazil')).map(c => c.customerId),
                        ...agentsList.filter(a => a.customerId?.startsWith('A') && ((a.country || '').trim().toLowerCase() === 'brasil' || (a.country || '').trim().toLowerCase() === 'brazil')).map(a => a.customerId)
                      ];
                      return item.customerId === 'B001' || linkedCustomerIds.includes(item.customerId) || brasilAgentIds.includes(item.customerId);
                    }
                    return item.customerId === depositFilterCustomer;
                  }
                  return true;
                }).filter(item => {
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

                if (depositFilterCustomer === 'all') {
                  // すべてのIDのとき
                  return (
                    <div className="flex flex-col gap-3 mb-6">
                      <div className="bg-white border border-indigo-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                        <span className="text-xs font-bold text-indigo-500">合計金額 USD</span>
                        <span className="text-base font-black text-indigo-600">
                          $ {Math.round(currentFilteredTotalUsd).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="bg-white border border-green-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                        <span className="text-xs font-bold text-gray-500 font-sans">現地費用合計金額 USD</span>
                        <span className="text-base font-black text-black font-sans">
                          $ {Math.round(currentFilteredTotalLocalCostUsd).toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  // 特定のIDを選択しているとき (全顧客・エージェント)
                  // 残高 USD の計算
                  const isB001_FFGN = depositFilterCustomer === 'B001_FFGN';
                  const linkedCustomerIds = customersList
                    .filter(c => c.agentCustomerId === 'B001')
                    .map(c => c.customerId);
                  const brasilAgentIds = [
                    ...customersList.filter(c => c.customerId?.startsWith('A') && ((c.country || '').trim().toLowerCase() === 'brasil' || (c.country || '').trim().toLowerCase() === 'brazil')).map(c => c.customerId),
                    ...agentsList.filter(a => a.customerId?.startsWith('A') && ((a.country || '').trim().toLowerCase() === 'brasil' || (a.country || '').trim().toLowerCase() === 'brazil')).map(a => a.customerId)
                  ];

                  // 通算入金 (商品代金のみ)
                  const totalDeposits = depositsList.filter(d => {
                    if (isB001_FFGN) {
                      return d.customer_id === 'B001' || linkedCustomerIds.includes(d.customer_id) || brasilAgentIds.includes(d.customer_id);
                    }
                    return d.customer_id === depositFilterCustomer;
                  })
                  .filter(d => d.deposit_type === '商品代金' || !d.deposit_type)
                  .reduce((sum, d) => {
                    const isBrl = d.payment_method?.endsWith('_brl');
                    return sum + (isBrl ? (d.usd_amount || 0) : (d.amount || 0));
                  }, 0);

                  // 通算入金 (現地費用のみ)
                  const totalLocalCostDeposits = depositsList.filter(d => {
                    if (isB001_FFGN) {
                      return d.customer_id === 'B001' || linkedCustomerIds.includes(d.customer_id) || brasilAgentIds.includes(d.customer_id);
                    }
                    return d.customer_id === depositFilterCustomer;
                  })
                  .filter(d => d.deposit_type === '現地費用')
                  .reduce((sum, d) => {
                    const isBrl = d.payment_method?.endsWith('_brl');
                    return sum + (isBrl ? (d.usd_amount || 0) : (d.amount || 0));
                  }, 0);

                  // 通算購入
                  const totalPurchased = purchasedItems.filter(item => {
                    if (item.cancelledAt) return false;
                    if (isB001_FFGN) {
                      return item.customerId === 'B001' || item.agentCustomerId === 'B001' || (item.customerId?.startsWith('A') && ((item.customerCountry || '').trim().toLowerCase() === 'brasil' || (item.customerCountry || '').trim().toLowerCase() === 'brazil'));
                    }
                    return item.customerId === depositFilterCustomer;
                  }).reduce((sum, item) => {
                    const cost = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                      ? item.customerCounterOffer
                      : (item.counterOffer || item.maxBid || 0));
                    const totalSalePrice = Math.round(cost);
                    return sum + totalSalePrice;
                  }, 0);

                  const balance = totalDeposits - totalPurchased;
                  const isNegative = balance < 0;
                  const formattedBalance = isNegative 
                    ? `- $ ${Math.abs(Math.round(balance)).toLocaleString('en-US')}`
                    : `$ ${Math.round(balance).toLocaleString('en-US')}`;

                  const localCostBalance = totalLocalCostDeposits - localCostTotal;
                  const isLocalCostNegative = localCostBalance < 0;
                  const formattedLocalCostBalance = isLocalCostNegative 
                    ? `- $ ${Math.abs(Math.round(localCostBalance)).toLocaleString('en-US')}`
                    : `$ ${Math.round(localCostBalance).toLocaleString('en-US')}`;

                  return (
                    <div className="flex flex-col gap-3 mb-6">
                      <div className="bg-white border border-indigo-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                        <span className="text-xs font-bold text-indigo-500">合計金額 USD</span>
                        <span className="text-base font-black text-indigo-600">
                          $ {Math.round(currentFilteredTotalUsd).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className={`bg-white border ${isNegative ? 'border-red-100' : 'border-green-100'} rounded-lg h-12 px-3 flex items-center justify-between shadow-sm`}>
                        <span className={`text-xs font-bold ${isNegative ? 'text-red-500' : 'text-green-500'}`}>
                          残高 USD
                        </span>
                        <span className={`text-base font-black ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                          {formattedBalance}
                        </span>
                      </div>
                      <div className="bg-white border border-green-50 rounded-lg h-12 px-3 flex items-center justify-between shadow-sm">
                        <span className="text-xs font-bold text-gray-500 font-sans">現地費用合計金額 USD</span>
                        <span className="text-base font-black text-black font-sans">
                          $ {Math.round(currentFilteredTotalLocalCostUsd).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className={`bg-white border ${isLocalCostNegative ? 'border-red-100' : 'border-green-100'} rounded-lg h-12 px-3 flex items-center justify-between shadow-sm`}>
                        <span className={`text-xs font-bold ${isLocalCostNegative ? 'text-red-500' : 'text-green-500'} font-sans`}>
                          現地費用残高 USD
                        </span>
                        <span className={`text-base font-black ${isLocalCostNegative ? 'text-red-600' : 'text-green-600'} font-sans`}>
                          {formattedLocalCostBalance}
                        </span>
                      </div>
                    </div>
                  );
                }
              })()}

              {/* 入金履歴一覧リスト */}
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900">入金履歴</h2>
              {loadingDeposits ? (
                <div className="text-center py-6 text-gray-500">読み込み中...</div>
              ) : getFilteredDeposits().length === 0 ? (
                <div className="text-center py-6 text-gray-500">入金データが存在しません</div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">入金日</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">通貨</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">入金額</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">内容</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">顧客</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">支払方法</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">USD</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {getFilteredDeposits().map((item) => {
                        const cust = customersList.find(c => c.customerId === item.customer_id) || agentsList.find(a => a.customerId === item.customer_id);
                        const name = cust ? (cust.fullName || cust.customerName) : '';
                        const dateFormatted = item.deposit_date.replace(/-/g, '/');
                        const paymentMethodNames: Record<string, string> = {
                          bank: '銀行',
                          paypal: 'PayPal',
                          usdt: 'USDT',
                          card: 'カード',
                          card_brl: 'カード (BRL)',
                          pix_brl: 'PIX',
                          cash_brl: '現金 (BRL)',
                          cash: '現金',
                          pix: 'PIX'
                        };
                        const isBrl = item.payment_method?.endsWith('_brl');
                        const formatBrl = (amount: number) => {
                          const formatted = amount.toFixed(2);
                          const [integerPart, decimalPart] = formatted.split('.');
                          const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                          return `${formattedInteger},${decimalPart}`;
                        };
                        return (
                          <tr key={item.id} className="hover:bg-gray-50 transition text-black">
                            <td className="px-4 py-3 whitespace-nowrap text-left font-medium text-gray-700">
                              {dateFormatted}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-bold">
                              {isBrl ? 'BRL' : 'USD'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-green-600">
                              {isBrl ? `R$ ${formatBrl(Number(item.amount))}` : `$ ${Number(item.amount).toLocaleString('en-US')}`}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                              {item.deposit_type || '商品代金'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-left">
                              <span className="font-bold text-gray-900">{item.customer_id}</span>{' '}
                              <span className="text-gray-500 text-xs">{name}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                              {paymentMethodNames[item.payment_method] || item.payment_method}
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap font-bold text-indigo-600 ${(!isBrl || !item.usd_amount) ? 'text-center' : 'text-right'}`}>
                              {isBrl ? (item.usd_amount ? `$ ${Number(item.usd_amount).toLocaleString('en-US')}` : '-') : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => {
                                  const isBrlVal = item.payment_method?.endsWith('_brl');
                                  const rawMethod = isBrlVal ? item.payment_method.replace('_brl', '') : item.payment_method;
                                  setEditingDeposit(item);
                                  setEditDepositForm({
                                    depositDate: item.deposit_date,
                                    amount: item.amount.toString(),
                                    paymentMethod: rawMethod,
                                    currency: isBrlVal ? 'BRL' : 'USD',
                                    usdAmount: item.usd_amount ? item.usd_amount.toString() : '',
                                    depositType: item.deposit_type || '商品代金'
                                  });
                                }}
                                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                              >
                                編集
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 発送タブ */}
        {activeTab === 'shipping' && (
          <>
            {/* 発送登録ボックス */}
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 font-sans text-left">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900">発送登録</h2>
              <form onSubmit={handleCreateShippingContainer} className="space-y-4 text-black">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">管理番号</label>
                    <input
                      type="text"
                      placeholder="例: C001"
                      value={shippingContainerForm.containerCode}
                      onChange={(e) => setShippingContainerForm({ ...shippingContainerForm, containerCode: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border font-semibold"
                      required
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">発送日</label>
                    <input
                      type="date"
                      value={shippingContainerForm.shippedAt}
                      onChange={(e) => setShippingContainerForm({ ...shippingContainerForm, shippedAt: e.target.value })}
                      className="w-full h-12 block min-w-0 max-w-full box-border border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                      style={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        display: 'block',
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        padding: '0 10px',
                        lineHeight: '46px'
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">到着予定日</label>
                    <input
                      type="date"
                      value={shippingContainerForm.estimatedArrivalDate}
                      onChange={(e) => setShippingContainerForm({ ...shippingContainerForm, estimatedArrivalDate: e.target.value })}
                      className="w-full h-12 block min-w-0 max-w-full box-border border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                      style={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        display: 'block',
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        padding: '0 10px',
                        lineHeight: '46px'
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">配送業者</label>
                    <input
                      type="text"
                      placeholder="例: MSC"
                      value={shippingContainerForm.carrier}
                      onChange={(e) => setShippingContainerForm({ ...shippingContainerForm, carrier: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">追跡番号</label>
                    <input
                      type="text"
                      placeholder="例: MEDU4570792"
                      value={shippingContainerForm.trackingNumber}
                      onChange={(e) => setShippingContainerForm({ ...shippingContainerForm, trackingNumber: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                    />
                  </div>
                  <div className="min-w-0 col-span-1 sm:col-span-2 md:col-span-3">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">追跡URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={shippingContainerForm.trackingUrl}
                      onChange={(e) => setShippingContainerForm({ ...shippingContainerForm, trackingUrl: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="w-full sm:w-auto h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    登録する
                  </button>
                </div>
              </form>
            </div>

            {/* 上部ヘッダー（フィルター等）の個別カード化 */}
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">発送管理</h2>

              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">ID:</span>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">すべてのID</option>
                    <option value="B001">B001 FFGN</option>
                    {getCustomerIdList().filter(id => id !== 'B001').map(id => {
                      const firstMatch = purchasedItems.find(item => item.customerId === id);
                      const name = firstMatch ? (firstMatch.customerFullName || firstMatch.customerName) : '';
                      return (
                        <option key={id} value={id}>
                          {id} {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">期間:</span>
                  <div className="flex gap-2 w-full">
                    <select
                      value={purchasedYear}
                      onChange={(e) => setPurchasedYear(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">すべての年</option>
                      <option value="2026">2026年</option>
                      <option value="2027">2027年</option>
                      <option value="2028">2028年</option>
                      <option value="2029">2029年</option>
                      <option value="2030">2030年</option>
                    </select>
                    <select
                      value={purchasedMonth}
                      onChange={(e) => setPurchasedMonth(e.target.value)}
                      className="w-1/2 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                    >
                      <option value="all">すべての月</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString()}>{m}月</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-semibold text-gray-600">発送ステータス:</span>
                  <select
                    value={shippingStatusFilter}
                    onChange={(e) => setShippingStatusFilter(e.target.value)}
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border"
                  >
                    <option value="all">すべてのステータス</option>
                    <option value="not_shipped">未発送</option>
                    <option value="arrived_jp">日本倉庫到着</option>
                    <option value="in_transit">輸送中</option>
                    <option value="arrived_local">現地到着</option>
                    <option value="ready_for_delivery">引渡可能</option>
                    <option value="delivered">引渡完了</option>
                  </select>
                </div>
              </div>
            </div>

            {purchasedItems.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <p className="text-gray-500 text-lg">発送対象の商品がありません</p>
              </div>
            ) : getFilteredPurchasedItems().length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center font-sans">
                <p className="text-gray-500 text-lg">条件に一致する発送対象の商品がありません</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {getFilteredPurchasedItems()
                    .sort((a, b) => new Date(b.confirmedAt || '').getTime() - new Date(a.confirmedAt || '').getTime())
                    .map((item) => {
                      const cost = item.finalPrice || (item.customerCounterOffer && !item.customerCounterOfferUsed
                        ? item.customerCounterOffer
                        : (item.counterOffer || item.maxBid || 0));
                      const totalSalePrice = Math.round(cost || 0);
                      const brlRate = exchangeRates['BRL'] || 5.6;
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const paidBrazilBrl = Math.ceil(((totalSalePrice * 0.5) * brlRate) / 10) * 10;
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const paidParaguayUsd = Math.round(totalSalePrice * 0.5);
                      const japanSendAmount = item.japan_send_usd ?? calculateJapanSendAmount(item, totalSalePrice, exchangeRates['JPY'] || exchangeRate || 150);

                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const formatBrl = (amount: number) => {
                        const rounded = Math.round(amount);
                        return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                      };

                      return (
                        <div key={item.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4 text-black">
                          <div className="flex gap-4 mb-2">
                            <div className="relative w-32 h-32 flex-shrink-0">
                              {item.productImage ? (
                                <Image
                                  src={item.productImage}
                                  alt={item.productTitle}
                                  fill
                                  className="object-cover rounded"
                                  sizes="128px"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center border border-gray-200 text-center p-2 text-black font-sans">
                                  <span className="text-xs font-semibold text-gray-500 font-sans">
                                    写真なし
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                              {/* 1. 商品タイトル */}
                              <h3 className="text-xs font-semibold line-clamp-2 leading-tight h-[30px] overflow-hidden">{item.productTitle}</h3>

                              {/* 2. 在庫番号表示ボックス (h-7) */}
                              <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center justify-between w-full box-border">
                                <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis mr-2">
                                  <span className="text-gray-500 text-xs font-medium mr-1">在庫番号:</span>
                                  <span className="font-semibold text-gray-900 text-xs truncate">
                                    {item.stockNumber || '-'}
                                  </span>
                                </div>
                              </div>

                              {/* 3. 請求書番号表示ボックス (h-7) */}
                              <div className="h-7 px-2 bg-gray-50 border border-gray-100 rounded flex items-center justify-between w-full box-border">
                                <div className="min-w-0 flex items-center overflow-hidden whitespace-nowrap text-ellipsis mr-2">
                                  <span className="text-gray-500 text-xs font-medium mr-1">請求書番号:</span>
                                  <span className="font-semibold text-gray-900 text-xs truncate">
                                    {item.invoiceNumber || '-'}
                                  </span>
                                </div>
                              </div>

                              {/* 4. ヤフオクURLボタン (h-7) */}
                              <div className="w-full">
                                {item.productUrl ? (
                                  <a
                                    href={item.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`text-center text-xs text-white hover:underline hover:opacity-90 font-bold h-7 rounded px-2 flex items-center justify-center w-full box-border font-sans ${
                                      item.productId?.startsWith('m-') ? 'bg-blue-600' : 'bg-[#ff0033]'
                                    }`}
                                  >
                                    {item.productId?.startsWith('m-') ? 'URL' : 'ヤフオクURL'}
                                  </a>
                                ) : (
                                  <div className="text-center text-xs text-gray-400 font-bold h-7 bg-gray-100 border border-gray-200 rounded px-2 flex items-center justify-center w-full box-border select-none font-sans">
                                    URLなし
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 申請内容ボックス（h-24） */}
                          <div className="h-24 px-3 py-0 bg-gray-50 border border-gray-100 rounded-lg text-xs mb-2 box-border grid grid-rows-2 grid-cols-2">
                            <div className="flex flex-col justify-center h-12">
                              <span className="text-gray-500 text-[10px] leading-tight">ID:</span>
                              <span className="font-semibold truncate text-black leading-tight">{item.customerId}</span>
                            </div>
                            <div className="flex flex-col justify-center h-12">
                              <span className="text-gray-500 text-[10px] leading-tight">確認日時:</span>
                              <span className="font-semibold truncate text-black leading-tight">{formatDateTime(item.confirmedAt || '')}</span>
                            </div>
                            <div className="flex flex-col justify-center h-12">
                              <span className="text-gray-500 text-[10px] leading-tight">氏名:</span>
                              <span className="font-semibold truncate text-black leading-tight">{item.customerFullName || item.customerName}</span>
                            </div>
                            <div className="flex flex-col justify-center h-12">
                              <span className="text-gray-500 text-[10px] leading-tight">
                                {item.customerId?.startsWith('C') && item.agentCustomerId ? 'エージェント名:' : '顧客名:'}
                              </span>
                              <span className="font-semibold truncate text-black leading-tight">{item.customerName}</span>
                            </div>
                          </div>

                          {/* 支払情報 & 金額ボックス */}
                          <div className="space-y-2 mb-2 bg-gray-50 p-3 rounded-lg border border-gray-100 font-sans text-xs">
                            <div className="flex items-center justify-between font-sans text-xs">
                              <div className="flex items-center font-semibold text-gray-700">
                                <span>顧客支払額:</span>
                                <div className="flex flex-col gap-0.5 ml-1.5">
                                  {item.paid && item.paidAt && (
                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[9px] rounded whitespace-nowrap font-bold font-sans">
                                      ✓ 支払済 ({formatDateTime(item.paidAt)})
                                    </span>
                                  )}
                                  {item.cancelledAt && (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] rounded whitespace-nowrap font-bold font-sans">
                                      ✗ 取消済 ({formatDateTime(item.cancelledAt)})
                                    </span>
                                  )}
                                  {!item.paid && !item.cancelledAt && (
                                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] rounded whitespace-nowrap font-medium font-sans">
                                      未入金
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-base font-bold whitespace-nowrap ${item.cancelledAt || item.paid ? 'text-gray-400 line-through' : 'text-emerald-600'}`}>
                                $ {totalSalePrice.toLocaleString('en-US')}
                              </span>
                            </div>

                            {/* 日本支払額 (ブラジルエージェント or B001用) */}
                            {(item.agentCustomerId === 'B001' || (item.customerId?.startsWith('A') && ((item.customerCountry || '').toLowerCase().trim() === 'brasil' || (item.customerCountry || '').toLowerCase().trim() === 'brazil'))) && (
                              <div className="flex items-center justify-between font-sans text-xs border-t border-gray-200/50 pt-2">
                                <div className="flex items-center font-semibold text-gray-700">
                                  <span className="text-red-600 font-black">日本支払額:</span>
                                  {item.paid_japan && item.paid_japan_at && (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-bold font-sans">
                                      ✓ 支払済 ({formatDateTime(item.paid_japan_at)})
                                    </span>
                                  )}
                                  {!item.paid_japan && (
                                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium font-sans">
                                      未入金
                                    </span>
                                  )}
                                </div>
                                <span className={`text-base font-bold ${item.paid_japan ? 'text-red-400 line-through' : 'text-red-600'}`}>
                                  $ {Math.round(japanSendAmount).toLocaleString('en-US')}
                                </span>
                              </div>
                            )}

                            {/* 現地費用 */}
                            {item.delivery_location !== 'JP' && (
                              <div className="flex items-center justify-between font-sans text-xs border-t border-gray-200/50 pt-2">
                                <div className="flex items-center font-semibold text-gray-700">
                                  <span className="text-gray-500">現地費用:</span>
                                  {item.paid_local && item.paid_local_at && (
                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium font-sans">
                                      ✓ 支払済 ({formatDateTime(item.paid_local_at)})
                                    </span>
                                  )}
                                  {!item.paid_local && (
                                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] rounded ml-1.5 whitespace-nowrap font-medium font-sans">
                                      未入金
                                    </span>
                                  )}
                                </div>
                                <span className={`text-base font-bold ${item.paid_local ? 'text-gray-400 line-through' : (typeof calculateLocalCost(item.delivery_location, item, item.shipping_method) === 'string' ? 'text-red-600' : 'text-black')}`}>
                                  {formatLocalCost(calculateLocalCost(item.delivery_location, item, item.shipping_method), 'USD')}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* 商品渡し場所 */}
                          <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                            <span className="text-gray-500 font-medium">引渡場所:</span>
                            <span className="font-semibold text-black">{getDeliveryLocationName(item.delivery_location, item.delivery_city)}</span>
                          </div>

                          {/* 引渡場所が日本の場合はこの下に発送ステータスを配置 */}
                          {item.delivery_location === 'JP' && renderShippingForm(item)}

                          {/* 発送方法 */}
                          {item.delivery_location !== 'JP' && (
                            <>
                              <div className="mb-2 h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between font-sans text-xs">
                                <span className="text-gray-500 font-medium">発送方法:</span>
                                <span className="font-semibold text-black">
                                  {item.shipping_method === 'air' ? '航空便 ✈️' : 'コンテナ 🚢'}
                                </span>
                              </div>
                              {/* 引渡場所が日本以外の場合はこの下に発送ステータスを配置 */}
                              {renderShippingForm(item)}
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {selectedRequest && actionType === 'reject' && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setSelectedRequest(null);
            setActionType(null);
            setRejectReason('');
          }}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-4">リクエストを却下</h2>
            <p className="text-gray-600 mb-4">{selectedRequest.productTitle}</p>

            <textarea
              placeholder="却下理由（任意）..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setActionType(null);
                  setRejectReason('');
                }}
                className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
              >
                キャンセル
              </button>
              <button
                onClick={handleReject}
                className="flex-1 bg-red-600 text-white h-12 rounded-lg font-semibold hover:bg-red-700 transition flex items-center justify-center"
              >
                却下
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRequest && actionType === 'counter' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">カウンターオファー</h2>
            <p className="text-gray-600 mb-2 font-semibold">{selectedRequest.productTitle}</p>
            
            {/* 顧客オファー金額のh-12ボックス化 */}
            <div className="h-12 px-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500 font-medium">顧客のオファー:</span>
              <span className="text-base font-bold text-indigo-600">
                $ {Math.round(selectedRequest.customerCounterOffer || selectedRequest.maxBid || 0).toLocaleString('en-US')}
              </span>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm mb-3 items-center">
                <span className="text-gray-600">現在価格:</span>
                <span className="text-base font-bold text-black">¥{selectedRequest.productPrice?.toLocaleString() || 'N/A'}</span>
              </div>

              {/* 送料入力（h-12） */}
              <div className="flex justify-between items-center text-sm mb-3">
                <span className="text-gray-600">送料:</span>
                <input
                  type="text"
                  placeholder="0"
                  value={shippingCostJpy}
                  onChange={(e) => setShippingCostJpy(formatCommaSeparatedNumber(e.target.value))}
                  className="w-32 h-12 border border-gray-300 rounded px-3 py-0 text-base text-right box-border focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black font-bold"
                />
              </div>

              {/* FOB費用入力（h-12化） */}
              <div className="flex justify-between items-center text-sm mb-3">
                <span className="text-gray-600">FOB費用:</span>
                <input
                  type="text"
                  placeholder="1,500"
                  value={fobCostJpy}
                  onChange={(e) => setFobCostJpy(formatCommaSeparatedNumber(e.target.value))}
                  className="w-32 h-12 border border-gray-300 rounded px-3 py-0 text-base text-right box-border focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black font-bold"
                />
              </div>

              {/* 合計 (JPY) の動的計算表示 */}
              <div className="flex justify-between text-sm mb-2 pt-2 border-t items-center">
                <span className="text-gray-600 font-semibold">合計（JPY）:</span>
                <span className="font-bold text-black text-base">
                  ¥{((selectedRequest.productPrice || 0) + parseFloat(shippingCostJpy.replace(/,/g, '') || '0') + parseFloat(fobCostJpy.replace(/,/g, '') || '0')).toLocaleString()}
                </span>
              </div>

              {/* 利益 (JPY) の追加 */}
              {(() => {
                const fob = parseFloat(fobCostJpy.replace(/,/g, '') || '0');
                const shipping = parseFloat(shippingCostJpy.replace(/,/g, '') || '0');
                const totalJpy = (selectedRequest.productPrice || 0) + shipping + fob;
                let profitDivisor = 0.6; // デフォルト: 一般顧客 (利益率40%＝除数0.6)
                if (selectedRequest.customerId === 'B001') {
                  profitDivisor = 0.9;
                } else if (selectedRequest.agentCustomerId === 'B001') {
                  profitDivisor = 0.5; // B001紐づき (利益率50%＝除数0.5)
                } else if (selectedRequest.customerId?.startsWith('A')) {
                  const countryLower = (selectedRequest.customerCountry || '').trim().toLowerCase();
                  if (countryLower === 'brasil' || countryLower === 'brazil') {
                    profitDivisor = 0.7; // ブラジルエージェント (利益率30%＝除数0.7)
                  } else {
                    profitDivisor = 0.8; // 通常エージェント (利益率20%＝除数0.8)
                  }
                }
                const priceWithProfit = totalJpy / profitDivisor;
                const profitJpy = priceWithProfit - totalJpy;

                return (
                  <div className="flex justify-between text-sm mb-2 text-emerald-600 font-semibold items-center">
                    <span>利益（JPY）:</span>
                    <span className="font-bold text-emerald-600 text-base">¥{Math.round(profitJpy).toLocaleString()}</span>
                  </div>
                );
              })()}

              {/* カウンターオファー金額 (USD) の表示 */}
              <div className="flex justify-between pt-2 border-t items-center">
                <span className="text-gray-600 font-semibold text-sm">カウンターオファー金額:</span>
                <span className="text-xl font-bold text-blue-600">
                  ${(() => {
                    const fob = parseFloat(fobCostJpy.replace(/,/g, '') || '0');
                    const shipping = parseFloat(shippingCostJpy.replace(/,/g, '') || '0');
                    const totalJpy = (selectedRequest.productPrice || 0) + shipping + fob;
                    let profitDivisor = 0.6; // デフォルト: 一般顧客 (利益率40%＝除数0.6)
                    if (selectedRequest.customerId === 'B001') {
                      profitDivisor = 0.9;
                    } else if (selectedRequest.agentCustomerId === 'B001') {
                      profitDivisor = 0.5; // B001紐づき (利益率50%＝除数0.5)
                    } else if (selectedRequest.customerId?.startsWith('A')) {
                      const countryLower = (selectedRequest.customerCountry || '').trim().toLowerCase();
                      if (countryLower === 'brasil' || countryLower === 'brazil') {
                        profitDivisor = 0.7; // ブラジルエージェント (利益率30%＝除数0.7)
                      } else {
                        profitDivisor = 0.8; // 通常エージェント (利益率20%＝除数0.8)
                      }
                    }
                    const priceWithProfit = totalJpy / profitDivisor;
                    const usdPrice = priceWithProfit / exchangeRate;
                    const roundedUsd = Math.ceil(usdPrice / 10) * 10;
                    return roundedUsd.toLocaleString('en-US');
                  })()}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setActionType(null);
                  setShippingCostJpy('');
                  setFobCostJpy('1,500');
                }}
                className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
              >
                キャンセル
              </button>
              <button
                onClick={handleCounterOffer}
                className="flex-1 bg-blue-600 text-white h-12 rounded-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRequest && actionType === 'won' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-indigo-600">落札金額の確定</h2>
            <p className="text-gray-600 mb-2 font-semibold">{selectedRequest.productTitle}</p>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 font-semibold">確定落札金額 (USD):</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    value={finalPriceInput}
                    onChange={(e) => setFinalPriceInput(e.target.value)}
                    className="w-36 h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-bold text-indigo-600 text-right focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 font-semibold">落札金額 (JPY):</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">¥</span>
                  <input
                    type="number"
                    value={wonPriceJpyInput}
                    onChange={(e) => setWonPriceJpyInput(e.target.value)}
                    className="w-36 h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-bold text-gray-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 font-semibold">送料 (JPY):</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">¥</span>
                  <input
                    type="number"
                    value={wonShippingJpyInput}
                    onChange={(e) => setWonShippingJpyInput(e.target.value)}
                    className="w-36 h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-bold text-gray-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 font-semibold">FOB費用 (JPY):</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">¥</span>
                  <input
                    type="number"
                    value={wonFobJpyInput}
                    onChange={(e) => setWonFobJpyInput(e.target.value)}
                    className="w-36 h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-bold text-gray-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                <span className="text-sm text-indigo-900 font-bold">落札合計金額 (JPY):</span>
                <span className="text-lg font-black text-indigo-700">
                  ¥ {((parseFloat(wonPriceJpyInput) || 0) + (parseFloat(wonShippingJpyInput) || 0) + (parseFloat(wonFobJpyInput) || 0)).toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 text-right italic leading-relaxed">
                ※入力された日本円金額は、B001紐づき顧客やブラジルエージェントの正確な日本支払額の計算に利用されます。
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setActionType(null);
                  setFinalPriceInput('');
                  setTotalJpyInput('');
                  setWonPriceJpyInput('');
                  setWonShippingJpyInput('');
                  setWonFobJpyInput('');
                }}
                className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (selectedRequest) {
                    const price = parseFloat(finalPriceInput);
                    const totalJpy = (parseFloat(wonPriceJpyInput) || 0) + (parseFloat(wonShippingJpyInput) || 0) + (parseFloat(wonFobJpyInput) || 0);
                    if (isNaN(price)) {
                      alert('有効な金額を入力してください');
                      return;
                    }
                    const japanSendAmount = calculateJapanSendAmount({ ...selectedRequest, total_jpy: totalJpy }, price, exchangeRates['JPY'] || exchangeRate || 150);
                    updateFinalStatus(selectedRequest.id, 'won', price, totalJpy, Math.round(japanSendAmount));
                  }
                }}
                className="flex-1 bg-green-600 text-white h-12 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center"
              >
                落札を確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ユーザー編集モーダル */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl border border-gray-100 font-sans" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-indigo-600">ユーザー情報の編集</h2>
            <p className="text-gray-600 mb-1 font-semibold">{editingUser.fullName}</p>
            <p className="text-sm text-gray-500 mb-4">{editingUser.customerId} ({editingUser.role === 'customer' ? '顧客' : 'エージェント'})</p>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">保証金設定 (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    value={editForm.depositAmount}
                    onChange={(e) => setEditForm({ ...editForm, depositAmount: Number(e.target.value) })}
                    className="w-full h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white text-black"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="depositConfirmed"
                  checked={editForm.depositConfirmed}
                  onChange={(e) => setEditForm({ ...editForm, depositConfirmed: e.target.checked })}
                  className="w-5 h-5 cursor-pointer text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="depositConfirmed" className="text-sm font-semibold text-gray-700 cursor-pointer">
                  保証金の入金を確認済み
                </label>
              </div>

              {editingUser.role === 'customer' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">担当エージェントID (任意)</label>
                  <input
                    type="text"
                    value={editForm.agentCustomerId}
                    onChange={(e) => setEditForm({ ...editForm, agentCustomerId: e.target.value })}
                    placeholder="A001 など"
                    className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white text-black"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    ※エージェントID（Aから始まるID）を入力すると、顧客とエージェントが紐づきます
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 在庫番号編集モーダル */}
      {editingStockItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl border border-gray-100 font-sans" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-indigo-600">在庫番号の編集</h2>
            <p className="text-gray-600 mb-4 font-semibold">{editingStockItem.title}</p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await updateStockNumber(editingStockItem.id, editingStockItem.stockNumber);
              setEditingStockItem(null);
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">在庫番号</label>
                <input
                  type="text"
                  value={editingStockItem.stockNumber}
                  onChange={(e) => setEditingStockItem({ ...editingStockItem, stockNumber: e.target.value })}
                  placeholder="例: C001S001"
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white text-black"
                  autoFocus
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  ※空にすると自動生成（落札時に自動付与される形式）に戻るか、クリアされます
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingStockItem(null)}
                  className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 請求書番号編集モーダル */}
      {editingInvoiceItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl border border-gray-100 font-sans" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-indigo-600">請求書番号の編集</h2>
            <p className="text-gray-600 mb-4 font-semibold text-black">{editingInvoiceItem.title}</p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await updateInvoiceNumber(editingInvoiceItem.id, editingInvoiceItem.invoiceNumber);
              setEditingInvoiceItem(null);
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">請求書番号</label>
                <input
                  type="text"
                  value={editingInvoiceItem.invoiceNumber}
                  onChange={(e) => setEditingInvoiceItem({ ...editingInvoiceItem, invoiceNumber: e.target.value })}
                  placeholder="例: INV-12345"
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none box-border bg-white text-black"
                  autoFocus
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  ※空にするとクリアされます
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingInvoiceItem(null)}
                  className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 入金編集モーダル */}
      {editingDeposit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl border border-gray-100 font-sans" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-indigo-600">入金履歴の編集</h2>
            <p className="text-gray-600 mb-1 font-semibold text-black">
              顧客ID: {editingDeposit.customer_id}
            </p>
            
            <form onSubmit={handleUpdateDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">入金確認日</label>
                <input
                  type="date"
                  value={editDepositForm.depositDate}
                  onChange={(e) => setEditDepositForm({ ...editDepositForm, depositDate: e.target.value })}
                  className="w-full h-12 block min-w-0 max-w-full box-border border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: '0 10px',
                    lineHeight: '46px'
                  }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {isB001LinkedOrBrasilForEdit ? '通貨 / 入金額' : '入金額 (USD)'}
                </label>
                {isB001LinkedOrBrasilForEdit ? (
                  <div className="flex gap-2">
                    <select
                      value={editDepositForm.currency}
                      onChange={(e) => {
                        const newCurrency = e.target.value;
                        const defaultMethod = newCurrency === 'BRL' ? 'pix' : 'bank';
                        setEditDepositForm({ 
                          ...editDepositForm, 
                          currency: newCurrency,
                          paymentMethod: defaultMethod
                        });
                      }}
                      className="w-1/3 h-12 border border-gray-300 rounded-lg px-3 py-0 text-base bg-white text-black box-border focus:ring-2 focus:ring-indigo-500 outline-none"
                      style={{ textAlign: 'center', textAlignLast: 'center' }}
                    >
                      <option value="USD">USD</option>
                      <option value="BRL">BRL</option>
                    </select>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                        {editDepositForm.currency === 'BRL' ? 'R$' : '$'}
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={editDepositForm.amount}
                        onChange={(e) => setEditDepositForm({ ...editDepositForm, amount: e.target.value })}
                        className="w-full h-12 border border-gray-300 rounded-lg pl-8 pr-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-black box-border"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      step="any"
                      value={editDepositForm.amount}
                      onChange={(e) => setEditDepositForm({ ...editDepositForm, amount: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-black bg-white box-border"
                      required
                    />
                  </div>
                )}
              </div>

              {isB001LinkedOrBrasilForEdit && editDepositForm.currency === 'BRL' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">USD 換算</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={editDepositForm.usdAmount}
                      onChange={(e) => setEditDepositForm({ ...editDepositForm, usdAmount: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-black box-border"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">内容</label>
                <select
                  value={editDepositForm.depositType}
                  onChange={(e) => setEditDepositForm({ ...editDepositForm, depositType: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                  required
                >
                  <option value="商品代金">商品代金</option>
                  <option value="現地費用">現地費用</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">入金方法</label>
                <select
                  value={editDepositForm.paymentMethod}
                  onChange={(e) => setEditDepositForm({ ...editDepositForm, paymentMethod: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                  required
                >
                  {(() => {
                    if (isB001LinkedOrBrasilForEdit) {
                      if (editDepositForm.currency === 'BRL') {
                        return (
                          <>
                            <option value="pix">PIX</option>
                            <option value="card">カード</option>
                            <option value="cash">現金</option>
                            <option value="bank">銀行</option>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <option value="bank">銀行</option>
                            <option value="paypal">PayPal</option>
                            <option value="usdt">USDT</option>
                            <option value="card">カード</option>
                            <option value="cash">現金</option>
                          </>
                        );
                      }
                    } else {
                      return (
                        <>
                          <option value="bank">銀行</option>
                          <option value="paypal">PayPal</option>
                          <option value="usdt">USDT</option>
                          <option value="cash">現金</option>
                        </>
                      );
                    }
                  })()}
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => handleDeleteDeposit(editingDeposit.id)}
                  className="bg-red-600 text-white h-12 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm flex items-center justify-center"
                >
                  削除
                </button>
                <div className="flex-1"></div>
                <button
                  type="button"
                  onClick={() => setEditingDeposit(null)}
                  className="border border-gray-300 text-gray-700 h-12 px-4 rounded-lg font-semibold hover:bg-gray-50 transition text-sm flex items-center justify-center"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 text-white h-12 px-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-sm flex items-center justify-center"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ヤフオク以外の購入商品手動追加モーダル */}
      {showManualAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl border border-gray-100 font-sans max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg sm:text-xl font-bold mb-4 text-indigo-600 truncate whitespace-nowrap">ヤフオク以外の購入商品を追加</h2>

            <form onSubmit={handleManualAddSubmit} className="space-y-4">
              {/* 商品画像 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">商品画像（任意）</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-500 transition relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setManualAddImage(file);
                        setManualAddImagePreview(URL.createObjectURL(file));
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {manualAddImagePreview ? (
                    <div className="relative w-full h-32">
                      <img
                        src={manualAddImagePreview}
                        alt="Preview"
                        className="w-full h-full object-contain rounded"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setManualAddImage(null);
                          setManualAddImagePreview(null);
                        }}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-xs w-6 h-6 flex items-center justify-center font-bold hover:bg-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="py-4">
                      <span className="text-gray-500 text-sm">ドラッグ＆ドロップまたはクリックして画像を選択</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 商品タイトル */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">商品タイトル</label>
                <input
                  type="text"
                  value={manualAddForm.productTitle}
                  onChange={(e) => setManualAddForm({ ...manualAddForm, productTitle: e.target.value })}
                  placeholder="商品名を入力してください"
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                  required
                />
              </div>

              {/* 商品URL */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">商品URL（任意）</label>
                <input
                  type="url"
                  value={manualAddForm.productUrl}
                  onChange={(e) => setManualAddForm({ ...manualAddForm, productUrl: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                />
              </div>

              {/* 顧客ID */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">顧客ID</label>
                <select
                  value={manualAddForm.customerId}
                  onChange={(e) => setManualAddForm({ ...manualAddForm, customerId: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                  required
                >
                  <option value="">顧客IDを選択してください</option>
                  {[
                    ...customersList.map(c => ({ id: c.customerId, name: c.fullName, role: 'customer', agentId: c.agentCustomerId })),
                    ...agentsList.map(a => ({ id: a.customerId, name: a.fullName, role: 'agent', agentId: null }))
                  ]
                    .filter(u => u.id)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.id} - {user.name}
                      </option>
                    ))
                  }
                </select>
              </div>

              {/* 購入日時 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">購入日時</label>
                <input
                  type="date"
                  value={manualAddForm.createdAt}
                  onChange={(e) => setManualAddForm({ ...manualAddForm, createdAt: e.target.value })}
                  className="w-full h-12 block min-w-0 max-w-full box-border border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: '0 10px',
                    lineHeight: '46px'
                  }}
                  required
                />
              </div>

              {/* 販売金額 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">販売金額</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    value={manualAddForm.finalPrice}
                    onChange={(e) => setManualAddForm({ ...manualAddForm, finalPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full h-12 border border-gray-300 rounded-lg pl-7 pr-3 py-0 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-black bg-white box-border"
                    required
                  />
                </div>
              </div>

              {/* 引渡場所 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">引渡場所</label>
                <select
                  value={manualAddForm.deliveryCountry}
                  onChange={(e) => {
                    const countryCode = e.target.value;
                    const country = deliveryLocations.find(c => c.code === countryCode);
                    const firstCityCode = country && country.cities.length > 0 ? country.cities[0].code : '';
                    setManualAddForm({
                      ...manualAddForm,
                      deliveryCountry: countryCode,
                      deliveryCity: firstCityCode
                    });
                  }}
                  className="w-full h-12 block border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black px-3"
                  required
                >
                  {deliveryLocations.map(country => (
                    <option key={country.code} value={country.code}>
                      {country.nameJa}
                    </option>
                  ))}
                </select>
              </div>

              {/* 都市（日本以外の場合） */}
              {manualAddForm.deliveryCountry !== 'JP' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">都市</label>
                    <select
                      value={manualAddForm.deliveryCity}
                      onChange={(e) => setManualAddForm({ ...manualAddForm, deliveryCity: e.target.value })}
                      className="w-full h-12 block border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black px-3"
                      required
                    >
                      {deliveryLocations.find(c => c.code === manualAddForm.deliveryCountry)?.cities.map(city => (
                        <option key={city.code} value={city.code}>
                          {city.nameJa}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 発送方法 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">発送方法</label>
                    <select
                      value={manualAddForm.shippingMethod}
                      onChange={(e) => setManualAddForm({ ...manualAddForm, shippingMethod: e.target.value })}
                      className="w-full h-12 block border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black px-3"
                      required
                    >
                      <option value="sea">船便 🚢</option>
                      <option value="air">航空便 ✈️</option>
                    </select>
                  </div>
                </>
              )}

              {/* ボタン */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualAddModal(false);
                    const today = new Date();
                    const offset = today.getTimezoneOffset();
                    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
                    const todayStr = localToday.toISOString().split('T')[0];
                    setManualAddForm({
                      productTitle: '',
                      productUrl: '',
                      customerId: '',
                      createdAt: todayStr,
                      finalPrice: '',
                      deliveryCountry: 'JP',
                      deliveryCity: '',
                      shippingMethod: 'sea',
                    });
                    setManualAddImage(null);
                    setManualAddImagePreview(null);
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 h-12 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center justify-center text-sm"
                  disabled={isSubmittingManualAdd}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white h-12 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center text-sm"
                  disabled={isSubmittingManualAdd}
                >
                  {isSubmittingManualAdd ? '登録中...' : '登録'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </main>

      {/* 通知一覧モーダル */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] sm:max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                通知履歴一覧
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
                  <p className="text-sm font-medium">新しい通知はありません</p>
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
                            if (n.title && n.title !== 'JOGALIBRE' && n.title !== 'Administrador' && n.title !== '管理画面') return n.title;
                            const b = n.body || n.message || '';
                            if (b.includes('新規')) return '📩 新規申請通知';
                            if (b.includes('オファー')) return '💬 オファー回答';
                            if (b.includes('Result Confirm') || b.includes('結果確認')) return '✅ 結果確認完了';
                            return '🔔 システム通知';
                          })()}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">
                          {new Date(n.created_at || '').toLocaleString('ja-JP', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 font-semibold truncate overflow-hidden text-ellipsis whitespace-nowrap block w-full">
                        {((n.body || n.message || '') as string).replace(/\n+/g, ' ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-white safe-area-bottom">
              <button
                onClick={clearAllNotifications}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-sm active:scale-[0.99]"
              >
                通知履歴をクリア
              </button>
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
              ログアウトの確認
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              管理画面からログアウトしますか？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors shadow-sm"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}