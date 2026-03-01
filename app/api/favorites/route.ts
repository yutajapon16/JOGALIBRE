import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Bearerトークンからユーザーを取得するヘルパー
async function getUserFromRequest(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
}

// GET: お気に入り一覧取得
export async function GET(request: Request) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin
            .from('favorites')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ favorites: data || [] });
    } catch (error) {
        console.error('Error in GET /api/favorites:', error);
        return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
    }
}

// POST: お気に入り追加
export async function POST(request: Request) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { productId, productTitle, productUrl, productImage, productPrice, bids, timeLeft } = body;

        const newFav = {
            user_id: user.id,
            product_id: productId,
            product_title: productTitle,
            product_url: productUrl,
            product_image: productImage,
            product_price: productPrice,
            bids: bids || 0,
            time_left: timeLeft || ''
        };

        const { data, error } = await supabaseAdmin
            .from('favorites')
            .insert([newFav])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, favorite: data });
    } catch (error) {
        console.error('Error in POST /api/favorites:', error);
        return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
    }
}

// DELETE: お気に入り削除
export async function DELETE(request: Request) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        // 自分のお気に入りのみ削除可能
        const { data: fav } = await supabaseAdmin
            .from('favorites')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!fav || fav.user_id !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { error } = await supabaseAdmin
            .from('favorites')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in DELETE /api/favorites:', error);
        return NextResponse.json({ error: 'Failed to delete favorite' }, { status: 500 });
    }
}
