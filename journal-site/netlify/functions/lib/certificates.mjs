import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

const C = {
  navy: rgb(0.055, 0.105, 0.20),
  blue: rgb(0.10, 0.20, 0.38),
  gold: rgb(0.72, 0.56, 0.30),
  cream: rgb(0.985, 0.973, 0.935),
  ink: rgb(0.10, 0.12, 0.17),
  muted: rgb(0.36, 0.40, 0.46),
  pale: rgb(0.87, 0.83, 0.73),
  white: rgb(1, 1, 1)
};

async function optionalFile(envName, fallback) {
  const value = process.env[envName] || fallback;
  if (!value) return null;
  try { return await fs.readFile(path.resolve(process.cwd(), value)); }
  catch { return null; }
}

async function loadFonts(pdf) {
  const regularBytes = await optionalFile('CERTIFICATE_FONT_PATH', 'public/fonts/NotoSerif-Regular.ttf');
  const boldBytes = await optionalFile('CERTIFICATE_BOLD_FONT_PATH', 'public/fonts/NotoSerif-Bold.ttf');
  if (regularBytes) {
    pdf.registerFontkit(fontkit);
    const regular = await pdf.embedFont(regularBytes, { subset: true });
    const bold = boldBytes ? await pdf.embedFont(boldBytes, { subset: true }) : regular;
    return { regular, bold, unicode: true };
  }
  return {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    unicode: false
  };
}

function checkFontText(text, fonts) {
  if (!fonts.unicode && /[^\u0000-\u00ff]/u.test(String(text || ''))) {
    throw new Error('A certificate contains non-Latin characters. Run `npm run fonts:setup` to install the bundled Noto Serif font files, then redeploy and retry certificate generation. No characters were removed.');
  }
}

function wrapText(text, font, size, maxWidth) {
  const sourceWords = String(text || '').split(/\s+/).filter(Boolean);
  const words = [];
  for (const word of sourceWords) {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) { words.push(word); continue; }
    let chunk = '';
    for (const character of Array.from(word)) {
      const candidate = chunk + character;
      if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        words.push(chunk);
        chunk = character;
      } else chunk = candidate;
    }
    if (chunk) words.push(chunk);
  }
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCentered(page, text, y, font, size, color, width = 842) {
  checkFontText(text, { unicode: true });
  const textWidth = font.widthOfTextAtSize(String(text), size);
  page.drawText(String(text), { x: Math.max(32, (width - textWidth) / 2), y, size, font, color });
}

function drawWrapped(page, text, { x, y, maxWidth, font, size, color, lineHeight = size * 1.35, maxLines = 10, align = 'center' }) {
  const lines = wrapText(text, font, size, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    const width = font.widthOfTextAtSize(line, size);
    const lineX = align === 'center' ? x + (maxWidth - width) / 2 : x;
    page.drawText(line, { x: lineX, y: y - index * lineHeight, size, font, color });
  });
  return { lines, nextY: y - lines.length * lineHeight };
}

