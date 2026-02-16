import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: roleData, error } = await supabase
      .from('user_roles')
      .select('role, full_name, whatsapp')
      .eq('id', user.id)
      .single();

    if (error || !roleData) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    return NextResponse.json(roleData);
  } catch (error) {
    console.error('Error getting user role:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}