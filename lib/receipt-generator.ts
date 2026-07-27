import PDFDocument from 'pdfkit';
import { supabaseAdmin } from './supabase-admin';

interface ReceiptData {
  receiptNumber: string;
  customerName: string;
  customerCpfCnpj?: string;
  paymentDate: string;
  totalAmountBrl: number;
  systemFeeBrl: number; // Line A
  thirdPartyRepasseBrl: number; // Line B
  paymentMethod: string;
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
      doc.fontSize(20).font('Helvetica-Bold').text('JOGALIBRE', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text('Recibo de Intermediação e Repasse', { align: 'center' });
      doc.moveDown(2);

      // Receipt Info
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Recibo N°: `, { continued: true }).font('Helvetica').text(data.receiptNumber);
      doc.font('Helvetica-Bold').text(`Data de Emissão: `, { continued: true }).font('Helvetica').text(new Date().toLocaleDateString('pt-BR'));
      doc.font('Helvetica-Bold').text(`Data do Pagamento: `, { continued: true }).font('Helvetica').text(data.paymentDate);
      doc.font('Helvetica-Bold').text(`Método: `, { continued: true }).font('Helvetica').text(data.paymentMethod);
      doc.moveDown(1.5);

      // Customer Info
      doc.font('Helvetica-Bold').text('DADOS DO CLIENTE');
      doc.font('Helvetica').text(`Nome: ${data.customerName}`);
      if (data.customerCpfCnpj) {
        doc.text(`CPF/CNPJ: ${data.customerCpfCnpj}`);
      }
      doc.moveDown(1.5);

      // Break down
      doc.font('Helvetica-Bold').text('DISCRIMINAÇÃO DOS VALORES');
      doc.moveDown(0.5);

      // Line A
      doc.font('Helvetica-Bold').text(`[A] Taxa de Serviço do Sistema (Intermediação): `, { continued: true })
         .font('Helvetica').text(`R$ ${data.systemFeeBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      doc.fontSize(8).fillColor('gray').text('* Uma Nota Fiscal de Serviços (NFS-e) referente a este valor será emitida separadamente.');
      doc.fillColor('black').fontSize(10).moveDown(0.5);

      // Line B
      doc.font('Helvetica-Bold').text(`[B] Repasse de Valores de Terceiros (Custo de Produtos): `, { continued: true })
         .font('Helvetica').text(`R$ ${data.thirdPartyRepasseBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      doc.moveDown(1.5);

      // Total
      doc.rect(50, doc.y, 495, 30).fillAndStroke('#f3f4f6', '#e5e7eb');
      doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
      doc.text(`TOTAL PAGO: R$ ${data.totalAmountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, doc.y - 20, { align: 'right', width: 475 });
      
      // Footer
      doc.moveDown(5);
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text('Este documento serve como comprovante de repasse de valores e pagamento de taxa de serviço de intermediação, não substituindo a Nota Fiscal de Serviço (NFS-e) que será enviada posteriormente.', { align: 'center' });

      doc.end();

    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
}