export async function generateCertificatePdf({ paper, certificate, verifyUrl }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  const authorName = certificate.authorName || paper.authors?.[certificate.authorIndex]?.name || 'Author';
  const coauthors = (paper.authors || []).filter((_, index) => index !== certificate.authorIndex).map((author) => author.name).filter(Boolean).join(', ');
  const required = [paper.title, authorName, coauthors, paper.id, certificate.certificateId, process.env.JOURNAL_NAME || 'International Journal of Sciences and Innovation Engineering'];
  required.forEach((item) => checkFontText(item, fonts));
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: C.cream });
  page.drawRectangle({ x: 15, y: 15, width: width - 30, height: height - 30, borderColor: C.navy, borderWidth: 2 });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: C.gold, borderWidth: 0.8 });
  page.drawRectangle({ x: 31, y: height - 83, width: width - 62, height: 1, color: C.pale });
  page.drawRectangle({ x: 31, y: 82, width: width - 62, height: 1, color: C.pale });

  const logoBytes = await optionalFile('JOURNAL_LOGO_PATH', 'public/brand/logo.png');
  if (logoBytes) {
    try {
      const image = logoBytes[0] === 0x89 ? await pdf.embedPng(logoBytes) : await pdf.embedJpg(logoBytes);
      const dims = image.scale(Math.min(52 / image.width, 52 / image.height));
      page.drawImage(image, { x: 52, y: height - 73, width: dims.width, height: dims.height });
    } catch { /* optional branding image */ }
  }

  const journalName = process.env.JOURNAL_NAME || 'International Journal of Sciences and Innovation Engineering';
  const shortName = process.env.JOURNAL_SHORT_NAME || 'IJSCI';
  drawCentered(page, shortName, 525, fonts.bold, 15, C.navy);
  drawCentered(page, journalName.toUpperCase(), 503, fonts.bold, 10, C.blue);
  const issn = process.env.JOURNAL_ISSN;
  if (issn) drawCentered(page, `ISSN: ${issn}`, 486, fonts.regular, 8.5, C.muted);

  drawCentered(page, 'CERTIFICATE OF PUBLICATION', 438, fonts.bold, 25, C.ink);
  page.drawLine({ start: { x: 270, y: 424 }, end: { x: 572, y: 424 }, thickness: 1.2, color: C.gold });
  drawCentered(page, 'THIS IS TO CERTIFY THAT', 393, fonts.bold, 9, C.blue);

  const nameSize = Math.min(27, Math.max(18, 33 - authorName.length * 0.22));
  const nameLines = wrapText(authorName, fonts.bold, nameSize, 560);
  drawWrapped(page, authorName, { x: 141, y: 356, maxWidth: 560, font: fonts.bold, size: nameSize, color: C.navy, lineHeight: nameSize * 1.25, maxLines: 2 });
  const afterName = 356 - nameLines.length * nameSize * 1.25;
  drawCentered(page, 'has authored the research paper entitled', afterName - 12, fonts.regular, 11, C.muted);

  let titleSize = 16;
  let titleLines = wrapText(paper.title, fonts.bold, titleSize, 590);
  while (titleLines.length > 6 && titleSize > 8) {
    titleSize -= 0.5;
    titleLines = wrapText(paper.title, fonts.bold, titleSize, 590);
  }
  const titleStartY = afterName - 46;
  drawWrapped(page, paper.title, { x: 126, y: titleStartY, maxWidth: 590, font: fonts.bold, size: titleSize, color: C.ink, lineHeight: titleSize * 1.25, maxLines: 6 });
  let y = titleStartY - Math.min(titleLines.length, 6) * titleSize * 1.25 - 12;

  const coauthorLines = coauthors ? wrapText(`Co-authors: ${coauthors}`, fonts.regular, 7.5, 560) : [];
  if (coauthorLines.length) {
    drawWrapped(page, `Co-authors: ${coauthors}`, { x: 141, y, maxWidth: 560, font: fonts.regular, size: 7.5, color: C.muted, lineHeight: 9, maxLines: 3 });
    y -= Math.min(coauthorLines.length, 3) * 9 + 7;
  }

  const publishedDate = paper.publishedAt ? new Date(paper.publishedAt) : new Date();
  const dateLabel = publishedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
  drawCentered(page, `Published on ${dateLabel}  ·  ${paper.volume || ''} ${paper.issue || ''}`.trim(), Math.max(142, y), fonts.regular, 9, C.muted);
  drawCentered(page, `Paper ID: ${paper.id}`, 124, fonts.regular, 8.5, C.muted);
  if (paper.doi) drawCentered(page, `DOI: ${paper.doi}`, 111, fonts.regular, 7.5, C.muted);

  const qr = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 160, margin: 1, errorCorrectionLevel: 'M' });
  const qrImage = await pdf.embedPng(qr);
  page.drawImage(qrImage, { x: 694, y: 38, width: 70, height: 70 });
  page.drawText('SCAN TO VERIFY', { x: 684, y: 29, size: 6.5, font: fonts.bold, color: C.blue });

  const signatureBytes = await optionalFile('EDITOR_SIGNATURE_PATH', 'public/brand/editor-signature.png');
  if (signatureBytes) {
    try {
      const signature = signatureBytes[0] === 0x89 ? await pdf.embedPng(signatureBytes) : await pdf.embedJpg(signatureBytes);
      const dims = signature.scale(Math.min(92 / signature.width, 32 / signature.height));
      page.drawImage(signature, { x: 96, y: 56, width: dims.width, height: dims.height });
    } catch { /* optional signature image */ }
  }
  page.drawLine({ start: { x: 92, y: 54 }, end: { x: 236, y: 54 }, thickness: 0.7, color: C.navy });
  page.drawText(process.env.EDITOR_NAME || 'Editorial Office', { x: 92, y: 40, size: 9, font: fonts.bold, color: C.navy });
  page.drawText(process.env.EDITOR_TITLE || 'Editor', { x: 92, y: 28, size: 8, font: fonts.regular, color: C.muted });

  page.drawText(`Certificate ID: ${certificate.certificateId}`, { x: 276, y: 42, size: 8, font: fonts.bold, color: C.navy });
  page.drawText('Digitally verifiable publication record', { x: 282, y: 28, size: 7.5, font: fonts.regular, color: C.muted });

  return Buffer.from(await pdf.save());
}

