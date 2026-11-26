// ============================================================
// IJROS CERTIFICATE & PAYMENT RECEIPT GENERATOR
// Theme: Forest Green + Cream + Brass (Matches Website)
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

// ------------------------------------------------------------
// IJROS BRAND PALETTE
// ------------------------------------------------------------
const C = {
  green: rgb(0.122, 0.302, 0.227),      // #1f4d3a (Primary)
  greenDark: rgb(0.086, 0.227, 0.169),  // #163a2b (Header/Left Band)
  greenSoft: rgb(0.910, 0.937, 0.914),  // #e8efe9 (Soft Background)
  cream: rgb(0.980, 0.969, 0.949),      // #faf7f2 (Page Background)
  creamDeep: rgb(0.953, 0.929, 0.894),  // #f3ede4 (Cards)
  brass: rgb(0.690, 0.553, 0.341),      // #b08d57 (Accent)
  brassSoft: rgb(0.937, 0.894, 0.827),  // #efe4d3 (Light Accent Text)
  ink: rgb(0.114, 0.145, 0.125),        // #1d2520 (Main Text)
  inkLight: rgb(0.310, 0.353, 0.329),   // #4f5a54 (Secondary Text)
  inkMuted: rgb(0.478, 0.522, 0.494),   // #7a857e (Muted Text)
  white: rgb(1, 1, 1),
  line: rgb(0.886, 0.867, 0.831)
};

// ------------------------------------------------------------
// FILE & IMAGE HELPERS
// ------------------------------------------------------------
async function optionalFile(envName, fallback) {
  const value = process.env[envName] || fallback;
  if (!value) return null;
  try {
    return await fs.readFile(path.resolve(process.cwd(), value));
  } catch {
    return null;
  }
}

async function loadImage(pdf, envVar, fallbackPath) {
  const bytes = await optionalFile(envVar, fallbackPath);
  if (!bytes) return null;
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch (error) {
    console.error(`Failed to embed image: ${envVar}`, error.message);
    return null;
  }
}

// ------------------------------------------------------------
// FONT LOADER & TEXT WRAPPING
// ------------------------------------------------------------
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
    throw new Error('A document contains non-Latin characters.');
  }
}

function wrapText(text, font, size, maxWidth) {
  const sourceWords = String(text || '').split(/\s+/).filter(Boolean);
  const words = [];
  for (const word of sourceWords) {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      words.push(word);
      continue;
    }
    let chunk = '';
    for (const character of Array.from(word)) {
      const candidate = chunk + character;
      if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        words.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) words.push(chunk);
  }
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(text, font, options) {
  const { maxWidth, maxHeight, maxSize, minSize = 8, lineHeightRatio = 1.25 } = options;
  for (let size = maxSize; size >= minSize; size = Math.round((size - 0.5) * 10) / 10) {
    const lines = wrapText(text, font, size, maxWidth);
    const lineHeight = size * lineHeightRatio;
    if (lines.length * lineHeight <= maxHeight) {
      return { lines, size, lineHeight };
    }
  }
  const size = minSize;
  const lines = wrapText(text, font, size, maxWidth);
  return { lines, size, lineHeight: size * lineHeightRatio };
}

function drawCentered(page, text, y, font, size, color, width = 1000) {
  const value = String(text ?? '');
  const textWidth = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: Math.max(25, (width - textWidth) / 2), y, size, font, color });
}

// ------------------------------------------------------------
// CUSTOM GRAPHICS
// ------------------------------------------------------------
function drawSeal(page, cx, cy, fonts) {
  // Outer solid circle
  page.drawCircle({ x: cx, y: cy, size: 54, color: C.white, borderColor: C.brass, borderWidth: 1.5 });
  // Inner dotted circle
  const radius = 44;
  const dots = 60;
  for (let i = 0; i < dots; i++) {
    const angle = (Math.PI * 2 * i) / dots;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    page.drawCircle({ x, y, size: 0.8, color: C.brass });
  }
  // Center text "IJ"
  const text = 'IJ';
  const textWidth = fonts.bold.widthOfTextAtSize(text, 38);
  page.drawText(text, { x: cx - textWidth / 2, y: cy - 13, size: 38, font: fonts.bold, color: C.greenDark });
}

