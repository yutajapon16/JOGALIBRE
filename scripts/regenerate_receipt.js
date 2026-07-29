const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function generateAndUploadReceipt(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(buffers);
        const fileName = `recibo_${data.receiptNumber}_${Date.now()}.pdf`;

        try {
          const { error } = await supabaseAdmin.storage
            .from('receipts')
            .upload(fileName, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: false
            });

          if (error) {
            console.error('Failed to upload receipt:', error);
            resolve(null);
            return;
          }

          const { data: publicUrlData } = supabaseAdmin.storage
            .from('receipts')
            .getPublicUrl(fileName);

          resolve(publicUrlData.publicUrl);
        } catch (err) {
          console.error('Storage error:', err);
          resolve(null);
        }
      });

      // --- PDF Drawing ---
      
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
      doc.fontSize(14).font('Helvetica').text('Recibo de Intermediação e Repasse', { align: 'center' });
      doc.moveDown(2);

      // Receipt Info
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Recibo N°: `, { continued: true }).font('Helvetica').text(data.receiptNumber);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Data de Emissão: `, { continued: true }).font('Helvetica').text(new Date().toLocaleDateString('pt-BR'));
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Data do Pagamento: `, { continued: true }).font('Helvetica').text(data.paymentDate);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Método: `, { continued: true }).font('Helvetica').text(data.paymentMethod);
      doc.moveDown(2);

      // Customer Info
      doc.font('Helvetica-Bold').text('DADOS DO CLIENTE');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`ID do Cliente: `, { continued: true }).font('Helvetica').text(data.customerId || '-');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Nome: `, { continued: true }).font('Helvetica').text(data.customerName || '-');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`CPF / CNPJ: `, { continued: true }).font('Helvetica').text(data.customerCpfCnpj || '-');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Telefone: `, { continued: true }).font('Helvetica').text(data.customerPhone || '-');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`E-mail: `, { continued: true }).font('Helvetica').text(data.customerEmail || '-');
      doc.moveDown(2);

      // Breakdown
      doc.font('Helvetica-Bold').text('DESCRIÇÃO');
      doc.moveDown(0.5);

      if (data.items && data.items.length > 0) {
        data.items.forEach((item, index) => {
          doc.font('Helvetica-Bold').text(`N° de stock: `, { continued: true }).font('Helvetica').text(item.stockNumber || '-');
          doc.moveDown(0.5);
          
          doc.font('Helvetica-Bold').text(`Nome do Produto: `, { continued: true }).font('Helvetica').text(item.productTitlePt || 'Produto', { width: 350 });
          
          const priceY = doc.y - doc.currentLineHeight();
          doc.font('Helvetica').text(`Valor: R$ ${item.amountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 50, priceY, { align: 'right' });
          
          doc.x = 50; // Reset X
          doc.moveDown(1.5);
        });
      }
      doc.moveDown(1);

      // Total
      const boxY = doc.y;
      doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
      doc.text(`TOTAL PAGO: R$ ${data.totalAmountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 50, boxY + 8, { align: 'right', width: 495 });
      
      doc.y = boxY + 35; // Reset Y below the total line
      doc.x = 50; // Reset X

      // Line A
      doc.font('Helvetica-Bold').fontSize(10).text(`Taxa de Serviço do Sistema (Intermediação):`, { continued: false });
      const feeY = doc.y - doc.currentLineHeight();
      doc.font('Helvetica').text(`R$ ${data.systemFeeBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 50, feeY, { align: 'right' });
      doc.x = 50;
      doc.fontSize(8).fillColor('gray').text('* Uma Nota Fiscal de Serviços (NFS-e) referente a este valor será emitida separadamente.');
      doc.fillColor('black').fontSize(10).moveDown(0.5);

      // Line B
      doc.font('Helvetica-Bold').text(`Repasse de Valores de Terceiros (Custo de Produtos):`, { continued: false });
      const repasseY = doc.y - doc.currentLineHeight();
      doc.font('Helvetica').text(`R$ ${data.thirdPartyRepasseBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 50, repasseY, { align: 'right' });
      doc.x = 50;
      doc.moveDown(3);

      // Footer
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text('Este documento serve como comprovante de repasse de valores e pagamento de taxa de serviço de intermediação, não substituindo a Nota Fiscal de Serviço (NFS-e) que será enviada posteriormente.', { align: 'center' });

      doc.end();

    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
}

async function main() {
  const { data: items } = await supabaseAdmin
    .from('bid_requests')
    .select('id, total_jpy, customer_email, customer_name, final_price, customer_id, japan_send_usd, product_title_pt, stock_number')
    .in('stock_number', ['A003S009', 'A003S010', 'A003S009']);

  if (!items || items.length === 0) return console.log('No items found');

  const paymentValue = 5390.00;
  
  // Calculate exactExchangeRate
  const totalUsdPrice = items.reduce((sum, item) => sum + (Number(item.final_price) || 0), 0);
  
  let baseRate = paymentValue / totalUsdPrice;
  let exactExchangeRate = baseRate;

  for (let r = baseRate - 0.1; r <= baseRate + 0.1; r += 0.0001) {
    const testSum = items.reduce((sum, item) => {
      const p = item.final_price || 0;
      return sum + Math.ceil((p * r) / 10) * 10;
    }, 0);
    
    if (testSum === paymentValue) {
      exactExchangeRate = r;
      break;
    }
  }

  let customerId = items[0].customer_id || '';
  let customerCpf = '';
  let customerPhone = '';
  if (items[0].customer_email) {
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('customer_id, cpf, whatsapp')
      .eq('email', items[0].customer_email)
      .single();
    if (userRole) {
      if (!customerId && userRole.customer_id) customerId = userRole.customer_id;
      customerCpf = userRole.cpf || '';
      customerPhone = userRole.whatsapp || '';
    }
  }

  let thirdPartyRepasseBrl = 0;
  
  const receiptItems = items.map(item => {
    const p = Number(item.final_price) || 0;
    const roundedBrl = Math.ceil((p * exactExchangeRate) / 10) * 10;
    const itemEffectiveRate = p > 0 ? roundedBrl / p : exactExchangeRate;
    const itemRepasse = (Number(item.japan_send_usd) || 0) * itemEffectiveRate;
    thirdPartyRepasseBrl += itemRepasse;
    
    return {
      stockNumber: item.stock_number || '',
      productTitlePt: item.product_title_pt || '',
      amountBrl: roundedBrl
    };
  });

  const systemFeeBrl = paymentValue - thirdPartyRepasseBrl;

  const receiptData = {
    receiptNumber: '9D6RAFGF',
    totalAmountBrl: paymentValue,
    systemFeeBrl,
    thirdPartyRepasseBrl,
    customerName: items[0].customer_name || '-',
    customerEmail: items[0].customer_email || '-',
    customerId,
    customerPhone,
    customerCpfCnpj: customerCpf,
    paymentDate: '29/07/2026',
    paymentMethod: 'PIX',
    items: receiptItems
  };

  const url = await generateAndUploadReceipt(receiptData);
  console.log('Regenerated PDF URL:', url);
}

main();