export async function generatePaymentReceiptPdf({ paper, payment }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  [paper.title, paper.id, paper.submitterName, paper.authors?.[0]?.name, payment.utr].forEach((item) => checkFontText(item, fonts));
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: C.white });
  page.drawRectangle({ x: 26, y: 26, width: width - 52, height: height - 52, borderColor: C.navy, borderWidth: 1.4 });
  page.drawRectangle({ x: 26, y: height - 170, width: width - 52, height: 144, color: C.navy });
  page.drawText('IJSCI · EDITORIAL OFFICE', { x: 52, y: height - 62, size: 11, font: fonts.bold, color: C.gold });
  page.drawText('PAYMENT RECEIPT', { x: 52, y: height - 111, size: 27, font: fonts.bold, color: C.white });
  page.drawText('Manual UPI payment confirmation', { x: 54, y: height - 137, size: 10, font: fonts.regular, color: C.white });
  const fields = [
    ['Receipt reference', payment.receiptId || `RCPT-${paper.id}`],
    ['Paper ID', paper.id],
    ['Manuscript', paper.title],
    ['Payer / submitting author', paper.submitterName || paper.authors?.[0]?.name || 'Author'],
    ['Amount received', `INR ${Number(payment.amount || 0).toFixed(2)}`],
    ['UPI transaction reference (UTR)', payment.utr],
    ['Payment submitted', payment.submittedAt ? new Date(payment.submittedAt).toLocaleString('en-IN') : ''],
    ['Payment verified', payment.confirmedAt ? new Date(payment.confirmedAt).toLocaleString('en-IN') : ''],
    ['Verification status', 'CONFIRMED BY EDITORIAL OFFICE']
  ];
  let y = height - 220;
  for (const [label, value] of fields) {
    page.drawText(String(label), { x: 54, y, size: 9, font: fonts.bold, color: C.muted });
    const lines = wrapText(String(value || ''), fonts.regular, 10, 455);
    lines.slice(0, 2).forEach((line, index) => page.drawText(line, { x: 54, y: y - 17 - index * 13, size: 10, font: fonts.regular, color: C.ink }));
    y -= 52;
  }
  page.drawText('This receipt confirms that the journal marked the submitted UPI payment as received.', { x: 54, y: 104, size: 8.5, font: fonts.regular, color: C.muted });
  page.drawText('Keep this receipt with your publication records.', { x: 54, y: 88, size: 8.5, font: fonts.regular, color: C.muted });
  page.drawText(process.env.JOURNAL_NAME || 'International Journal of Sciences and Innovation Engineering', { x: 54, y: 56, size: 8, font: fonts.bold, color: C.navy });
  return Buffer.from(await pdf.save());
}