// ============================================================
// 1. CERTIFICATE OF PUBLICATION (Forest Band Style)
// ============================================================
export async function generateCertificatePdf({ paper, certificate, verifyUrl }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);

  const authorName = certificate.authorName || paper.authors?.[certificate.authorIndex]?.name || 'Author';
  const journalName = process.env.JOURNAL_NAME || 'International Journal of Research and Open Science';
  const shortName = (process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase();
  const doi = paper.figshare?.doi || paper.doi || '';
  const website = process.env.JOURNAL_WEBSITE || 'ijros.com';

  [paper.title, authorName, paper.id, certificate.certificateId, journalName, shortName, doi].forEach(t => checkFontText(t, fonts));

  // Landscape layout: 1000 x 700
  const page = pdf.addPage([1000, 700]);

  // 1. Backgrounds
  page.drawRectangle({ x: 0, y: 0, width: 1000, height: 700, color: C.cream });
  
  // Left Forest Green Band (Width: 260)
  page.drawRectangle({ x: 0, y: 0, width: 260, height: 700, color: C.greenDark });

  // 2. Left Band Content
  drawSeal(page, 130, 520, fonts);

  drawCentered(page, shortName, 430, fonts.bold, 26, C.brass, 260);
  
  const indexing = [
    'PEER-REVIEWED',
    'OPEN ACCESS',
    'DOI VIA FIGSHARE',
    website
  ];
  let indexY = 380;
  indexing.forEach(text => {
    drawCentered(page, text, indexY, fonts.regular, 10, C.brassSoft, 260);
    indexY -= 22;
  });

  // 3. Right Area Content
  // QR Code (Top Right)
  if (verifyUrl) {
    const qr = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'H' });
    const qrImage = await pdf.embedPng(qr);
    page.drawImage(qrImage, { x: 880, y: 580, width: 70, height: 70 });
    drawCentered(page, 'SCAN TO VERIFY', 565, fonts.bold, 7, C.greenDark, 1000); // approximate center
  }

  // Journal Name Header
  const headerFit = fitText(journalName.toUpperCase(), fonts.bold, { maxWidth: 600, maxHeight: 20, maxSize: 11, minSize: 8 });
  headerFit.lines.forEach((line, i) => {
    page.drawText(line, { x: 320, y: 620 - (i * 14), size: headerFit.size, font: fonts.bold, color: C.inkMuted });
  });

  // Main Title
  page.drawText('Certificate of Publication', { x: 320, y: 540, size: 36, font: fonts.bold, color: C.greenDark });

  // Certify Text
  page.drawText('THIS IS TO CERTIFY THAT', { x: 320, y: 480, size: 10, font: fonts.bold, color: C.brass });

  // Author Name
  const nameFit = fitText(authorName, fonts.bold, { maxWidth: 620, maxHeight: 60, maxSize: 32, minSize: 18, lineHeightRatio: 1.1 });
  let currentY = 420;
  nameFit.lines.forEach((line) => {
    page.drawText(line, { x: 320, y: currentY, size: nameFit.size, font: fonts.bold, color: C.ink });
    currentY -= nameFit.lineHeight;
  });

  // Authored Text
  page.drawText('has authored the research paper entitled', { x: 320, y: currentY - 10, size: 12, font: fonts.regular, color: C.inkLight });

  // Paper Title (Bold, Italic)
  const titleFit = fitText(paper.title, fonts.bold, { maxWidth: 600, maxHeight: 80, maxSize: 18, minSize: 10, lineHeightRatio: 1.3 });
  let titleY = currentY - 50;
  titleFit.lines.forEach((line) => {
    page.drawText(line, { x: 320, y: titleY, size: titleFit.size, font: fonts.bold, color: C.ink });
    titleY -= titleFit.lineHeight;
  });

  // 4. Bottom Metadata Area
  const bottomY = 140;
  page.drawLine({ start: { x: 320, y: bottomY + 30 }, end: { x: 950, y: bottomY + 30 }, thickness: 0.5, color: C.brass });

  // Published Date & Volume/Issue
  const pubDate = paper.publishedAt ? new Date(paper.publishedAt) : new Date();
  const dateLabel = pubDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const volText = paper.volume ? (String(paper.volume).toLowerCase().startsWith('vol') ? paper.volume : `Volume ${paper.volume}`) : '';
  const issueText = paper.issue ? (String(paper.issue).toLowerCase().startsWith('issue') ? paper.issue : `Issue ${paper.issue}`) : '';
  const pubLine = [`Published ${dateLabel}`, volText, issueText].filter(Boolean).join(' · ');
  
  page.drawText(pubLine, { x: 320, y: bottomY, size: 10, font: fonts.regular, color: C.inkLight });

  // IDs
  page.drawText(`Certificate ID ${certificate.certificateId}`, { x: 320, y: bottomY - 20, size: 9, font: fonts.regular, color: C.inkMuted });
  page.drawText(`Paper ID ${paper.id}`, { x: 500, y: bottomY - 20, size: 9, font: fonts.regular, color: C.inkMuted });
  if (doi) {
    page.drawText(`DOI ${doi}`, { x: 320, y: bottomY - 36, size: 9, font: fonts.regular, color: C.greenDark });
  }

  // Editorial Office Sign-off (Bottom Right)
  page.drawLine({ start: { x: 800, y: bottomY + 10 }, end: { x: 950, y: bottomY + 10 }, thickness: 0.8, color: C.ink });
  page.drawText('Editorial Office', { x: 800, y: bottomY - 6, size: 10, font: fonts.bold, color: C.ink });
  page.drawText(`Editor, ${shortName}`, { x: 800, y: bottomY - 20, size: 9, font: fonts.regular, color: C.inkMuted });

  return Buffer.from(await pdf.save());
}

