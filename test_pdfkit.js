const PDFDocument = require('pdfkit');
const fs = require('fs');

try {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(fs.createWriteStream('output.pdf'));
  doc.fontSize(20).font('Helvetica-Bold').text('JOGALIBRE', { align: 'center' });
  doc.end();
  console.log('Success');
} catch(e) {
  console.error('Error:', e);
}
