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
      doc.moveDown(1);

      // Receipt Info
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Recibo N°: `, { continued: true }).font('Helvetica').text(data.receiptNumber);
      doc.fontSize(10);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Data de Emissão: `, { continued: true }).font('Helvetica').text(new Date().toLocaleDateString('pt-BR'));
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Data do Pagamento: `, { continued: true }).font('Helvetica').text(data.paymentDate);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(`Método: `, { continued: true }).font('Helvetica').text(data.paymentMethod);
      doc.moveDown(0.5);

      // Customer Info
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').text('DADOS DO CLIENTE');
      doc.fontSize(10);
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
      doc.moveDown(0.5);

      // Breakdown
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').text('DESCRIÇÃO');
      doc.fontSize(10);
      doc.moveDown(0.5);

      if (data.items && data.items.length > 0) {
        data.items.forEach((item, index) => {
          const startY = doc.y;
          doc.y += 10;
          doc.x = 60; // Indent inside box

          doc.font('Helvetica-Bold').text(`N° de stock: `, { continued: true }).font('Helvetica').text(item.stockNumber || '-');
          doc.moveDown(0.5);
          
          let pTitle = item.productTitlePt || 'Produto';
          if (pTitle.length > 70) pTitle = pTitle.substring(0, 70) + '...';
          doc.font('Helvetica-Bold').text(`Nome do Produto: `, { continued: true }).font('Helvetica').text(pTitle);
          doc.moveDown(0.5);
          
          // Print price on the next line, right aligned
          doc.font('Helvetica').text(`Valor: R$ ${item.amountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, doc.y, { align: 'right', width: 475 });
          
          doc.moveDown(0.5);
          const endY = doc.y + 5;
          doc.rect(50, startY, 495, endY - startY).stroke();

          doc.x = 50; // Reset X
          doc.y = endY + 8; // Space between items
        });
      }
      doc.moveDown(0.5);

      // Totals Box
      const totalsStartY = doc.y;
      doc.y += 10;
      
      doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
      doc.text(`TOTAL PAGO: R$ ${data.totalAmountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, doc.y, { align: 'right', width: 475 });
      
      doc.moveDown(0.5);
      
      // Dashed line below TOTAL PAGO
      doc.moveTo(60, doc.y).lineTo(535, doc.y).dash(5, { space: 5 }).stroke();
      doc.undash(); // Reset to solid line for future strokes
      doc.moveDown(0.5);

      doc.x = 60; // Indent inside box

      // Line A
      doc.font('Helvetica-Bold').fontSize(10).text(`Taxa de Serviço do Sistema (Intermediação):`, { continued: false });
      const feeY = doc.y - doc.currentLineHeight();
      doc.font('Helvetica').text(`R$ ${data.systemFeeBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, feeY, { align: 'right', width: 475 });
      doc.x = 60;
      doc.fontSize(8).fillColor('gray').text('* Uma Nota Fiscal de Serviços (NFS-e) referente a este valor será emitida separadamente.');
      doc.fillColor('black').fontSize(10).moveDown(0.5);

      // Line B
      doc.font('Helvetica-Bold').text(`Repasse de Valores de Terceiros (Custo de Produtos):`, { continued: false });
      const repasseY = doc.y - doc.currentLineHeight();
      doc.font('Helvetica').text(`R$ ${data.thirdPartyRepasseBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, repasseY, { align: 'right', width: 475 });
      
      doc.moveDown(0.5);
      const totalsEndY = doc.y + 10;
      doc.rect(50, totalsStartY, 495, totalsEndY - totalsStartY).stroke();
      
      doc.x = 50;
      doc.y = totalsEndY + 10;

      // Footer
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text('Este documento serve como comprovante de repasse de valores e pagamento de taxa de serviço de intermediação, não substituindo a Nota Fiscal de Serviço (NFS-e) que será enviada posteriormente.', { align: 'left' });

      doc.end();

    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
}
