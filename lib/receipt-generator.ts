import PDFDocument from 'pdfkit';
import { supabaseAdmin } from './supabase-admin';

interface ReceiptData {
  receiptNumber: string;
  customerId: string;
  customerName: string;
  customerCpfCnpj?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentDate: string;
  totalAmountBrl: number;
  systemFeeBrl: number; // Line A
  thirdPartyRepasseBrl: number; // Line B
  paymentMethod: string;
  items: {
    stockNumber: string;
    productTitlePt: string;
    amountBrl: number;
  }[];
}

export async function generateAndUploadReceipt(data: ReceiptData): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

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
      
      // Header
      const fs = require('fs');
      const path = require('path');
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
          
          // Print price on the same Y line where the product title ended (or wrapped to)
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
