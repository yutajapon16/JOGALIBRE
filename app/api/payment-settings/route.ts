export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

// 支払い方法の設定を取得するAPI
// ログイン済みのユーザーであれば誰でも取得可能
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // system_settings テーブルから payment_methods を取得
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'payment_methods')
      .single();

    if (error) {
      console.error('Error fetching payment settings:', error);
      // データが存在しない、またはエラーの場合はデフォルト設定をフォールバックとして返す
      return NextResponse.json({
        bank: {
          es: {
            name: "RAKUTEN BANK, LTD.",
            sucursal: "HEAD OFFICE",
            swift: "RAKTJPJT",
            address_bank: "2-16-5 KONAN, MINATO-KU, TOKYO, JAPAN",
            account_number: "252-7951120",
            account_name: "JOGA INC.",
            address_joga: "NINOMIYA CUBE 2A, 2-17-4 NINOMIYA, TSUKUBA, IBARAKI, JAPAN",
            telefono: "+81-298286721",
            intermediary_bank: "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
            intermediary_swift: "SMBCJPJT"
          },
          pt: {
            name: "RAKUTEN BANK, LTD.",
            sucursal: "HEAD OFFICE",
            swift: "RAKTJPJT",
            address_bank: "2-16-5 KONAN, MINATO-KU, TOKYO, JAPAN",
            account_number: "252-7951120",
            account_name: "JOGA INC.",
            address_joga: "NINOMIYA CUBE 2A, 2-17-4 NINOMIYA, TSUKUBA, IBARAKI, JAPAN",
            telefono: "+81-298286721",
            intermediary_bank: "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
            intermediary_swift: "SMBCJPJT"
          }
        },
        usdt: {
          address: "TAgk4wvd5rYQFU9EdwPipBwb7pzUDX52Gc",
          qr_url: "/images/usdt_qr.png"
        },
        paypal: {
          account_email: "admin@jogalibre.com",
          link: "https://paypal.me/joga1225",
          fee_multiplier: 1.08
        }
      });
    }

    return NextResponse.json(data.value);
  } catch (error) {
    console.error('Critical error in GET /api/payment-settings:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