// ============================================================
// 2. PAYMENT RECEIPT (Matching Website Theme)
// ============================================================
export async function generatePaymentReceiptPdf({ paper, payment }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);

  const journalName = process.env.JOURNAL_NAME || 'International Journal of Research and Open Science';
  const shortName = (process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase();
  const issn = process.env.JOURNAL_ISSN || '';
  const contactEmail = process.env.JOURNAL_EMAIL || process.env.JOURNAL_CONTACT_EMAIL || process.env.EDITORIAL_INBOX || '';
  const website = process.env.JOURNAL_WEBSITE || '';

  [paper.title, paper.id, paper.submitterName, payment.utr].forEach(t => checkFontText(t, fonts));

  // Portrait A4: 595 x 842
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();

  // 1. Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: C.cream });

  // 2. Header Band
  const headerHeight = 160;
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: C.greenDark });
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: 2, color: C.brass });

  page.drawText(shortName, { x: 40, y: height - 60, size: 32, font: fonts.bold, color: C.white });
  page.drawText('International Journal', { x: 40, y: height - 80, size: 9, font: fonts.regular, color: C.brassSoft });
  
  page.drawText('PAYMENT RECEIPT', { x: 40, y: height - 125, size: 22, font: fonts.bold, color: C.white });
  page.drawText('Manual UPI payment confirmation · Official record', { x: 40, y: height - 145, size: 10, font: fonts.regular, color: C.brassSoft });

  const marginX = 40;
  const blockWidth = width - 80;
  let y = height - headerHeight - 30;

  // 3. Amount Block
  page.drawRectangle({ x: marginX, y: y - 80, width: blockWidth, height: 80, color: C.greenSoft, borderColor: C.green, borderWidth: 0.5 });
  page.drawText('AMOUNT RECEIVED', { x: marginX + 20, y: y - 25, size: 8, font: fonts.bold, color: C.greenDark });
  page.drawText(`INR ${Number(payment.amount || 0).toFixed(2)}`, { x: marginX + 20, y: y - 60, size: 26, font: fonts.bold, color: C.greenDark });

  // Verified Badge
  const badgeW = 130;
  const badgeH = 30;
  page.drawRectangle({ x: marginX + blockWidth - badgeW - 20, y: y - 55, width: badgeW, height: badgeH, color: C.green });
  const badgeText = 'PAYMENT VERIFIED';
  const badgeTextW = fonts.bold.widthOfTextAtSize(badgeText, 8);
  page.drawText(badgeText, { x: marginX + blockWidth - badgeW - 20 + (badgeW - badgeTextW) / 2, y: y - 45, size: 8, font: fonts.bold, color: C.white });

  y -= 110;

  // 4. Details Grid
  const drawField = (label, value, isMuted = false) => {
    page.drawText(label, { x: marginX, y, size: 9, font: fonts.bold, color: C.inkMuted });
    const lines = wrapText(String(value || '—'), fonts.regular, 11, blockWidth - 160);
    lines.forEach((line, i) => {
      page.drawText(line, { x: marginX + 160, y: y - (i * 14), size: 11, font: fonts.regular, color: isMuted ? C.inkMuted : C.ink });
    });
    y -= (lines.length * 14) + 14;
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  drawField('Receipt Reference', payment.receiptId || `RCPT-${paper.id}`);
  drawField('Paper ID', paper.id);
  drawField('Manuscript', paper.title);
  drawField('Payer', paper.submitterName || paper.authors?.[0]?.name || 'Author');
  drawField('UPI Reference (UTR)', payment.utr);
  drawField('Payment Submitted', formatDate(payment.submittedAt));
  drawField('Payment Verified', formatDate(payment.confirmedAt));
  drawField('Status', 'CONFIRMED BY EDITORIAL OFFICE', true);

  y -= 10;

  // 5. Note Box
  const noteText = 'This receipt confirms that the journal has marked the submitted UPI payment as received. Keep this document with your publication records. A receipt does not by itself constitute acceptance or publication of the manuscript.';
  const noteLines = wrapText(noteText, fonts.regular, 9, blockWidth - 40);
  const noteHeight = (noteLines.length * 13) + 24;

  page.drawRectangle({ x: marginX, y: y - noteHeight, width: blockWidth, height: noteHeight, color: C.creamDeep, borderColor: C.line, borderWidth: 0.5 });
  page.drawRectangle({ x: marginX, y: y - noteHeight, width: 3, height: noteHeight, color: C.brass });

  let noteY = y - 16;
  noteLines.forEach(line => {
    page.drawText(line, { x: marginX + 16, y: noteY, size: 9, font: fonts.regular, color: C.inkLight });
    noteY -= 13;
  });

  // 6. Footer
  const footerY = 50;
  page.drawLine({ start: { x: marginX, y: footerY + 30 }, end: { x: width - marginX, y: footerY + 30 }, thickness: 0.5, color: C.brass });

  page.drawText(journalName, { x: marginX, y: footerY + 12, size: 9, font: fonts.bold, color: C.greenDark });
  
  const contactParts = [];
  if (issn) contactParts.push(`ISSN ${issn}`);
  if (website) contactParts.push(website);
  if (contactEmail) contactParts.push(contactEmail);
  
  if (contactParts.length) {
    page.drawText(contactParts.join('   ·   '), { x: marginX, y: footerY - 4, size: 8, font: fonts.regular, color: C.inkMuted });
  }

  const stamp = `${shortName} · Generated ${new Date().toLocaleDateString('en-IN')}`;
  const stampW = fonts.regular.widthOfTextAtSize(stamp, 8);
  page.drawText(stamp, { x: width - marginX - stampW, y: footerY - 4, size: 8, font: fonts.regular, color: C.inkMuted });

  return Buffer.from(await pdf.save());
}