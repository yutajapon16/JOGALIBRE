export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

// 完全にランダムな8文字の英数字コードを生成するヘルパー関数
function generateRandomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 招待コードのインターフェース定義
interface InviteCode {
  code: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

// 管理者権限を検証する共通ヘルパー
async function verifyAdmin(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return null;

  const { data: userRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userRole?.role !== 'admin') return null;
  return user;
}

// GET /api/admin/invite-code
// 招待コードの一覧（有効期限、使用状態含む）を取得する
export async function GET(request: Request) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settingData, error: fetchError } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'agent_invite_codes')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // 該当データが存在しないエラー（PGRST116）以外は例外を投げる
      throw fetchError;
    }

    const inviteCodes: InviteCode[] = settingData?.value ? (settingData.value as InviteCode[]) : [];

    // 日付順（新しい順）に並べ替えて返却
    const sortedCodes = inviteCodes.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ inviteCodes: sortedCodes });
  } catch (error) {
    console.error('Error fetching invite codes:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/admin/invite-code
// 新しいランダムな8文字の招待コードを生成して追加する
export async function POST(request: Request) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. 現在の設定データを取得
    const { data: settingData, error: fetchError } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'agent_invite_codes')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const inviteCodes: InviteCode[] = settingData?.value ? (settingData.value as InviteCode[]) : [];

    // 2. 新しいランダムな8文字コードを生成
    let newCode = generateRandomCode();
    // 重複チェック（万が一既存コードと重複した場合、再生成する）
    let attempts = 0;
    while (inviteCodes.some(c => c.code === newCode) && attempts < 10) {
      newCode = generateRandomCode();
      attempts++;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24時間後

    const newInvite: InviteCode = {
      code: newCode,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      used: false
    };

    // リストの先頭に追加
    const updatedCodes = [newInvite, ...inviteCodes];

    // 3. system_settings テーブルへ保存（UPSERT）
    const { error: saveError } = await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'agent_invite_codes',
        value: updatedCodes
      });

    if (saveError) throw saveError;

    return NextResponse.json({ success: true, inviteCode: newInvite });
  } catch (error) {
    console.error('Error generating invite code:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
