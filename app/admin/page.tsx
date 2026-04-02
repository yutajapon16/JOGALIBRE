'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { signIn, signOut, getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/push-notifications';
import { formatDateTime, getTimeRemaining } from '@/lib/utils';
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
  const [showPurchased, setShowPurchased] = useState(false);
  const [purchasedItems, setPurchasedItems] = useState<BidRequest[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [purchasedPeriod, setPurchasedPeriod] = useState<'all' | '7days' | '30days' | '90days'>('all');
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
  useEffect(() => {
    if (currentUser) {
      fetchBidRequests();
      fetchExchangeRate();
      const interval = setInterval(fetchBidRequests, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

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
            if (showPurchased) {
              await fetchPurchasedItems();
            } else {
              await fetchBidRequests();
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
  }, [showPurchased, currentUser]);

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

    // 顧客名でフィルタリング
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(item => (item.customerFullName || item.customerName) === selectedCustomer);
    }

    // 期間でフィルタリング
    if (purchasedPeriod !== 'all') {
      const now = new Date();
      const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
      const days = daysMap[purchasedPeriod as keyof typeof daysMap];
      const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(item =>
        new Date(item.confirmedAt || '').getTime() >= cutoffDate.getTime()
      );
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
        paid: item.paid || false
      }));

      setPurchasedItems(convertedItems);
    } catch (error) {
      console.error('Error fetching purchased items:', error);
    }
  };

  const getCustomerList = () => {
    const uniqueCustomers = new Map<string, string>();
    purchasedItems.forEach(item => {
      const displayName = item.customerFullName || item.customerName;
      if (!uniqueCustomers.has(displayName)) {
        uniqueCustomers.set(displayName, displayName);
      }
    });
    const customerList = Array.from(uniqueCustomers.values()).sort((a, b) => a.localeCompare(b));
    return customerList;
  };

  const getCustomerTotal = (customerName: string) => {
    return purchasedItems
      .filter(item => (item.customerFullName || item.customerName) === customerName)
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

  const handleReject = () => {
    if (selectedRequest) {
      updateStatus(selectedRequest.id, 'rejected', rejectReason.trim());
    }
  };

  const handleCounterOffer = () => {
    if (selectedRequest) {
      const FOB_COST = 1350;
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
              <button
                onClick={sendWhatsAppNotification}
                disabled={isSendingNotification}
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition text-sm sm:text-base disabled:bg-gray-400"
              >
                {isSendingNotification ? '送信中...' : '📱 WhatsApp'}
              </button>
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
              onClick={fetchBidRequests}
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
              { key: 'requests' as const, label: '入札リクエスト', icon: '📋' },
              { key: 'purchased' as const, label: '購入履歴', icon: '🛒' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setShowPurchased(tab.key === 'purchased');
                  if (tab.key === 'purchased') fetchPurchasedItems();
                  else fetchBidRequests();
                }}
                className={`flex-1 py-3 text-center text-sm sm:text-base font-medium border-b-2 transition ${(tab.key === 'purchased' ? showPurchased : !showPurchased)
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
        {showPurchased ? (
          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">購入済み商品</h2>

            <div className="flex flex-col gap-3 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap w-28">フィルター:</span>
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-3 text-base flex-1"
                >
                  <option value="all">すべての顧客</option>
                  {getCustomerList().map(customerName => (
                    <option key={customerName} value={customerName}>
                      {customerName} - ${Math.round(getCustomerTotal(customerName)).toLocaleString('en-US')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap w-28">期間:</span>
                <select
                  value={purchasedPeriod}
                  onChange={(e) => setPurchasedPeriod(e.target.value as 'all' | '7days' | '30days' | '90days')}
                  className="border border-gray-300 rounded px-3 py-3 text-base flex-1"
                >
                  <option value="all">すべて</option>
                  <option value="7days">過去7日間</option>
                  <option value="30days">過去30日間</option>
                  <option value="90days">過去90日間</option>
                </select>
              </div>

              <button
                onClick={exportPurchasedItemsCSV}
                className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-emerald-700 transition text-sm sm:text-base"
              >
                📥 CSVダウンロード
              </button>
            </div>

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
                          <div className="flex-1 flex flex-col justify-between min-h-[128px] py-0.5 overflow-hidden">
                            <h3 className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">{item.productTitle}</h3>
                            <div className="text-xs text-gray-600 mb-2 mt-1 space-y-0.5">
                              <p><span className="font-semibold text-gray-800">顧客名: {item.customerName}</span></p>
                              <p className="flex flex-col">
                                <span>確認日時:</span>
                                <span>{formatDateTime(item.confirmedAt || '')}</span>
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 w-full mt-auto">
                              <a
                                href={item.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-center text-xs text-indigo-600 hover:underline font-bold py-1.5 bg-indigo-50 rounded px-2 block w-full"
                              >
                                ヤフオクURL
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3 p-3 bg-gray-50 rounded text-xs sm:text-sm">
                          <div>
                            <p className="text-gray-600">氏名</p>
                            <p className="font-semibold">{item.customerFullName || item.customerName}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">WhatsApp</p>
                            <p className="font-semibold">{item.customerWhatsapp || '未登録'}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">メール</p>
                            <p className="font-semibold break-all">{item.customerEmail}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">言語</p>
                            <p className="font-semibold">{item.language === 'es' ? 'スペイン語' : 'ポルトガル語'}</p>
                          </div>
                        </div>

                        <div className="text-right pt-3 border-t">
                          <div className="flex items-center justify-between mb-2">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.paid}
                                onChange={(e) => updatePaidStatus(item.id, e.target.checked)}
                                className="w-5 h-5 mr-2 cursor-pointer"
                              />
                              <span className="text-sm font-semibold text-gray-700">支払済</span>
                            </label>
                            <p className={`text-xl sm:text-2xl font-bold ${item.paid ? 'text-gray-400 line-through' : 'text-green-600'}`}>
                              ${Math.round(item.finalPrice || item.customerCounterOffer || item.counterOffer || item.maxBid || 0).toLocaleString('en-US')}
                            </p>
                          </div>
                          {item.paid && (
                            <div className="flex justify-end items-center gap-2 mt-1">
                              {item.paidAt && (
                                <span className="text-xs font-semibold text-gray-500">
                                  {formatDateTime(item.paidAt)}
                                </span>
                              )}
                              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                                ✓ 支払済
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xl font-semibold">
                      合計{selectedCustomer !== 'all' && '（選択した顧客）'}:
                    </span>
                    <span className="text-3xl font-bold text-indigo-600">
                      ${Math.round(
                        getFilteredPurchasedItems()
                          .filter(item => selectedCustomer === 'all' || (item.customerFullName || item.customerName) === selectedCustomer)
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
        ) : bidRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">オファーリクエストなし</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bidRequests
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((request) => (
                <div key={request.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4">
                  <div className="flex gap-4 mb-3">
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

                    <div className="flex-1 flex flex-col justify-between min-h-[128px] py-0.5 overflow-hidden">
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">{request.productTitle}</h3>
                        {request.productEndTime && (
                          <p className="text-[10px] text-gray-500 mb-1">
                            終了まで: <span className="font-semibold text-red-600">{getTimeRemaining(request.productEndTime, 'ja')}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(request.status)}`}>
                            {getStatusText(request.status)}
                          </span>
                          {request.finalStatus && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getFinalStatusColor(request.finalStatus)}`}>
                              {getFinalStatusText(request.finalStatus)}
                            </span>
                          )}
                          {request.adminNeedsConfirm && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800">
                              却下
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 w-full mt-auto pt-2">
                        <div className="text-left flex items-baseline gap-1 mb-1">
                          <span className="text-xs text-gray-500">希望入札額:</span>
                          <span className="text-lg font-bold text-indigo-600 leading-none">
                            ${Math.round(request.maxBid || 0).toLocaleString('en-US')}
                          </span>
                        </div>
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

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 bg-gray-50 rounded-lg text-xs">
                    <div className="flex flex-col">
                      <span className="text-gray-500">氏名:</span>
                      <span className="font-semibold truncate">{request.customerFullName || request.customerName}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500">WhatsApp:</span>
                      <span className="font-semibold truncate">{request.customerWhatsapp || '未登録'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500">メール:</span>
                      <span className="font-semibold break-all line-clamp-1">{request.customerEmail}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500">言語:</span>
                      <span className="font-semibold">{request.language === 'es' ? 'スペイン語' : 'ポルトガル語'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500">顧客名:</span>
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
                      <p className="text-sm text-gray-600">カウンターオファー:</p>
                      <p className="font-semibold text-blue-700 text-base">${Math.round(request.counterOffer || 0).toLocaleString('en-US')}</p>
                      {(request.shippingCostJpy || 0) > 0 && (
                        <p className="text-xs text-gray-600">送料: ¥{(request.shippingCostJpy || 0).toLocaleString()}</p>
                      )}
                      {/* ✓承認済みをここに移動 */}
                      {request.customerCounterOffer && request.customerCounterOfferUsed && (
                        <p className="text-xs text-green-600 mt-2">✓ 承認済</p>
                      )}
                    </div>
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
                <span className="font-semibold">¥1,350</span>
              </div>

              <div className="flex justify-between text-sm mb-2 pt-2 border-t">
                <span className="text-gray-600 font-semibold">合計（JPY）:</span>
                <span className="font-bold">
                  ¥{((selectedRequest.productPrice || 0) + parseFloat(shippingCostJpy || '0') + 1350).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-gray-600 font-semibold">USD価格（利益込み）:</span>
                <span className="text-xl font-bold text-blue-600">
                  ${(() => {
                    const FOB_COST = 1350;
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
    </div>
  );
}