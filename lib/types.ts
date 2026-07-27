export type UserRole = 'customer' | 'admin' | 'agent';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  whatsapp?: string;
  customerId?: string;
  address?: string;
  zipCode?: string;
  country?: string;
  agentCustomerId?: string;
  agentFullName?: string;
  depositAmount?: number;
  depositConfirmedAt?: string | null;
  termsAcceptedAt?: string | null;
  cpf?: string;
  state?: string;
  city?: string;
  language?: 'es' | 'pt';
}

export type BidStatus = 'pending' | 'approved' | 'rejected' | 'counter_offer';
export type FinalStatus = 'won' | 'lost' | 'ended_check_needed' | null;

export interface BidRequest {
  id: string;
  productId?: string;
  productTitle: string;
  productTitleEs?: string;
  productTitlePt?: string;
  productUrl: string;
  productImage: string;
  productPrice: number | null;
  productEndTime?: string;
  maxBid?: number | null;
  customerName: string;
  customerEmail: string;
  customerFullName?: string;
  customerWhatsapp?: string;
  language: string;
  status: BidStatus;
  createdAt: string;
  approvedAt?: string | null;
  confirmedAt?: string | null;
  rejectReason?: string | null;
  counterOffer?: number | null;
  shippingCostJpy: number | null;
  customerCounterOffer?: number | null;
  customerCounterOfferUsed?: boolean;
  finalStatus: FinalStatus;
  finalPrice: number | null;
  customerConfirmed: boolean;
  customerMessage: string | null;
  adminMessage?: string | null;
  adminNeedsConfirm?: boolean;
  customerId?: string;
  customerRole?: string;
  agentCustomerId?: string | null;
  paidAt?: string | null;
  paid?: boolean;
  paid_brazil?: boolean;
  paid_brazil_at?: string | null;
  paid_paraguay?: boolean;
  paid_paraguay_at?: string | null;
  paid_japan?: boolean;
  paid_japan_at?: string | null;
  stockNumber?: string | null;
  invoiceNumber?: string | null;
  customerCountry?: string | null;
  delivery_location?: string;
  delivery_country?: string;
  delivery_city?: string;
  shipping_method?: string;
  paid_local?: boolean;
  paid_local_at?: string | null;
  total_jpy?: number | null;
  cancelledAt?: string | null;
  shippingStatus?: string;
  shippedAt?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedArrivalDate?: string | null;
  updatedAt?: string | null;
  shippingUpdatedAt?: string | null;
}

export interface SearchItem {
  id: string;
  dbId?: string; // データベース上のID
  title: string;
  titleJa?: string;
  url: string;
  imageUrl: string;
  images?: string[];
  currentPrice: number;
  bids: number;
  timeLeft: string;
  endTime?: string;
  source: string;
  isFavorite?: boolean;
  shippingCost?: number | null;
  translatedDescription?: string | null;
  categoryId?: string;
}

export interface ExchangeRateResponse {
  rate: number;
  base: string;
  target: string;
}
