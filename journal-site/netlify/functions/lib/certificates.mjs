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


function drawSeal(page, fonts, cx, cy) {
  // Vector journal seal: intentionally drawn in PDF so it stays crisp at print size.
  page.drawCircle({ x: cx, y: cy, size: 52, borderColor: C.navy, borderWidth: 2.2, color: C.cream });
  page.drawCircle({ x: cx, y: cy, size: 46, borderColor: C.gold, borderWidth: 0.9 });
  page.drawCircle({ x: cx, y: cy, size: 33, borderColor: C.pale, borderWidth: 0.8 });
  const sealTop = 'INTERNATIONAL JOURNAL';
  const sealBottom = 'SCIENCES & INNOVATION';
  page.drawText(sealTop, { x: cx - fonts.bold.widthOfTextAtSize(sealTop, 5.2) / 2, y: cy + 37, size: 5.2, font: fonts.bold, color: C.navy });
  page.drawText(sealBottom, { x: cx - fonts.bold.widthOfTextAtSize(sealBottom, 5.0) / 2, y: cy - 42, size: 5.0, font: fonts.bold, color: C.navy });
  // Simple paper/check emblem in the center.
  page.drawRectangle({ x: cx - 12, y: cy - 17, width: 24, height: 31, borderColor: C.blue, borderWidth: 1, color: C.white });
  page.drawLine({ start: { x: cx - 7, y: cy + 6 }, end: { x: cx + 7, y: cy + 6 }, thickness: 0.8, color: C.blue });
  page.drawLine({ start: { x: cx - 7, y: cy }, end: { x: cx + 7, y: cy }, thickness: 0.8, color: C.blue });
  page.drawLine({ start: { x: cx - 7, y: cy - 6 }, end: { x: cx + 4, y: cy - 6 }, thickness: 0.8, color: C.blue });
  page.drawLine({ start: { x: cx - 7, y: cy - 12 }, end: { x: cx + 7, y: cy - 12 }, thickness: 0.8, color: C.blue });
  page.drawLine({ start: { x: cx - 16, y: cy - 1 }, end: { x: cx - 12, y: cy - 5 }, thickness: 1.5, color: C.gold });
  page.drawLine({ start: { x: cx - 12, y: cy - 5 }, end: { x: cx - 6, y: cy + 3 }, thickness: 1.5, color: C.gold });
}

function drawVerificationBadge(page, fonts, { x, y, title, subtitle, accent = C.blue }) {
  page.drawRectangle({ x, y, width: 112, height: 30, color: C.white, borderColor: C.pale, borderWidth: 0.7 });
  page.drawCircle({ x: x + 13, y: y + 15, size: 8, color: accent });
  page.drawLine({ start: { x: x + 9, y: y + 15 }, end: { x: x + 12, y: y + 12 }, thickness: 1.1, color: C.white });
  page.drawLine({ start: { x: x + 12, y: y + 12 }, end: { x: x + 17, y: y + 19 }, thickness: 1.1, color: C.white });
  page.drawText(title, { x: x + 26, y: y + 17, size: 7.1, font: fonts.bold, color: C.navy });
  page.drawText(subtitle, { x: x + 26, y: y + 7, size: 5.4, font: fonts.regular, color: C.muted });
}

