import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

export async function DELETE(request: Request) {
  try {
    const userFromToken = await getUserFromRequest(request);
    let targetUserId = userFromToken?.id;

    if (!targetUserId) {
      const body = await request.json().catch(() => ({}));
      if (body.userId) targetUserId = body.userId;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('app_notifications')
      .delete()
      .eq('user_id', targetUserId);

    if (error) {
      console.error('Error deleting notifications:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error in DELETE /api/notifications:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
