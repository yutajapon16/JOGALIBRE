import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// プッシュ通知サブスクリプションの保存
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// サブスクリプションの存在確認
export async function GET(request: NextRequest) {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
        return NextResponse.json({ error: 'userId は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        return NextResponse.json({ exists: false }, { status: 404 });
    }

    return NextResponse.json({ exists: true });
}

export async function POST(request: NextRequest) {
    try {
        const { userId, subscription } = await request.json();

        if (!userId || !subscription) {
            return NextResponse.json(
                { error: 'userId と subscription は必須です' },
                { status: 400 }
            );
        }

        // 既存のサブスクリプションを更新、なければ挿入
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: userId,
                    subscription: subscription,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
            );

        if (error) {
            console.error('サブスクリプション保存エラー:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('プッシュ登録エラー:', error);
        return NextResponse.json(
            { error: 'プッシュ登録に失敗しました' },
            { status: 500 }
        );
    }
}

// サブスクリプションの削除
export async function DELETE(request: NextRequest) {
    try {
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json(
                { error: 'userId は必須です' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId);

        if (error) {
            console.error('サブスクリプション削除エラー:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('プッシュ解除エラー:', error);
        return NextResponse.json(
            { error: 'プッシュ解除に失敗しました' },
            { status: 500 }
        );
    }
}
