'use client';

import { useState, useEffect } from 'react';
import { signIn, signOut, getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [bidRequests, setBidRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [counterOffer, setCounterOffer] = useState('');
  const [shippingCostJpy, setShippingCostJpy] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [actionType, setActionType] = useState<'reject' | 'counter' | null>(null);
  const [exchangeRate, setExchangeRate] = useState(150);
  const [showPurchased, setShowPurchased] = useState(false);
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [purchasedTotal, setPurchasedTotal] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [purchasedPeriod, setPurchasedPeriod] = useState<'all' | '7days' | '30days' | '90days'>('all');
  const [isSendingNotification, setIsSendingNotification] = useState(false);


  // セッションチェック（最初に実行）
  useEffect(() => {
    // 初回セッション復元
    getCurrentUser().then(user => {
      if (user?.role === 'admin') {
        setCurrentUser(user);
      }
    });

    // セッション変更を監視（トークンリフレッシュ時の自動復元のみ）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // トークンリフレッシュ時のみセッション復元（ログイン処理との競合を防止）
        const user = await getCurrentUser();
        if (user?.role === 'admin') {
          setCurrentUser(user);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(loginForm.email, loginForm.password);
      const user = await getCurrentUser();

      // 管理者ロールチェック
      if (user?.role !== 'admin') {
        await signOut();
        alert('管理者アカウントでログインしてください');
        return;
      }

      setCurrentUser(user);
      setLoginForm({ email: '', password: '' });
    } catch (error) {
      console.error('Login error:', error);
      alert('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    }
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);
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

      console.log('=== ADMIN DEBUG ===');
      console.log('Raw data:', data);
      console.log('bidRequests:', data.bidRequests);

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
        adminNeedsConfirm: req.admin_needs_confirm
      }));
      console.log('Converted requests:', convertedRequests);

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
    const customerList = Array.from(uniqueCustomers.values()).sort((a, b) => a.localeCompare(b));
    return customerList;
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
        setCounterOffer('');
        setShippingCostJpy('');
      } else {
        console.error('updateStatus failed:', res.status);
        alert('更新に失敗しました。ページをリロードしてください。');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('通信エラーが発生しました。');
    }
  };

  const updateFinalStatus = async (id: string, finalStatus: string) => {
    try {
      const { data: { session: clientSession } } = await supabase.auth.getSession();
      const accessToken = clientSession?.access_token;

      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        },
        body: JSON.stringify({ id, finalStatus })
      });

      if (res.ok) {
        fetchBidRequests();
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

      const res = await fetch('/api/bid-request?id=' + id, {
        method: 'DELETE',
        headers: {
          'Authorization': accessToken ? `Bearer ${accessToken}` : ''
        }
      });

      if (res.ok) {
        fetchBidRequests();
      }
    } catch (error) {
      console.error('Error confirming rejection:', error);
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
      const priceWithProfit = totalJpy / 0.8;
      const usdPrice = priceWithProfit / exchangeRate;
      const roundedUsd = Math.ceil(usdPrice / 10) * 10;

      updateStatus(selectedRequest.id, 'counter_offer', undefined, roundedUsd, shipping);
    }
  };

  // CSVエクスポート機能
  const exportPurchasedItemsCSV = () => {
    const items = getFilteredPurchasedItems()
      .sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime());

    if (items.length === 0) {
      alert('エクスポートするデータがありません。');
      return;
    }

    // CSVヘッダー
    const headers = ['日付', '顧客名', '氏名', 'メール', 'WhatsApp', '商品名', '確定金額(USD)', '支払い状態', '商品URL'];

    // CSVデータ行
    const rows = items.map(item => [
      formatDateTime(item.confirmedAt),
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

  const getTimeRemaining = (endTime: string) => {
    if (!endTime) return '-';

    // タイムゾーン情報がない場合、UTC として扱う
    let endDate: Date;
    if (!endTime.includes('Z') && !endTime.includes('+') && !endTime.includes('-', 10)) {
      endDate = new Date(endTime + 'Z');
    } else {
      endDate = new Date(endTime);
    }

    const now = new Date().getTime();
    const end = endDate.getTime();
    const diff = end - now;

    if (diff <= 0) return '終了';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}日 ${hours}時間`;
    if (hours > 0) return `${hours}時間 ${minutes}分`;
    return `${minutes}分`;
  };


  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-black mb-2">管理者ログイン</h1>
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
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">管理画面</h1>
            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700 font-semibold"
            >
              ログアウト
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-sm sm:text-base text-gray-600">
              保留中: <span className="font-bold text-indigo-600">
                {bidRequests.filter(req => req.status === 'pending').length}
              </span>
              {' '}
              合計: <span className="font-bold">{bidRequests.length}件</span>
            </div>

            <button
              onClick={sendWhatsAppNotification}
              disabled={isSendingNotification}
              className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition text-sm sm:text-base w-full disabled:bg-gray-400"
            >
              {isSendingNotification ? '送信中...' : 'WhatsApp通知'}
            </button>

            <button
              onClick={fetchBidRequests}
              className="bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition text-sm sm:text-base w-full"
            >
              更新
            </button>

            {!showPurchased && (
              <button
                onClick={() => { setShowPurchased(true); fetchPurchasedItems(); }}
                className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition text-sm sm:text-base w-full"
              >
                購入履歴
              </button>
            )}
            {showPurchased && (
              <button
                onClick={() => setShowPurchased(false)}
                className="bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 transition text-sm sm:text-base w-full"
              >
                戻る
              </button>
            )}

            <div className="text-xs sm:text-sm text-gray-600">
              為替レート: <span className="font-semibold">USD 1 = JPY {exchangeRate.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </header>

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
                    .sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime())
                    .map((item) => (
                      <div key={item.id} className="border rounded-lg p-4">
                        <div className="flex gap-4 mb-3">
                          {item.productImage && (
                            <img
                              src={item.productImage}
                              alt={item.productTitle}
                              className="w-32 h-32 object-cover rounded flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 flex flex-col justify-between overflow-hidden" style={{ maxHeight: '128px' }}>
                            <h3 className="text-sm sm:text-base font-semibold" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.productTitle}</h3>
                            <a
                              href={item.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:underline text-sm inline-block flex-shrink-0"
                            >
                              ヤフオクURL →
                            </a>
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
                          <div>
                            <p className="text-gray-600">顧客名</p>
                            <p className="font-semibold">{item.customerName}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">確認日時</p>
                            <p className="font-semibold">{formatDateTime(item.confirmedAt)}</p>
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
                            <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                              ✓ 支払済
                            </span>
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
                          .filter(item => selectedCustomer === 'all' || item.customerName === selectedCustomer)
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
                      <img
                        src={request.productImage}
                        alt={request.productTitle}
                        className="w-32 h-32 object-cover rounded flex-shrink-0"
                      />
                    )}

                    <div className="flex-1 flex flex-col min-h-[128px] py-0.5 overflow-hidden">
                      <h3 className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">{request.productTitle}</h3>
                      <div className="flex flex-col gap-0.5">
                        <a
                          href={request.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-xs inline-block"
                        >
                          ヤフオクURL →
                        </a>
                        {request.productEndTime && (
                          <p className="text-[10px] text-gray-500">
                            終了まで: <span className="font-semibold text-red-600">{getTimeRemaining(request.productEndTime)}</span>
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

                      <div className="mt-auto flex items-end justify-between">
                        <div className="text-left flex items-baseline gap-1">
                          <span className="text-xs text-gray-500">希望入札額:</span>
                          <span className="text-lg font-bold text-indigo-600 leading-none">
                            ${Math.round(request.maxBid).toLocaleString('en-US')}
                          </span>
                        </div>
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
                          (終了: {getTimeRemaining(request.productEndTime)})
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
                      <p className="font-semibold text-blue-700 text-base">${Math.round(request.counterOffer).toLocaleString('en-US')}</p>
                      {request.shippingCostJpy > 0 && (
                        <p className="text-xs text-gray-600">送料: ¥{request.shippingCostJpy.toLocaleString()}</p>
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
                        onClick={() => updateFinalStatus(request.id, 'won')}
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
              顧客のオファー: ${Math.round(selectedRequest.customerCounterOffer || selectedRequest.maxBid).toLocaleString('en-US')}
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
                    const priceWithProfit = totalJpy / 0.8;
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
                  setCounterOffer('');
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
    </div>
  );
}