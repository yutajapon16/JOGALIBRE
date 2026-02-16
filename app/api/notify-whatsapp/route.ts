import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userType, email } = body; // userType: 'admin' or 'customer'

    if (userType === 'admin') {
      // 管理者が送信：未確認の顧客に通知
      const { data: pendingRequests } = await supabase
        .from('bid_requests')
        .select('customer_email, customer_name, product_title, language, status, final_status')
        .eq('customer_confirmed', false)
        .order('created_at', { ascending: false });

      if (!pendingRequests || pendingRequests.length === 0) {
        return NextResponse.json({ 
          success: false, 
          message: '通知する更新がありません' 
        });
      }

      // 顧客ごとにグループ化
      const customerGroups = new Map<string, any[]>();
      for (const req of pendingRequests) {
        if (!customerGroups.has(req.customer_email)) {
          customerGroups.set(req.customer_email, []);
        }
        customerGroups.get(req.customer_email)!.push(req);
      }

      // 各顧客にWhatsApp送信
      const results = [];
      for (const [customerEmail, requests] of customerGroups.entries()) {
        const userInfo = await getUserInfo(customerEmail);
        if (!userInfo?.whatsapp) {
          console.log(`No WhatsApp for ${customerEmail}, skipping`);
          continue;
        }

        const lang = requests[0].language || 'es';
        const count = requests.length;
        
        const message = lang === 'es'
          ? `🔔 JOGALIBRE: Tienes ${count} solicitud(es) con actualizaciones. Revisa tu panel: https://jogalibre.vercel.app/`
          : `🔔 JOGALIBRE: Você tem ${count} solicitação(ões) com atualizações. Confira seu painel: https://jogalibre.vercel.app/`;

        const result = await sendWhatsAppMessage(userInfo.whatsapp, message);
        results.push({ 
          email: customerEmail, 
          whatsapp: userInfo.whatsapp,
          success: result.success 
        });
      }

      return NextResponse.json({ 
        success: true, 
        notificationsSent: results.filter(r => r.success).length,
        total: results.length,
        details: results
      });

    } else if (userType === 'customer') {
      // 顧客が送信：未確認の自分のリクエストを管理者に通知
      const { data: myRequests } = await supabase
        .from('bid_requests')
        .select('customer_name, product_title, status, final_status')
        .eq('customer_email', email)
        .eq('customer_confirmed', false)
        .order('created_at', { ascending: false });

      if (!myRequests || myRequests.length === 0) {
        return NextResponse.json({ 
          success: false, 
          message: 'No hay actualizaciones pendientes' 
        });
      }

      const adminWhatsApp = process.env.ADMIN_WHATSAPP_NUMBER;
      if (!adminWhatsApp) {
        return NextResponse.json({ 
          success: false, 
          message: 'Admin WhatsApp no configurado' 
        });
      }

      const customerName = myRequests[0].customer_name;
      const count = myRequests.length;

      const message = `🔔 JOGALIBRE ADMIN: ${customerName} tiene ${count} solicitud(es) pendientes de revisión. Revisar: https://jogalibre.vercel.app/admin`;

      const result = await sendWhatsAppMessage(adminWhatsApp, message);

      return NextResponse.json({ 
        success: result.success,
        notificationsSent: result.success ? 1 : 0
      });
    }

    return NextResponse.json({ 
      success: false, 
      message: 'Tipo de usuario inválido' 
    });

  } catch (error) {
    console.error('WhatsApp notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send notifications' },
      { status: 500 }
    );
  }
}

// ヘルパー関数
async function getUserInfo(email: string) {
  try {
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
    const user = authData.users.find(u => u.email === email);
    if (!user) return null;

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('whatsapp')
      .eq('id', user.id)
      .single();

    return roleData;
  } catch (error) {
    console.error('Error in getUserInfo:', error);
    return null;
  }
}