import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Helper to create a Supabase client for reading session
async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `set` method was called from a Server Component.
          }
        },
      },
    }
  );
}

export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Fetch user details from user_roles
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (roleError || !roleData) {
      console.error('Error fetching user role:', roleError);
      return new NextResponse('User data not found', { status: 404 });
    }

    const lang = roleData.language || 'es';
    const isAgent = roleData.role === 'agent';
    const isB001 = roleData.customer_id === 'B001' || roleData.agent_customer_id === 'B001';
    const isBrazil = roleData.country?.toLowerCase() === 'brasil' || roleData.country?.toLowerCase() === 'brazil';
    const isB001RelatedOrBrazilAgent = isB001 || (isAgent && isBrazil);

    // Format accepted date
    let acceptedDateStr = '-';
    if (roleData.terms_accepted_at) {
        const dateObj = new Date(roleData.terms_accepted_at);
        acceptedDateStr = dateObj.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    }

    // Generate PDF
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- Header (Logo) ---
      const logoMarkPath = path.join(process.cwd(), 'public', 'icons', 'logo-mark.png');
      const logoTextPath = path.join(process.cwd(), 'public', 'icons', 'logo-text.png');
      
      const headerY = 50;
      if (fs.existsSync(logoMarkPath) && fs.existsSync(logoTextPath)) {
        doc.image(logoMarkPath, 131, headerY, { width: 30 });
        doc.image(logoTextPath, 171, headerY + 4, { height: 22 });
      } else {
        doc.fontSize(20).font('Helvetica-Bold').text('JOGALIBRE', { align: 'center' });
      }

      doc.y = headerY + 45; // Move Y down past the logo
      doc.fontSize(16).font('Helvetica-Bold').text(
          lang === 'pt' ? 'Termos e Condições de Uso' : 'Términos y Condiciones de Uso', 
          { align: 'center' }
      );
      doc.moveDown(2);

      // --- Content ---
      doc.fontSize(10).font('Helvetica');
      const marginX = 50;
      
      const printItem = (num: string, title: string, text: string | string[]) => {
          doc.font('Helvetica-Bold').text(`${num}. ${title}`, marginX);
          doc.font('Helvetica');
          if (Array.isArray(text)) {
              text.forEach(p => {
                  doc.text(p, marginX + 15, doc.y, { width: 480 });
                  doc.moveDown(0.5);
              });
          } else {
              doc.text(text, marginX + 15, doc.y, { width: 480 });
          }
          doc.moveDown(1);
      };

      // Item 1
      const depositAmount = isAgent ? 'USD 500' : 'USD 100';
      printItem(
          '1', 
          lang === 'pt' ? 'Aceitação do Depósito' : 'Aceptación del Depósito',
          lang === 'pt' 
            ? `Para utilizar o sistema, é necessário um depósito de garantia (${depositAmount}). O valor será reembolsado integralmente no cancelamento da conta, desde que não haja pagamentos pendentes.`
            : `Para utilizar el sistema, se requiere un depósito de garantía (${depositAmount}). Se reembolsará en su totalidad al cancelar la cuenta, siempre que no haya pagos pendientes.`
      );

      // Item 2
      printItem(
          '2',
          lang === 'pt' ? 'Lances Não Canceláveis' : 'Ofertas No Cancelables',
          lang === 'pt'
            ? 'Devido às especificações do sistema do Japão, após o administrador efetuar o lance, não é possível cancelar, alterar ou realizar devoluções sob nenhuma circunstância.'
            : 'Debido a las especificaciones del sistema de Japón, una vez que el administrador ha realizado una oferta, no se puede cancelar, modificar ni realizar devoluciones bajo ninguna circunstancia.'
      );

      // Item 3
      printItem(
          '3',
          lang === 'pt' ? 'Prazo de Pagamento' : 'Plazo de Pago',
          lang === 'pt'
            ? 'Você deve concluir o pagamento utilizando o método selecionado e enviar o comprovante dentro de 2 dias após a arrematação do produto (compra confirmada). Se o prazo for excedido, a garantia será aplicada como multa e a conta será suspensa.'
            : 'Debe completar el pago utilizando el método seleccionado y enviar el comprobante dentro de los 2 días posteriores a la adjudicación del producto (compra confirmada). Si se excede el plazo, la garantía se aplicará como multa y se suspenderá la cuenta.'
      );

      // Item 4
      printItem(
          '4',
          lang === 'pt' ? 'Custos e Alfândega' : 'Gastos y Aduanas',
          lang === 'pt'
            ? 'Além do valor exibido, o frete internacional e os impostos de importação correm por conta do cliente. Além disso, o valor exibido antes de dar o lance não inclui o frete nacional no Japão, e o valor total pode aumentar devido à contraoferta do administrador.'
            : 'Además del monto mostrado, el envío internacional y los aranceles generados en la importación corren por cuenta del cliente. Asimismo, el monto mostrado antes de ofertar no incluye el envío nacional en Japón, y el monto total puede aumentar debido a la contraoferta del administrador.'
      );

      // Item 5
      printItem(
          '5',
          lang === 'pt' ? 'Compra no Estado Atual' : 'Compra en Estado Actual',
          lang === 'pt'
            ? 'Especialmente no caso de itens usados, você aceita que compreende os riscos de mau funcionamento, arranhões ou sujeira, e não realizará reclamações ou devoluções. Por favor, verifique bem o estado usando a tradução ou outros meios antes de fazer um lance. Os acidentes de envio serão regidos pelas normas da transportadora.'
            : 'Especialmente en el caso de artículos usados, usted acepta que comprende los riesgos de mal funcionamiento, arañazos o suciedad, y no realizará reclamaciones ni devoluciones. Por favor, verifique bien el estado utilizando la traducción u otros medios antes de realizar una oferta. En caso de accidentes durante el envío, se aplicarán las normas de la empresa de transporte.'
      );

      // Item 6 (Conditional)
      if (isB001RelatedOrBrazilAgent) {
          printItem(
              '6',
              lang === 'pt' ? 'Reconhecimento de Retirada Local e Isenção Aduaneira' : 'Reconocimiento de Retiro Local y Exención Aduanera',
              lang === 'pt' ? [
                  '1. O CLIENTE declara estar ciente de que a entrega das mercadorias intermediadas pela plataforma JOGALIBRE ocorrerá exclusivamente em território paraguaio, no endereço indicado no momento da retirada.',
                  '2. A responsabilidade da JOGALIBRE (FF GLOBAL NEGOCIOS E INTERMEDIAÇÕES) e de seus parceiros internacionais limita-se estritamente à disponibilização do produto no local de retirada acordado.',
                  '3. Toda e qualquer obrigação referente ao transporte transfronteiriço, trânsito aduaneiro, declaração de bagagem acompanhada e pagamento de tributos ou taxas perante a Receita Federal do Brasil (conforme a cota de isenção de tributos terrestres vigente) é de responsabilidade única, exclusiva e intransferível do CLIENTE.',
                  '4. A JOGALIBRE não se responsabiliza por eventuais retenções, apreensões, multas ou penalidades aplicadas pelas autoridades fiscais ou policiais na travessia da fronteira ou em território brasileiro.'
              ] : [
                  '1. EL CLIENTE declara estar consciente de que la entrega de las mercancías intermediadas por la plataforma JOGALIBRE ocurrirá exclusivamente en territorio paraguayo, en la dirección indicada al momento del retiro.',
                  '2. La responsabilidad de JOGALIBRE (FF GLOBAL NEGOCIOS E INTERMEDIAÇÕES) y de sus socios internacionales se limita estrictamente a la disponibilidad del producto en el lugar de retiro acordado.',
                  '3. Toda obligación referente al transporte transfronterizo, tránsito aduanero, declaración de equipaje acompañado y pago de tributos o tasas ante la Receita Federal de Brasil (conforme a la cuota de exención de tributos terrestres vigente) es de responsabilidad única, exclusiva e intransferible del CLIENTE.',
                  '4. JOGALIBRE no se responsabiliza por eventuales retenciones, incautaciones, multas o penalidades aplicadas por las autoridades fiscales o policiales en el cruce de la frontera o en territorio brasileño.'
              ]
          );
      }

      // --- Footer ---
      // Draw a line before footer
      const footerY = 730;
      doc.moveTo(50, footerY - 10).lineTo(545, footerY - 10).strokeColor('#cccccc').stroke();
      
      doc.y = footerY;
      doc.fillColor('#333333');
      doc.fontSize(9).font('Helvetica-Bold');
      const footerPrefix = lang === 'pt' ? 'Aceito em' : 'Aceptado el';
      const namePrefix = lang === 'pt' ? 'Nome' : 'Nombre';
      
      const customerName = roleData.name || roleData.given_name || '-';
      const customerId = roleData.customer_id || '-';

      doc.text(`${footerPrefix}: `, { continued: true }).font('Helvetica').text(`${acceptedDateStr}   |   `, { continued: true });
      doc.font('Helvetica-Bold').text(`ID: `, { continued: true }).font('Helvetica').text(`${customerId}   |   `, { continued: true });
      doc.font('Helvetica-Bold').text(`${namePrefix}: `, { continued: true }).font('Helvetica').text(customerName);

      doc.end();
    });

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="termos_jogalibre.pdf"'
      }
    });

  } catch (error) {
    console.error('Terms PDF generation error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
