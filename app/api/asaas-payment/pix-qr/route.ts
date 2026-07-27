export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-helpers';

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

/**
 * 作成済みPIX請求のQRコード情報を取得するエンドポイント
 * 
 * クエリパラメータ:
 * - paymentId: ASAAS支払いID
 */
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ASAAS_API_KEY) {
      return NextResponse.json({ error: 'Payment service not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
    }

    // ASAAS APIからPIX QRコード情報を取得
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${ASAAS_BASE_URL}/payments/${paymentId}/pixQrCode`, {
        headers: {
          'access_token': ASAAS_API_KEY,
        },
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('[ASAAS PIX QR] エラー:', data);
        return NextResponse.json({ error: 'Failed to get PIX QR code' }, { status: 500 });
      }

      return NextResponse.json({
        qrCodeImage: data.encodedImage,     // base64エンコードされたQRコード画像
        qrCodeText: data.payload,            // コピー用PIXコード（Copia e Cola）
        expirationDate: data.expirationDate, // 有効期限
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error('[ASAAS PIX QR] エラー:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