export async function generateCertificatePdf({ paper, certificate, verifyUrl }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  const authorName = certificate.authorName || paper.authors?.[certificate.authorIndex]?.name || 'Author';
  const coauthors = (paper.authors || [])
    .filter((_, index) => index !== certificate.authorIndex)
    .map((author) => author.name)
    .filter(Boolean)
    .join(', ');
  const journalName = process.env.JOURNAL_NAME || 'International Journal of Sciences and Innovation Engineering';
  const shortName = process.env.JOURNAL_SHORT_NAME || 'ijrise';
  const issn = process.env.JOURNAL_ISSN || '';
  [paper.title, authorName, coauthors, paper.id, certificate.certificateId, journalName, shortName, issn]
    .forEach((item) => checkFontText(item, fonts));

  // Wide landscape canvas, proportioned for a formal printed certificate.
  const page = pdf.addPage([1000, 700]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: C.cream });

  // Layered corner ribbons and fine double frame.
  page.drawEllipse({ x: width + 4, y: height + 2, xScale: 310, yScale: 150, borderColor: C.navy, borderWidth: 19, opacity: 0.98 });
  page.drawEllipse({ x: width - 8, y: height - 8, xScale: 270, yScale: 125, borderColor: C.blue, borderWidth: 8, opacity: 0.85 });
  page.drawEllipse({ x: -8, y: -8, xScale: 300, yScale: 135, borderColor: C.navy, borderWidth: 18, opacity: 0.98 });
  page.drawEllipse({ x: 5, y: 4, xScale: 255, yScale: 108, borderColor: C.blue, borderWidth: 7, opacity: 0.85 });
  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderColor: C.navy, borderWidth: 2.2 });
  page.drawRectangle({ x: 29, y: 29, width: width - 58, height: height - 58, borderColor: C.gold, borderWidth: 0.9 });
  page.drawLine({ start: { x: 48, y: 565 }, end: { x: 952, y: 565 }, thickness: 0.8, color: C.pale });
  page.drawLine({ start: { x: 48, y: 112 }, end: { x: 952, y: 112 }, thickness: 0.8, color: C.pale });

  // Circular seal and masthead.
  drawSeal(page, fonts, 112, 610);
  drawCentered(page, shortName, 620, fonts.bold, 52, C.navy, width);
  drawCentered(page, journalName.toUpperCase(), 580, fonts.bold, 14, C.blue, width);
  if (issn) {
    page.drawText(`ISSN: ${issn}`, { x: 48, y: 540, size: 9, font: fonts.bold, color: C.navy });
  }
  page.drawText(`Volume ${paper.volume || '—'}  ·  Issue ${paper.issue || '—'}`, { x: 48, y: 526, size: 7, font: fonts.regular, color: C.muted });

  // Right-side trust/verification panel. Claims are conditional on actual record data.
  drawVerificationBadge(page, fonts, { x: 840, y: 514, title: 'PUBLICATION', subtitle: 'JOURNAL RECORD', accent: C.blue });
  if (paper.doi) {
    drawVerificationBadge(page, fonts, { x: 840, y: 477, title: 'CROSSREF DOI', subtitle: String(paper.doi).slice(0, 22), accent: C.gold });
  }
  if (process.env.CERTIFICATE_SHOW_GOOGLE_SCHOLAR === 'true') {
    drawVerificationBadge(page, fonts, { x: 840, y: paper.doi ? 440 : 477, title: 'GOOGLE SCHOLAR', subtitle: 'INDEXING LISTING', accent: C.blue });
  }

  // Main certificate title and ornament.
  drawCentered(page, 'CERTIFICATE', 475, fonts.bold, 37, C.ink, width);
  page.drawLine({ start: { x: 365, y: 455 }, end: { x: 635, y: 455 }, thickness: 1.2, color: C.gold });
  page.drawCircle({ x: 500, y: 455, size: 3.2, color: C.gold });
  drawCentered(page, 'OF PUBLICATION', 435, fonts.bold, 12, C.blue, width);
  drawCentered(page, 'THIS IS TO CERTIFY THAT', 390, fonts.bold, 10, C.blue, width);

  const nameSize = Math.min(31, Math.max(19, 34 - authorName.length * 0.18));
  const nameLines = wrapText(authorName, fonts.bold, nameSize, 650).slice(0, 2);
  const nameY = 350;
  drawWrapped(page, authorName, { x: 175, y: nameY, maxWidth: 650, font: fonts.bold, size: nameSize, color: C.navy, lineHeight: nameSize * 1.22, maxLines: 2 });
  const afterName = nameY - nameLines.length * nameSize * 1.22 - 4;
  drawCentered(page, 'has authored the research paper entitled', afterName, fonts.regular, 12, C.muted, width);

  const titleSizeStart = paper.title.length > 150 ? 17 : paper.title.length > 95 ? 19 : 22;
  let titleSize = titleSizeStart;
  let titleLines = wrapText(paper.title, fonts.bold, titleSize, 690);
  while (titleLines.length > 3 && titleSize > 13) {
    titleSize -= 0.5;
    titleLines = wrapText(paper.title, fonts.bold, titleSize, 690);
  }
  const titleY = afterName - 43;
  drawWrapped(page, paper.title, { x: 155, y: titleY, maxWidth: 690, font: fonts.bold, size: titleSize, color: C.ink, lineHeight: titleSize * 1.3, maxLines: 3 });
  let contentBottom = titleY - Math.min(titleLines.length, 3) * titleSize * 1.3 - 14;

  if (coauthors) {
    const coauthorText = `Co-authors: ${coauthors}`;
    const coauthorLines = wrapText(coauthorText, fonts.regular, 8.5, 660);
    drawWrapped(page, coauthorText, { x: 170, y: contentBottom, maxWidth: 660, font: fonts.regular, size: 8.5, color: C.muted, lineHeight: 11, maxLines: 2 });
    contentBottom -= Math.min(coauthorLines.length, 2) * 11 + 7;
  }

  const publishedDate = paper.publishedAt ? new Date(paper.publishedAt) : new Date();
  const dateLabel = publishedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const volumeIssue = [paper.volume, paper.issue].filter(Boolean).join(' · ');
  drawCentered(page, `Published on ${dateLabel}${volumeIssue ? `  ·  ${volumeIssue}` : ''}`, Math.max(164, contentBottom), fonts.regular, 10, C.muted, width);
  drawCentered(page, `Paper ID: ${paper.id}`, 143, fonts.regular, 9, C.muted, width);

  // QR code remains tied to the supplied verification URL; no fake verification URL is created.
  if (verifyUrl) {
    const qr = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 220, margin: 1, errorCorrectionLevel: 'H' });
    const qrImage = await pdf.embedPng(qr);
    page.drawImage(qrImage, { x: 854, y: 48, width: 76, height: 76 });
    page.drawText('SCAN TO VERIFY', { x: 853, y: 38, size: 6.7, font: fonts.bold, color: C.blue });
  }

  // Signature is loaded from the transparent PNG asset supplied alongside this file.
  const signatureBytes = await optionalFile('EDITOR_SIGNATURE_PATH', 'public/brand/editor-signature.png');
  if (signatureBytes) {
    try {
      const signature = signatureBytes[0] === 0x89
        ? await pdf.embedPng(signatureBytes)
        : await pdf.embedJpg(signatureBytes);
      const dims = signature.scale(Math.min(126 / signature.width, 42 / signature.height));
      page.drawImage(signature, { x: 680, y: 66, width: dims.width, height: dims.height });
    } catch { /* optional signature image */ }
  }
  page.drawLine({ start: { x: 674, y: 63 }, end: { x: 812, y: 63 }, thickness: 0.8, color: C.navy });
  page.drawText(process.env.EDITOR_NAME || 'Editor in Chief', { x: 674, y: 48, size: 10, font: fonts.bold, color: C.navy });
  page.drawText(process.env.EDITOR_TITLE || 'ijrise Editorial Office', { x: 674, y: 35, size: 8, font: fonts.regular, color: C.muted });

  // Bottom-left gold award seal and certificate metadata.
  page.drawCircle({ x: 135, y: 68, size: 27, borderColor: C.gold, borderWidth: 2.2, color: C.cream });
  page.drawCircle({ x: 135, y: 68, size: 20, borderColor: C.pale, borderWidth: 1 });
  page.drawText('ijrise', { x: 119, y: 66, size: 9, font: fonts.bold, color: C.gold });
  page.drawLine({ start: { x: 121, y: 43 }, end: { x: 135, y: 23 }, thickness: 3, color: C.navy });
  page.drawLine({ start: { x: 149, y: 43 }, end: { x: 135, y: 23 }, thickness: 3, color: C.blue });
  page.drawText(`Certificate ID: ${certificate.certificateId}`, { x: 205, y: 76, size: 9, font: fonts.bold, color: C.navy });
  page.drawText('Digitally verifiable publication record', { x: 205, y: 61, size: 8, font: fonts.regular, color: C.muted });
  if (paper.doi) {
    page.drawText(`DOI: ${paper.doi}`, { x: 205, y: 47, size: 7.5, font: fonts.regular, color: C.muted });
  }

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
  page.drawText('ijrise · EDITORIAL OFFICE', { x: 52, y: height - 62, size: 11, font: fonts.bold, color: C.gold });
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
