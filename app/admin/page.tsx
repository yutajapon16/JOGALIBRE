'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { signIn, signOut, getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/push-notifications';
import { formatDateTime, formatDateOnly, getTimeRemaining } from '@/lib/utils';
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
  const [selectedRequest, setSelectedRequest] = useState<BidRequest | null>(null);
  const [actionType, setActionType] = useState<'reject' | 'counter' | 'won' | null>(null);
  const [finalPriceInput, setFinalPriceInput] = useState('');
  const [exchangeRate, setExchangeRate] = useState(150);
  const [activeTab, setActiveTab] = useState<'requests' | 'purchased' | 'deposits' | 'shipping' | 'customers' | 'agents'>('requests');
  const [purchasedItems, setPurchasedItems] = useState<BidRequest[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    depositAmount: 0,
    depositConfirmed: false,
    agentCustomerId: ''
  });
  const [editingStockItem, setEditingStockItem] = useState<{ id: string; title: string; stockNumber: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null); // ヤフオク同期中のリクエストID

  // 入金管理用のステート
  const [depositsList, setDepositsList] = useState<any[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [depositForm, setDepositForm] = useState({
    customerId: '',
    depositDate: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'bank'
  });
  const [editingDeposit, setEditingDeposit] = useState<any | null>(null);
  const [editDepositForm, setEditDepositForm] = useState({
    depositDate: '',
    amount: '',
    paymentMethod: 'bank'
  });
  const [depositFilterCustomer, setDepositFilterCustomer] = useState<string>('all');
  const [depositFilterYear, setDepositFilterYear] = useState<string>('all');
  const [depositFilterMonth, setDepositFilterMonth] = useState<string>('all');

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
      
      const res = await fetch('/api/admin/users', {
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
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
          paymentMethod: depositForm.paymentMethod
        })
      });

      if (res.ok) {
        alert('入金情報を登録しました');
        setDepositForm({
          ...depositForm,
          customerId: '',
          amount: ''
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

  const handleUpdateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeposit) return;

    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

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
          paymentMethod: editDepositForm.paymentMethod
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
      filtered = filtered.filter(item => item.customer_id === depositFilterCustomer);
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

    const headers = ['入金確認日', '顧客ID', '氏名', '入金額(USD)', '支払方法'];

    const customerMap = new Map<string, string>();
    customersList.forEach(c => customerMap.set(c.customerId, c.fullName || c.customerName || ''));
    agentsList.forEach(a => customerMap.set(a.customerId, a.fullName || a.customerName || ''));

    const paymentMethodNames: Record<string, string> = {
      bank: '銀行',
      paypal: 'PayPal',
      usdt: 'USDT'
    };

    const rows = items.map(item => {
      const name = customerMap.get(item.customer_id) || '';
      return [
        item.deposit_date.replace(/-/g, '/'),
        item.customer_id,
        `"${name.replace(/"/g, '""')}"`,
        item.amount,
        paymentMethodNames[item.payment_method] || item.payment_method
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
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'loading' | 'enabled' | 'disabled' | 'unsupported'>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);


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
      }
    });

    // セッション変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
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
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // データ取得（ログイン後のみ実行）
  // データ取得（ログイン後のみ実行）
  useEffect(() => {
    if (currentUser) {
      if (activeTab === 'requests') {
        fetchBidRequests();
      } else if (activeTab === 'purchased') {
        fetchPurchasedItems();
      } else if (activeTab === 'deposits') {
        fetchDeposits();
        fetchUsersData();
      } else {
        fetchUsersData();
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
  }, [currentUser, activeTab]);

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
          // サーバー側の登録状況を確認し、自動再登録
          (async () => {
            try {
              const subscription = await requestNotificationPermission();
              if (subscription) {
                await fetch('/api/push-subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: currentUser.id, subscription }),
                });
                setNotificationStatus('enabled');
              } else {
                setNotificationStatus('disabled');
              }
            } catch {
              setNotificationStatus('disabled');
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
    await signOut();
    window.location.href = '/admin';
  };

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
          userType: 'admin'
        })
      });
      const data = await res.json();

      if (data.outsideWindow && data.outsideWindowCount > 0) {
        // 24時間ウィンドウ外エラーがある場合
        const sent = data.notificationsSent || 0;
        const failed = data.outsideWindowCount || 0;
        alert(`⚠️ WhatsApp通知: ${sent}件成功 / ${failed}件失敗\n\n一部の顧客がSandboxの24時間ウィンドウ外です。\n\n対象の顧客に以下を依頼してください：\n1. WhatsAppで +1 415 523 8886 にメッセージを送信\n2. Sandboxの参加コードを送信\n3. その後、再度通知を試してください`);
      } else if (data.success && data.notificationsSent > 0) {
        alert(`✅ WhatsApp通知を${data.notificationsSent}件送信しました`);
      } else if (data.success && data.notificationsSent === 0) {
        alert('⚠️ 通知対象がないか、送信に失敗しました。顧客がSandboxに再参加する必要があるかもしれません。');
      } else {
        alert(data.message || 'エラーが発生しました');
      }
    } catch (error) {
      console.error('Notification error:', error);
      alert('通知の送信に失敗しました');
    } finally {
      setIsSendingNotification(false);
    }
  };

  const getFilteredPurchasedItems = () => {
    let filtered = purchasedItems;

    // 顧客IDでフィルタリング
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(item => item.customerId === selectedCustomer);
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
        customerRole: req.customer_role
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
        stockNumber: item.stock_number as string,
        customerId: item.customer_id as string
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

  const getCustomerTotalById = (customerId: string) => {
    return purchasedItems
      .filter(item => item.customerId === customerId)
      .reduce((sum, item) => sum + (item.finalPrice || 0), 0);
  };

  const updateStatus = async (id: string, status: string, reason?: string, counterOfferAmount?: number, shippingJpy?: number) => {
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
          shippingCostJpy: shippingJpy
        })
      });

      if (res.ok) {
        fetchBidRequests();
        setSelectedRequest(null);
        setActionType(null);
        setRejectReason('');
        setShippingCostJpy('');

        // プッシュ通知を送信（対象顧客のリクエストを特定）
        const targetRequest = bidRequests.find(r => r.id === id);
        if (targetRequest?.customerEmail) {
          const statusMessages: Record<string, string> = {
            approved: 'Solicitud aprobada / Solicitação aprovada',
            rejected: 'Solicitud rechazada / Solicitação rejeitada',
            counter_offer: 'Tienes contraoferta / Você tem contraoferta',
          };
          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: targetRequest.customerEmail,
              title: 'Administrador',
              body: statusMessages[status] || 'Estado actualizado / Estado atualizado',
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

  const updateFinalStatus = async (id: string, finalStatus: string, finalPrice?: number) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, finalStatus, finalPrice })
      });

      if (res.ok) {
        fetchBidRequests();
        setSelectedRequest(null);
        setActionType(null);
        setFinalPriceInput('');

        // プッシュ通知を送信（対象顧客のリクエストを特定）
        const targetRequest = bidRequests.find(r => r.id === id);
        if (targetRequest?.customerEmail) {
          const statusMessages: Record<string, string> = {
            won: 'Ganado / Ganhado',
            lost: 'Perdido / Perdido',
          };
          fetch('/api/push-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: targetRequest.customerEmail,
              title: 'Administrador',
              body: statusMessages[finalStatus] || 'Resultado actualizado / Resultado atualizado',
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

  const handleUpdateStockNumber = (id: string, title: string, currentStockNumber: string) => {
    setEditingStockItem({ id, title, stockNumber: currentStockNumber || '' });
  };

  const handleReject = () => {
    if (selectedRequest) {
      updateStatus(selectedRequest.id, 'rejected', rejectReason.trim());
    }
  };

  const handleCounterOffer = () => {
    if (selectedRequest) {
      const FOB_COST = 1500;
      const shipping = shippingCostJpy.trim() ? parseFloat(shippingCostJpy) : 0;

      const totalJpy = (selectedRequest.productPrice || 0) + shipping + FOB_COST;
      // エージェント(A始まり)は利益率20%、顧客(C始まり)は利益率40%
      const profitDivisor = selectedRequest.customerId?.startsWith('A') ? 0.8 : 0.6;
      const priceWithProfit = totalJpy / profitDivisor;
      const usdPrice = priceWithProfit / exchangeRate;
      const roundedUsd = Math.ceil(usdPrice / 10) * 10;

      updateStatus(selectedRequest.id, 'counter_offer', undefined, roundedUsd, shipping);
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
    const headers = ['日付', '顧客名', '氏名', 'メール', 'WhatsApp', '商品名', '確定金額(USD)', '支払い状態', '商品URL'];

    // CSVデータ行
    const rows = items.map(item => [
      formatDateTime(item.confirmedAt || ''),
      item.customerName,
      item.customerFullName || '',
      item.customerEmail,
      item.customerWhatsapp || '',
      `"${(item.productTitle || '').replace(/"/g, '""')}"`,
      item.finalPrice ? Math.round(item.finalPrice) : '',
      item.paid ? '支払い済み' : '未払い',
      item.productUrl || ''
    ]);

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
      rejected: '却下済',
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


  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-black">管理者ログイン</h1>
            <Image src="/icons/admin-icon.png" alt="管理画面" width={40} height={40} className="rounded" />
          </div>
          <p className="text-gray-600 mb-6">JOGALIBRE 管理画面</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">メールアドレス</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">パスワード</label>
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
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">読み込み中...</div>
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

      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">管理画面</h1>
              <Image src="/icons/admin-icon.png" alt="管理画面" width={40} height={40} className="w-8 h-8 sm:w-10 sm:h-10 rounded" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 font-semibold"
              >
                ログアウト
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-sm sm:text-base text-gray-600">
              保留中: <span className="font-bold text-indigo-600">
                {bidRequests.filter(req => req.status === 'pending').length}
              </span>
              {' '}
              合計: <span className="font-bold">{bidRequests.length}件</span>
            </div>

            {/* WhatsApp + プッシュ通知ボタン（半幅ずつ） */}
            <div className="flex gap-2">
              <a
                href="whatsapp://"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-[#25D366] text-white px-4 py-3 rounded-lg hover:bg-[#128C7E] transition text-sm sm:text-base flex items-center justify-center gap-2"
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
                className={`flex-1 px-4 py-3 rounded-lg transition text-sm sm:text-base ${notificationStatus === 'enabled'
                  ? 'bg-gray-500 text-white hover:bg-gray-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
              >
                {notificationStatus === 'enabled' ? '🔕 通知停止' : '🔔 通知受取'}
              </button>
            </div>

            <button
              onClick={() => {
                if (activeTab === 'requests') fetchBidRequests();
                else if (activeTab === 'purchased') fetchPurchasedItems();
                else if (activeTab === 'deposits') { fetchDeposits(); fetchUsersData(); }
                else fetchUsersData();
              }}
              className="bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base w-full"
            >
              🔁 更新
            </button>

            <div className="text-xs sm:text-sm text-gray-600">
              為替レート: <span className="font-semibold">USD 1 = JPY {exchangeRate.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* タブナビゲーション */}
      <nav className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex">
            {[
              { key: 'requests' as const, label: '申請', icon: '📋' },
              { key: 'purchased' as const, label: '購入', icon: '🛒' },
              { key: 'deposits' as const, label: '入金', icon: '💵' },
              { key: 'shipping' as const, label: '発送', icon: '📦' },
              { key: 'customers' as const, label: '顧客', icon: '👥' },
              { key: 'agents' as const, label: 'AGT', icon: '👔' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                }}
                className={`flex-1 py-3 text-center text-xs sm:text-base font-medium border-b-2 transition ${activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <span className="block text-lg">{tab.icon}</span>
                {tab.label}
               </button>
             ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* リクエストタブ */}
        {activeTab === 'requests' && (
          bidRequests.length === 0 ? (
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

                  const isEndedA = timeA <= now;
                  const isEndedB = timeB <= now;

                  // 1. 終了済みを優先的に上に表示
                  if (isEndedA && !isEndedB) return -1;
                  if (!isEndedA && isEndedB) return 1;

                  // 2. 両方が「終了済み」または「未終了」の場合、終了時間が早い順に並べる
                  if (timeA !== timeB) {
                    return timeA - timeB;
                  }
                  
                  // 3. 終了時間が同じ（または両方なし）場合は作成日時順
                  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                })
                .map((request) => (
                  <div key={request.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4">
                    <div className="flex gap-4 mb-2">
                      {request.productImage && (
                        <div className="relative w-32 h-32 flex-shrink-0">
                          <Image
                            src={request.productImage}
                            alt={request.productTitle}
                            fill
                            className="object-cover rounded"
                            sizes="128px"
                          />
                        </div>
                      )}

                      <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">{request.productTitle}</h3>
                          {request.productEndTime && (
                            <p className="text-[10px] text-gray-500 mb-1">
                              終了まで: <span className="font-semibold text-red-600">{getTimeRemaining(request.productEndTime, 'ja')}</span>
                            </p>
                          )}
                          <div className="flex flex-row items-center gap-1 mt-1 flex-nowrap overflow-x-auto">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getStatusColor(request.status)}`}>
                              {getStatusText(request.status)}
                            </span>
                            {request.finalStatus && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getFinalStatusColor(request.finalStatus)}`}>
                                {getFinalStatusText(request.finalStatus)}
                              </span>
                            )}
                            {request.adminNeedsConfirm && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 bg-red-100 text-red-800">
                                却下
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="w-full mt-auto">
                          <a
                            href={request.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-center text-xs text-indigo-600 hover:underline font-bold py-1.5 bg-indigo-50 rounded px-2 block w-full"
                          >
                            ヤフオクURL
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="mb-2 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs text-gray-500 font-medium">希望入札額:</span>
                        <span className="text-lg font-bold text-indigo-600 leading-none">
                          ${Math.round(request.maxBid || 0).toLocaleString('en-US')}
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

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 bg-gray-50 rounded-lg text-xs mb-2">
                      <div className="flex flex-col">
                        <span className="text-gray-500">ID:</span>
                        <span className="font-semibold truncate">{request.customerId}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">WhatsApp:</span>
                        <span className="font-semibold truncate">{request.customerWhatsapp || '未登録'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">氏名:</span>
                        <span className="font-semibold truncate">{request.customerFullName || request.customerName}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">言語:</span>
                        <span className="font-semibold">{request.language === 'es' ? 'スペイン語' : 'ポルトガル語'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">
                          {request.customerId?.startsWith('C') ? 'エージェント名:' : '顧客名:'}
                        </span>
                        <span className="font-semibold truncate">{request.customerName}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">リクエスト日時:</span>
                        <span className="font-semibold">{formatDateTime(request.createdAt)}</span>
                        {request.status === 'approved' && request.productEndTime && (
                          <span className="text-[10px] text-red-500">
                            (終了: {getTimeRemaining(request.productEndTime || '', 'ja')})
                          </span>
                        )}
                      </div>
                    </div>

                    {request.status === 'rejected' && (
                      <div className="mb-4 p-3 bg-red-50 rounded-lg">
                        {request.rejectReason && (
                          <>
                            <p className="text-sm text-gray-600">却下理由:</p>
                            <p className="font-semibold text-red-700 mb-3">{request.rejectReason}</p>
                          </>
                        )}
                        {request.status === 'rejected' && (
                          <button
                            onClick={() => confirmCustomerRejection(request.id)}
                            className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition"
                          >
                            削除を確認
                          </button>
                        )}
                      </div>
                    )}

                    {request.counterOffer && (
                      <div className="mb-2 p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs text-gray-500 font-medium">カウンターオファー:</span>
                          <span className="text-lg font-bold text-blue-700 leading-none">
                            ${Math.round(request.counterOffer || 0).toLocaleString('en-US')}
                          </span>
                          {(request.shippingCostJpy || 0) > 0 && (
                            <span className="text-xs text-gray-500 font-normal whitespace-nowrap">
                              (送料: ¥{(request.shippingCostJpy || 0).toLocaleString()})
                            </span>
                          )}
                        </div>
                        {request.customerCounterOffer && request.customerCounterOfferUsed && (
                          <p className="text-xs text-green-600 mt-1 text-right">✓ 承認済</p>
                        )}
                      </div>
                    )}

                    {request.status === 'counter_offer' && !request.customerCounterOffer && (
                      <button
                        onClick={() => {
                          setSelectedRequest(request);
                          setActionType('reject');
                        }}
                        className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base mb-2"
                      >
                        却下 (オファー取り消し)
                      </button>
                    )}

                    {request.customerCounterOffer && (
                      <div className="mb-2 p-3 bg-purple-50 rounded-lg">
                        <p className="text-sm text-gray-600">顧客からのカウンターオファー:</p>
                        <p className="font-semibold text-purple-700 text-base">${Math.round(request.customerCounterOffer).toLocaleString('en-US')}</p>

                        {!request.customerCounterOfferUsed && !request.adminNeedsConfirm && request.status === 'counter_offer' && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => updateStatus(request.id, 'approved')}
                              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setActionType('reject');
                              }}
                              className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition"
                            >
                              却下
                            </button>
                          </div>
                        )}

                        {/* ✓承認済みを削除（上の管理者カウンターオファーボックスに移動済み） */}

                        {request.adminNeedsConfirm && (
                          <p className="text-xs text-red-600 mt-2">✓ 却下済み</p>
                        )}
                      </div>
                    )}


                    {request.adminNeedsConfirm && !request.customerCounterOffer && (
                      <div className="mb-2 p-3 bg-red-50 rounded-lg">
                        <p className="text-sm text-red-800 mb-2">顧客がカウンターオファーを拒否しました</p>
                        <button
                          onClick={() => confirmCustomerRejection(request.id)}
                          className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition"
                        >
                          削除を確認
                        </button>
                      </div>
                    )}

                    {request.status === 'pending' && !request.adminNeedsConfirm && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          onClick={() => updateStatus(request.id, 'approved')}
                          className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition text-sm sm:text-base"
                        >
                          承認
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('counter');
                          }}
                          className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition text-sm sm:text-base"
                        >
                          カウンターオファー
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('reject');
                          }}
                          className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base"
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
                            setActionType('won');
                          }}
                          className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition text-sm sm:text-base"
                        >
                          落札
                        </button>
                        <button
                          onClick={() => updateFinalStatus(request.id, 'lost')}
                          className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm sm:text-base"
                        >
                          落札できず
                        </button>
                      </div>
                    )}

                    {request.finalStatus === 'lost' && (
                      <button
                        onClick={() => confirmCustomerRejection(request.id)}
                        className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition mt-3"
                      >
                        削除を確認
                      </button>
                    )}

                    {request.approvedAt && (
                      <div className="mt-3 text-sm text-gray-600">
                        承認: {formatDateTime(request.approvedAt)}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )
        )}

        {/* 履歴タブ */}
        {activeTab === 'purchased' && (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
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
                  {getCustomerIdList().map(id => {
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
              const unpaidSummaryTotal = filteredItemsForSummary
                .filter(item => !item.paid)
                .reduce((sum, item) => sum + (item.finalPrice || 0), 0);
              const summaryTotal = filteredItemsForSummary
                .reduce((sum, item) => sum + (item.finalPrice || 0), 0);

              return (
                <div className="grid grid-cols-2 gap-3 mb-6 bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-sm">
                  <div className="bg-white border border-red-100 rounded-lg p-3">
                    <p className="text-[10px] sm:text-xs font-bold text-red-500 uppercase tracking-wider mb-1">
                      未入金額
                    </p>
                    <p className="text-xl sm:text-2xl font-black text-red-600">
                      ${Math.round(unpaidSummaryTotal).toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="bg-white border border-indigo-50 rounded-lg p-3">
                    <p className="text-[10px] sm:text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">
                      合計金額
                    </p>
                    <p className="text-xl sm:text-2xl font-black text-indigo-600">
                      ${Math.round(summaryTotal).toLocaleString('en-US')}
                    </p>
                  </div>
                </div>
              );
            })()}

            {purchasedItems.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>購入済み商品がありません</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {getFilteredPurchasedItems()
                    .sort((a, b) => new Date(b.confirmedAt || '').getTime() - new Date(a.confirmedAt || '').getTime())
                    .map((item) => (
                      <div key={item.id} className="border rounded-lg p-4">
                        <div className="flex gap-4 mb-3">
                          {item.productImage && (
                            <div className="relative w-32 h-32 flex-shrink-0">
                              <Image
                                src={item.productImage}
                                alt={item.productTitle}
                                fill
                                className="object-cover rounded"
                                sizes="128px"
                              />
                            </div>
                          )}
                          <div className="flex-1 flex flex-col justify-between h-32 py-0.5 overflow-hidden">
                            <h3 className="text-xs font-semibold mb-1 line-clamp-2 leading-tight">{item.productTitle}</h3>
                            <div className="text-[10px] text-gray-600 mb-1 space-y-0.5">
                              <p className="truncate"><span className="font-semibold text-gray-800">顧客名: {item.customerName}</span></p>
                              <p className="whitespace-nowrap truncate">
                                <span className="font-semibold text-gray-800">確認日時:</span>{' '}
                                <span>{formatDateTime(item.confirmedAt || '')}</span>
                              </p>
                              <div className="flex items-center gap-1.5 mt-1 whitespace-nowrap overflow-hidden">
                                {item.stockNumber ? (
                                  <span className="font-bold text-gray-900 bg-gray-50 px-1.5 py-0.5 rounded border text-[9px] shrink-0">
                                    Stock No: {item.stockNumber}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-[10px] shrink-0">在庫番号なし</span>
                                )}
                                <button
                                  onClick={() => handleUpdateStockNumber(item.id, item.productTitle, item.stockNumber || '')}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-medium shrink-0"
                                >
                                  {item.stockNumber ? '編集' : '追加'}
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col w-full mt-auto">
                              <a
                                href={item.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-center text-[10px] text-indigo-600 hover:underline font-bold py-1 bg-indigo-50 rounded px-2 block w-full"
                              >
                                ヤフオクURL
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3 p-3 bg-gray-50 rounded text-xs sm:text-sm">
                          <div>
                            <p className="text-gray-600">ID</p>
                            <p className="font-semibold">{item.customerId}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">WhatsApp</p>
                            <p className="font-semibold">{item.customerWhatsapp || '未登録'}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">氏名</p>
                            <p className="font-semibold">{item.customerFullName || item.customerName}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">言語</p>
                            <p className="font-semibold">{item.language === 'es' ? 'スペイン語' : 'ポルトガル語'}</p>
                          </div>
                        </div>

                        <div className="pt-3 border-t flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.paid}
                                onChange={(e) => updatePaidStatus(item.id, e.target.checked)}
                                className="w-5 h-5 mr-2 cursor-pointer"
                              />
                              <span className="text-sm font-semibold text-gray-700">支払済</span>
                            </label>
                            {item.paid && item.paidAt && (
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {formatDateTime(item.paidAt)}
                              </span>
                            )}
                          </div>
                          <p className={`text-xl sm:text-2xl font-bold whitespace-nowrap ${item.paid ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                            ${Math.round(item.finalPrice || item.customerCounterOffer || item.counterOffer || item.maxBid || 0).toLocaleString('en-US')}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xl font-semibold">
                      合計{selectedCustomer !== 'all' && '（選択したID）'}:
                    </span>
                    <span className="text-3xl font-bold text-indigo-600">
                      ${Math.round(
                        getFilteredPurchasedItems()
                          .filter(item => !item.paid)  // ← 支払済を除外
                          .reduce((sum, item) => sum + (item.finalPrice || 0), 0)
                      ).toLocaleString('en-US')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 text-right">
                    未払い商品のみ / 支払済: {getFilteredPurchasedItems().filter(item => item.paid).length}件
                  </p>
                </div>
              </>
            )}
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 font-sans">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-xl text-white shadow-md">
                <p className="text-xs opacity-80 font-medium">保証金確認済 / 登録顧客数</p>
                <p className="text-2xl font-bold mt-1">
                  {customersList.filter(c => c.depositConfirmedAt).length} / {customersList.length} 名
                </p>
              </div>
              <div className="bg-gradient-to-br from-yellow-500 to-orange-600 p-4 rounded-xl text-white shadow-md">
                <p className="text-xs opacity-80 font-medium">未入金総額 / 入金済総額</p>
                <p className="text-2xl font-bold mt-1">
                  ${Math.round(customersList.reduce((sum, c) => sum + c.unpaidAmount, 0)).toLocaleString('en-US')} / ${Math.round(customersList.reduce((sum, c) => sum + c.paidAmount, 0)).toLocaleString('en-US')}
                </p>
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
                            <span className="font-bold text-gray-900">${customer.depositAmount}</span>
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
                            ${Math.round(customer.unpaidAmount).toLocaleString('en-US')}
                          </div>
                          <div className="text-xs text-gray-500">({customer.unpaidCount} 件)</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="font-bold text-green-600">
                            ${Math.round(customer.paidAmount).toLocaleString('en-US')}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 font-sans">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-xl text-white shadow-md">
                <p className="text-xs opacity-80 font-medium">保証金確認済 / 登録エージェント数</p>
                <p className="text-2xl font-bold mt-1">
                  {agentsList.filter(a => a.depositConfirmedAt).length} / {agentsList.length} 名
                </p>
              </div>
              <div className="bg-gradient-to-br from-yellow-500 to-orange-600 p-4 rounded-xl text-white shadow-md">
                <p className="text-xs opacity-80 font-medium">未入金総額 / 入金済総額（管理顧客分）</p>
                <p className="text-2xl font-bold mt-1">
                  ${Math.round(agentsList.reduce((sum, a) => sum + a.unpaidAmount, 0)).toLocaleString('en-US')} / ${Math.round(agentsList.reduce((sum, a) => sum + a.paidAmount, 0)).toLocaleString('en-US')}
                </p>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 rounded-xl text-white shadow-md">
                <p className="text-xs opacity-80 font-medium">未入金総額 / 入金済総額（エージェント分）</p>
                <p className="text-2xl font-bold mt-1">
                  ${Math.round(agentsList.reduce((sum, a) => sum + (a.selfUnpaidAmount || 0), 0)).toLocaleString('en-US')} / ${Math.round(agentsList.reduce((sum, a) => sum + (a.selfPaidAmount || 0), 0)).toLocaleString('en-US')}
                </p>
              </div>
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
                            <span className="font-bold text-gray-900">${agent.depositAmount}</span>
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
                            ${Math.round(agent.selfUnpaidAmount || 0).toLocaleString('en-US')}
                          </div>
                          <div className="text-xs text-gray-500">({agent.selfUnpaidCount || 0} 件)</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="font-bold text-green-600">
                            ${Math.round(agent.selfPaidAmount || 0).toLocaleString('en-US')}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 入金タブ */}
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
                    <label className="block text-sm font-semibold text-gray-700 mb-1">入金額 (USD)</label>
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
                  </div>
                  <div className="min-w-0">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">入金方法</label>
                    <select
                      value={depositForm.paymentMethod}
                      onChange={(e) => setDepositForm({ ...depositForm, paymentMethod: e.target.value })}
                      className="w-full h-12 border border-gray-300 rounded-lg px-3 py-0 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black box-border"
                      required
                    >
                      <option value="bank">銀行</option>
                      <option value="paypal">PayPal</option>
                      <option value="usdt">USDT</option>
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

              {/* 抽出合計金額カード */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-sm mb-6">
                <div className="bg-white border border-indigo-50 rounded-lg p-3">
                  <p className="text-[10px] sm:text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">
                    合計金額
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-indigo-600">
                    ${Math.round(getFilteredDeposits().reduce((sum, item) => sum + (item.amount || 0), 0)).toLocaleString('en-US')}
                  </p>
                </div>
              </div>

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
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">入金額</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">顧客</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">支払方法</th>
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
                          usdt: 'USDT'
                        };
                        return (
                          <tr key={item.id} className="hover:bg-gray-50 transition text-black">
                            <td className="px-4 py-3 whitespace-nowrap text-left font-medium text-gray-700">
                              {dateFormatted}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-green-600">
                              ${Number(item.amount).toLocaleString('en-US')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-left">
                              <span className="font-bold text-gray-900">{item.customer_id}</span>{' '}
                              <span className="text-gray-500 text-xs">{name}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">
                              {paymentMethodNames[item.payment_method] || item.payment_method}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => {
                                  setEditingDeposit(item);
                                  setEditDepositForm({
                                    depositDate: item.deposit_date,
                                    amount: item.amount.toString(),
                                    paymentMethod: item.payment_method
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
          <div className="bg-white rounded-lg shadow p-12 text-center font-sans">
            <p className="text-gray-500 text-lg">発送機能は準備中です</p>
          </div>
        )}
      </main>

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
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleReject}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition"
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
            <p className="text-gray-600 mb-2">{selectedRequest.productTitle}</p>
            <p className="text-sm text-gray-500 mb-4">
              顧客のオファー: ${Math.round(selectedRequest.customerCounterOffer || selectedRequest.maxBid || 0).toLocaleString('en-US')}
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">現在価格:</span>
                <span className="font-semibold">¥{selectedRequest.productPrice?.toLocaleString() || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-gray-600">送料:</span>
                <input
                  type="number"
                  placeholder="0"
                  value={shippingCostJpy}
                  onChange={(e) => setShippingCostJpy(e.target.value)}
                  className="w-32 border border-gray-300 rounded px-3 py-2 text-sm text-right"
                />
              </div>

              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">FOB費用:</span>
                <span className="font-semibold">¥1,500</span>
              </div>

              <div className="flex justify-between text-sm mb-2 pt-2 border-t">
                <span className="text-gray-600 font-semibold">合計（JPY）:</span>
                <span className="font-bold">
                  ¥{((selectedRequest.productPrice || 0) + parseFloat(shippingCostJpy || '0') + 1500).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-gray-600 font-semibold">USD価格（利益込み）:</span>
                <span className="text-xl font-bold text-blue-600">
                  ${(() => {
                    const FOB_COST = 1500;
                    const totalJpy = (selectedRequest.productPrice || 0) + parseFloat(shippingCostJpy || '0') + FOB_COST;
                    // エージェント(A始まり)は利益率20%、顧客(C始まり)は利益率40%
                    const profitDivisor = selectedRequest.customerId?.startsWith('A') ? 0.8 : 0.6;
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
                }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleCounterOffer}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
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
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-600">確定落札金額 (USD):</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    value={finalPriceInput}
                    onChange={(e) => setFinalPriceInput(e.target.value)}
                    className="w-32 border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-lg font-bold text-indigo-600 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                    autoFocus
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500 text-right italic">
                ※この金額が顧客の支払い金額として確定されます
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setActionType(null);
                  setFinalPriceInput('');
                }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (selectedRequest) {
                    const price = parseFloat(finalPriceInput);
                    if (isNaN(price)) {
                      alert('有効な金額を入力してください');
                      return;
                    }
                    updateFinalStatus(selectedRequest.id, 'won', price);
                  }
                }}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition"
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
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:ring-2 focus:ring-indigo-500 outline-none"
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
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
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
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:ring-2 focus:ring-indigo-500 outline-none text-black bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">入金額 (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    value={editDepositForm.amount}
                    onChange={(e) => setEditDepositForm({ ...editDepositForm, amount: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-base font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-black bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">入金方法</label>
                <select
                  value={editDepositForm.paymentMethod}
                  onChange={(e) => setEditDepositForm({ ...editDepositForm, paymentMethod: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                  required
                >
                  <option value="bank">銀行</option>
                  <option value="paypal">PayPal</option>
                  <option value="usdt">USDT</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => handleDeleteDeposit(editingDeposit.id)}
                  className="bg-red-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-red-700 transition text-sm"
                >
                  削除
                </button>
                <div className="flex-1"></div>
                <button
                  type="button"
                  onClick={() => setEditingDeposit(null)}
                  className="border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-semibold hover:bg-gray-50 transition text-sm"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-sm"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}