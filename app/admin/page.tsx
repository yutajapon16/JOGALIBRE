'use client';

import { useState, useEffect } from 'react';

export default function AdminDashboard() {
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
  const [sortPurchasedBy, setSortPurchasedBy] = useState<'date' | 'name'>('date');

  useEffect(() => {
    fetchBidRequests();
    fetchExchangeRate();
    const interval = setInterval(fetchBidRequests, 30000);
    return () => clearInterval(interval);
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

  const fetchBidRequests = async () => {
    try {
      const res = await fetch('/api/bid-request');
      const data = await res.json();
      setBidRequests((data.bidRequests || []).filter((req: any) => !req.customerConfirmed));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bid requests:', error);
      setLoading(false);
    }
  };

  const fetchPurchasedItems = async () => {
    try {
      const res = await fetch('/api/bid-request?purchased=true');
      const data = await res.json();
      setPurchasedItems(data.purchasedItems || []);
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
      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const updateFinalStatus = async (id: string, finalStatus: string) => {
    try {
      const res = await fetch('/api/bid-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, finalStatus })
      });
      
      if (res.ok) {
        fetchBidRequests();
      }
    } catch (error) {
      console.error('Error updating final status:', error);
    }
  };

  const confirmCustomerRejection = async (id: string) => {
    try {
      const res = await fetch('/api/bid-request?id=' + id, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        fetchBidRequests();
      }
    } catch (error) {
      console.error('Error confirming rejection:', error);
    }
  };

  const handleReject = () => {
    if (selectedRequest && rejectReason.trim()) {
      updateStatus(selectedRequest.id, 'rejected', rejectReason);
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
      approved: '承認済み',
      rejected: '却下済み',
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
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  };

  const getTimeRemaining = (endTime: string) => {
    const now = new Date().getTime();
    const end = new Date(endTime).getTime();
    const diff = end - now;

    if (diff <= 0) return '終了';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}日 ${hours}時間`;
    if (hours > 0) return `${hours}時間 ${minutes}分`;
    return `${minutes}分`;
  };

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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">管理画面</h1>
          
          <div className="flex flex-col gap-2">
            <div className="text-sm sm:text-base text-gray-600">
              保留中: <span className="font-bold text-indigo-600">
                {bidRequests.filter(req => req.status === 'pending').length}
              </span>
              {' '}
              合計: <span className="font-bold">{bidRequests.length}/10</span>
            </div>
            
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
                <span className="text-sm text-gray-600 whitespace-nowrap w-28">並び替え:</span>
                <select
                  value={sortPurchasedBy}
                  onChange={(e) => setSortPurchasedBy(e.target.value as 'date' | 'name')}
                  className="border border-gray-300 rounded px-3 py-3 text-base flex-1"
                >
                  <option value="date">日付</option>
                  <option value="name">顧客</option>
                </select>
              </div>
            </div>

            {purchasedItems.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>購入済み商品がありません</p>
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
                    .map((item) => (
                    <div key={item.id} className="border rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row gap-4 mb-3">
                      {item.productImage && (
                        <img 
                          src={item.productImage} 
                          alt={item.productTitle}
                          className="w-full sm:w-32 aspect-square object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-sm sm:text-base font-semibold mb-3">{item.productTitle}</h3>
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div className="flex gap-2">
                            <span className="text-gray-600 min-w-20">顧客</span>
                            <span className="font-semibold">{item.customerName}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 min-w-20">確認日時</span>
                            <span className="font-semibold">{formatDateTime(item.confirmedAt)}</span>
                          </div>
                        </div>
                        
                        <a
                          href={item.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-sm inline-block mt-2"
                        >
                          ヤフオクURL →
                        </a>
                      </div>
                      </div>
                      <div className="text-right pt-3 border-t">
                        <p className="text-xl sm:text-2xl font-bold text-green-600">
                          ${Math.round(item.finalPrice).toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold">
                      合計{selectedCustomer !== 'all' && '（選択した顧客）'}:
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
        ) : bidRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">オファーリクエストがありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bidRequests.map((request) => (
              <div key={request.id} className="bg-white rounded-lg shadow-md p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-4">
                  {request.productImage && (
                    <div className="flex-shrink-0 w-full sm:w-auto">
                      <img 
                        src={request.productImage} 
                        alt={request.productTitle}
                        className="w-full sm:w-40 aspect-square object-cover rounded-lg"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <h3 className="text-base sm:text-xl font-semibold mb-2">{request.productTitle}</h3>
                    <p className="text-gray-600 text-xs sm:text-sm mb-2">商品ID: {request.productId}</p>
                    {request.productUrl && (
                      <a
                        href={request.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline text-sm inline-block mb-2"
                      >
                        ヤフオクURL →
                      </a>
                    )}
                    {request.productEndTime && (
                      <p className="text-sm text-gray-600 mb-2">
                        終了まで: <span className="font-semibold text-red-600">{getTimeRemaining(request.productEndTime)}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(request.status)}`}>
                        {getStatusText(request.status)}
                      </span>
                      {request.finalStatus && (
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getFinalStatusColor(request.finalStatus)}`}>
                          {getFinalStatusText(request.finalStatus)}
                        </span>
                      )}
                    </div>
                    
                    <div className="text-right sm:text-right">
                      <div className="text-xl sm:text-2xl font-bold text-indigo-600">
                        ${Math.round(request.maxBid).toLocaleString('en-US')}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-500">最高入札額</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg text-sm sm:text-base">
                  <div>
                    <p className="text-sm text-gray-600">顧客</p>
                    <p className="font-semibold">{request.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">言語</p>
                    <p className="font-semibold">{request.language === 'es' ? 'スペイン語' : 'ポルトガル語'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">リクエスト日時</p>
                    <p className="font-semibold">{formatDateTime(request.createdAt)}</p>
                    {request.status === 'approved' && request.productEndTime && (
                      <p className="text-xs text-red-600 mt-1">
                        終了まで: {getTimeRemaining(request.productEndTime)}
                      </p>
                    )}
                  </div>
                </div>

                {request.rejectReason && (
                  <div className="mb-4 p-3 bg-red-50 rounded-lg">
                    <p className="text-sm text-gray-600">却下理由:</p>
                    <p className="font-semibold text-red-700">{request.rejectReason}</p>
                  </div>
                )}

                {request.counterOffer && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">カウンターオファー:</p>
                    <p className="font-semibold text-blue-700">${Math.round(request.counterOffer).toLocaleString('en-US')}</p>
                    {request.shippingCostJpy > 0 && (
                      <p className="text-xs text-gray-600 mt-1">送料: ¥{request.shippingCostJpy.toLocaleString()}</p>
                    )}
                  </div>
                )}

                {request.customerCounterOffer && (
                  <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm text-gray-600">顧客からのカウンターオファー:</p>
                    <p className="font-semibold text-purple-700">${Math.round(request.customerCounterOffer).toLocaleString('en-US')}</p>
                  </div>
                )}

                {request.adminNeedsConfirm && (
                  <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-800 mb-2">顧客がカウンターオファーを拒否しました</p>
                    <button
                      onClick={() => confirmCustomerRejection(request.id)}
                      className="bg-yellow-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-yellow-700 transition"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">リクエストを却下</h2>
            <p className="text-gray-600 mb-4">{selectedRequest.productTitle}</p>
            
            <textarea
              placeholder="却下理由..."
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
                disabled={!rejectReason.trim()}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition disabled:bg-gray-400"
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