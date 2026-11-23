
// ============================================================
// IJSCI / IJRISE CERTIFICATE & PAYMENT RECEIPT GENERATOR
// Complete Netlify ES Module
//
// Dependencies:
// pdf-lib, @pdf-lib/fontkit, qrcode
//
// Exports:
// 1. generateCertificatePdf()
// 2. generatePaymentReceiptPdf()
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
// COLOR PALETTE
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// FILE HELPERS
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

// ------------------------------------------------------------
// FONT LOADER
// ------------------------------------------------------------

async function loadFonts(pdf) {
  const regularBytes = await optionalFile(
    'CERTIFICATE_FONT_PATH',
    'public/fonts/NotoSerif-Regular.ttf'
  );

  const boldBytes = await optionalFile(
    'CERTIFICATE_BOLD_FONT_PATH',
    'public/fonts/NotoSerif-Bold.ttf'
  );

  if (regularBytes) {
    pdf.registerFontkit(fontkit);

    const regular = await pdf.embedFont(regularBytes, {
      subset: true
    });

    const bold = boldBytes
      ? await pdf.embedFont(boldBytes, { subset: true })
      : regular;

    return {
      regular,
      bold,
      unicode: true
    };
  }

  return {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    unicode: false
  };
}

function checkFontText(text, fonts) {
  if (
    !fonts.unicode &&
    /[^\u0000-\u00ff]/u.test(String(text || ''))
  ) {
    throw new Error(
      'A certificate contains non-Latin characters. ' +
      'Run npm run fonts:setup to install Noto Serif fonts. ' +
      'No characters were removed.'
    );
  }
}

// ------------------------------------------------------------
// TEXT WRAPPING
// ------------------------------------------------------------

function wrapText(text, font, size, maxWidth) {
  const sourceWords = String(text || '')
    .split(/\s+/)
    .filter(Boolean);

  const words = [];

  for (const word of sourceWords) {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      words.push(word);
      continue;
    }

    let chunk = '';

    for (const character of Array.from(word)) {
      const candidate = chunk + character;

      if (
        chunk &&
        font.widthOfTextAtSize(candidate, size) > maxWidth
      ) {
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
    const candidate = line
      ? `${line} ${word}`
      : word;

    if (
      font.widthOfTextAtSize(candidate, size) <= maxWidth ||
      !line
    ) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);

  return lines;
}

// Automatically select a readable font size.
function fitText(text, font, options) {
  const {
    maxWidth,
    maxHeight,
    maxSize,
    minSize = 8,
    lineHeightRatio = 1.25
  } = options;

  for (
    let size = maxSize;
    size >= minSize;
    size = Math.round((size - 0.5) * 10) / 10
  ) {
    const lines = wrapText(text, font, size, maxWidth);
    const lineHeight = size * lineHeightRatio;

    if (lines.length * lineHeight <= maxHeight) {
      return { lines, size, lineHeight };
    }
  }

  const size = minSize;
  const lines = wrapText(text, font, size, maxWidth);

  return {
    lines,
    size,
    lineHeight: size * lineHeightRatio
  };
}

// ------------------------------------------------------------
// DRAWING HELPERS
// ------------------------------------------------------------

function drawCentered(page, text, y, font, size, color, width = 842) {
  const value = String(text ?? '');
  const textWidth = font.widthOfTextAtSize(value, size);

  page.drawText(value, {
    x: Math.max(25, (width - textWidth) / 2),
    y,
    size,
    font,
    color
  });
}

function drawTextLines(page, lines, options) {
  const {
    centerX = 500,
    x,
    y,
    font,
    size,
    color,
    lineHeight = size * 1.3
  } = options;

  lines.forEach((line, index) => {
    const lineY = y - index * lineHeight;

    if (typeof x === 'number') {
      page.drawText(String(line), {
        x,
        y: lineY,
        font,
        size,
        color
      });
    } else {
      drawCentered(
        page,
        line,
        lineY,
        font,
        size,
        color,
        centerX * 2
      );
    }
  });

  return y - lines.length * lineHeight;
}

// ------------------------------------------------------------
// PROFESSIONAL CIRCULAR IJSCI SEAL
// ------------------------------------------------------------

function drawArcText(page, text, options) {
  const {
    cx,
    cy,
    radius,
    font,
    size,
    color,
    position = 'top'
  } = options;

  const characters = Array.from(String(text));

  const gap = 0.35;

  const widths = characters.map(
    character =>
      font.widthOfTextAtSize(character, size) + gap
  );

  const totalWidth = widths.reduce(
    (sum, value) => sum + value,
    0
  );

  let cursor = -totalWidth / 2;

  characters.forEach((character, index) => {
    const midpoint = cursor + widths[index] / 2;

    const angle = position === 'top'
      ? Math.PI / 2 - midpoint / radius
      : -Math.PI / 2 + midpoint / radius;

    const rotation = position === 'top'
      ? angle * 180 / Math.PI - 90
      : angle * 180 / Math.PI + 90;

    if (character.trim()) {
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      const charWidth = font.widthOfTextAtSize(
        character,
        size
      );

      page.drawText(character, {
        x: x - charWidth / 2,
        y: y - size * 0.35,
        font,
        size,
        color,
        rotate: degrees(rotation)
      });
    }

    cursor += widths[index];
  });
}

function drawIJSCISeal(page, fonts, cx, cy) {
  // Outer seal
  page.drawCircle({
    x: cx,
    y: cy,
    size: 48,
    color: C.white,
    borderColor: C.navy,
    borderWidth: 2
  });

  // Gold border
  page.drawCircle({
    x: cx,
    y: cy,
    size: 42,
    borderColor: C.gold,
    borderWidth: 0.9
  });

  // Inner ring
  page.drawCircle({
    x: cx,
    y: cy,
    size: 27,
    borderColor: C.pale,
    borderWidth: 0.8
  });

  // Proper circular wording
  drawArcText(page, 'INTERNATIONAL JOURNAL', {
    cx,
    cy,
    radius: 35,
    font: fonts.bold,
    size: 4.2,
    color: C.navy,
    position: 'top'
  });

  drawArcText(page, 'SCIENCES & INNOVATION ENGINEERING', {
    cx,
    cy,
    radius: 35,
    font: fonts.bold,
    size: 3.6,
    color: C.navy,
    position: 'bottom'
  });

  // Center document emblem
  page.drawRectangle({
    x: cx - 10,
    y: cy - 12,
    width: 20,
    height: 24,
    color: C.cream,
    borderColor: C.blue,
    borderWidth: 0.9
  });

  for (let i = 0; i < 3; i++) {
    const y = cy + 5 - i * 5;

    page.drawLine({
      start: { x: cx - 6, y },
      end: { x: cx + 6, y },
      thickness: 0.7,
      color: C.blue
    });
  }

  // Gold verification tick
  page.drawLine({
    start: { x: cx - 5, y: cy - 8 },
    end: { x: cx - 1, y: cy - 12 },
    thickness: 1.3,
    color: C.gold
  });

  page.drawLine({
    start: { x: cx - 1, y: cy - 12 },
    end: { x: cx + 7, y: cy - 4 },
    thickness: 1.3,
    color: C.gold
  });
}

// ------------------------------------------------------------
// CERTIFICATE BORDER
// ------------------------------------------------------------

function drawCertificateBorders(page) {
  // Main navy border
  page.drawRectangle({
    x: 18,
    y: 18,
    width: 964,
    height: 664,
    borderColor: C.navy,
    borderWidth: 2
  });

  // Inner gold border
  page.drawRectangle({
    x: 28,
    y: 28,
    width: 944,
    height: 644,
    borderColor: C.gold,
    borderWidth: 0.8
  });

  const m = 40;
  const length = 24;
  const color = C.gold;

  const corners = [
    [m, 700 - m, 1, -1],
    [1000 - m, 700 - m, -1, -1],
    [m, m, 1, 1],
    [1000 - m, m, -1, 1]
  ];

  for (const [x, y, sx, sy] of corners) {
    page.drawLine({
      start: { x, y },
      end: { x: x + sx * length, y },
      thickness: 1,
      color
    });

    page.drawLine({
      start: { x, y },
      end: { x, y: y + sy * length },
      thickness: 1,
      color
    });
  }

  // Header divider
  page.drawLine({
    start: { x: 45, y: 528 },
    end: { x: 955, y: 528 },
    thickness: 0.8,
    color: C.pale
  });

  // Footer divider
  page.drawLine({
    start: { x: 45, y: 119 },
    end: { x: 955, y: 119 },
    thickness: 0.8,
    color: C.pale
  });
}

// ------------------------------------------------------------
// SMALL GOLD MEDAL
// ------------------------------------------------------------

function drawMedal(page, fonts, cx, cy) {
  for (let i = 0; i < 16; i++) {
    const angle = Math.PI * 2 * i / 16;

    page.drawLine({
      start: {
        x: cx + 21 * Math.cos(angle),
        y: cy + 21 * Math.sin(angle)
      },
      end: {
        x: cx + 25 * Math.cos(angle),
        y: cy + 25 * Math.sin(angle)
      },
      thickness: 1.2,
      color: C.gold
    });
  }

  page.drawCircle({
    x: cx,
    y: cy,
    size: 20,
    color: C.cream,
    borderColor: C.gold,
    borderWidth: 1.4
  });

  page.drawCircle({
    x: cx,
    y: cy,
    size: 14,
    borderColor: C.pale,
    borderWidth: 0.8
  });

  drawCentered(
    page,
    'IJSCI',
    cy - 3,
    fonts.bold,
    8,
    C.navy,
    cx * 2
  );

  page.drawLine({
    start: { x: cx - 8, y: cy - 18 },
    end: { x: cx - 5, y: cy - 31 },
    thickness: 4,
    color: C.navy
  });

  page.drawLine({
    start: { x: cx + 8, y: cy - 18 },
    end: { x: cx + 5, y: cy - 31 },
    thickness: 4,
    color: C.blue
  });
}

// ============================================================
// 1. CERTIFICATE GENERATOR
// ============================================================

export async function generateCertificatePdf({
  paper,
  certificate,
  verifyUrl
}) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);

  const authorName =
    certificate.authorName ||
    paper.authors?.[certificate.authorIndex]?.name ||
    'Author';

  const coauthors = (paper.authors || [])
    .filter((_, index) => index !== certificate.authorIndex)
    .map(author => author.name)
    .filter(Boolean)
    .join(', ');

  const journalName =
    process.env.JOURNAL_NAME ||
    'International Journal of Research and Innovation in Science and Engineering';

  const shortName =
    process.env.JOURNAL_SHORT_NAME || 'ijrise';

  const issn = process.env.JOURNAL_ISSN || '';
  const website = process.env.JOURNAL_WEBSITE || '';
  const email = process.env.JOURNAL_EMAIL || '';

  [
    paper.title,
    authorName,
    coauthors,
    paper.id,
    certificate.certificateId,
    journalName,
    shortName,
    issn,
    website,
    email,
    paper.doi
  ].forEach(item => checkFontText(item, fonts));

  const page = pdf.addPage([1000, 700]);

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
    color: C.cream
  });

  drawCertificateBorders(page);

  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------

  drawIJSCISeal(page, fonts, 105, 610);

  const logoFit = fitText(shortName, fonts.bold, {
    maxWidth: 530,
    maxHeight: 58,
    maxSize: 49,
    minSize: 25,
    lineHeightRatio: 1.1
  });

  drawTextLines(page, logoFit.lines, {
    centerX: 500,
    y: 618,
    font: fonts.bold,
    size: logoFit.size,
    color: C.navy
  });

  const journalFit = fitText(journalName.toUpperCase(), fonts.bold, {
    maxWidth: 610,
    maxHeight: 27,
    maxSize: 11.5,
    minSize: 8,
    lineHeightRatio: 1.15
  });

  drawTextLines(page, journalFit.lines, {
    centerX: 500,
    y: 576,
    font: fonts.bold,
    size: journalFit.size,
    color: C.blue,
    lineHeight: 14
  });

  if (issn) {
    drawCentered(
      page,
      `ISSN: ${issn}`,
      545,
      fonts.regular,
      8.5,
      C.muted,
      1000
    );
  }

  const contactLine = [website, email]
    .filter(Boolean)
    .join(' | ');

  if (contactLine) {
    const contactFit = fitText(contactLine, fonts.regular, {
      maxWidth: 600,
      maxHeight: 12,
      maxSize: 7.5,
      minSize: 6,
      lineHeightRatio: 1.2
    });

    drawTextLines(page, contactFit.lines, {
      centerX: 500,
      y: 532,
      font: fonts.regular,
      size: contactFit.size,
      color: C.muted
    });
  }

  // ----------------------------------------------------------
  // CERTIFICATE TITLE
  // ----------------------------------------------------------

  drawCentered(
    page,
    'CERTIFICATE',
    478,
    fonts.bold,
    37,
    C.ink,
    1000
  );

  drawCentered(
    page,
    'OF PUBLICATION',
    449,
    fonts.bold,
    12,
    C.blue,
    1000
  );

  page.drawLine({
    start: { x: 365, y: 434 },
    end: { x: 635, y: 434 },
    thickness: 1,
    color: C.gold
  });

  page.drawCircle({
    x: 500,
    y: 434,
    size: 3,
    color: C.gold
  });

  drawCentered(
    page,
    'THIS IS TO CERTIFY THAT',
    402,
    fonts.bold,
    10,
    C.blue,
    1000
  );

  // ----------------------------------------------------------
  // AUTHOR NAME
  // ----------------------------------------------------------

  const nameFit = fitText(authorName, fonts.bold, {
    maxWidth: 810,
    maxHeight: 48,
    maxSize: 29,
    minSize: 15,
    lineHeightRatio: 1.2
  });

  const nameY = 369;

  drawTextLines(page, nameFit.lines, {
    centerX: 500,
    y: nameY,
    font: fonts.bold,
    size: nameFit.size,
    color: C.navy,
    lineHeight: nameFit.lineHeight
  });

  const lastNameY =
    nameY - (nameFit.lines.length - 1) * nameFit.lineHeight;

  const descriptionY = lastNameY - 26;

  drawCentered(
    page,
    'has authored the research paper entitled',
    descriptionY,
    fonts.regular,
    11,
    C.muted,
    1000
  );

  // ----------------------------------------------------------
  // PAPER TITLE - AUTOMATIC WRAPPING
  // ----------------------------------------------------------

  const titleStartY = descriptionY - 36;

  const titleMaxHeight = Math.max(
    35,
    Math.min(
      125,
      titleStartY - (coauthors ? 250 : 225)
    )
  );

  const titleFit = fitText(paper.title, fonts.bold, {
    maxWidth: 815,
    maxHeight: titleMaxHeight,
    maxSize: 19,
    minSize: 7,
    lineHeightRatio: 1.3
  });

  drawTextLines(page, titleFit.lines, {
    centerX: 500,
    y: titleStartY,
    font: fonts.bold,
    size: titleFit.size,
    color: C.ink,
    lineHeight: titleFit.lineHeight
  });

  let nextContentY =
    titleStartY -
    titleFit.lines.length * titleFit.lineHeight -
    10;

  // ----------------------------------------------------------
  // CO-AUTHORS
  // ----------------------------------------------------------

  if (coauthors) {
    const coauthorText = `Co-authors: ${coauthors}`;

    const coauthorFit = fitText(
      coauthorText,
      fonts.regular,
      {
        maxWidth: 790,
        maxHeight: 29,
        maxSize: 8.5,
        minSize: 6,
        lineHeightRatio: 1.2
      }
    );

    drawTextLines(page, coauthorFit.lines, {
      centerX: 500,
      y: nextContentY,
      font: fonts.regular,
      size: coauthorFit.size,
      color: C.muted,
      lineHeight: coauthorFit.lineHeight
    });

    nextContentY -=
      coauthorFit.lines.length * coauthorFit.lineHeight + 5;
  }

  // ----------------------------------------------------------
  // PUBLICATION INFORMATION
  // ----------------------------------------------------------

  const publishedDate = paper.publishedAt
    ? new Date(paper.publishedAt)
    : new Date();

  const validDate = Number.isNaN(publishedDate.getTime())
    ? new Date()
    : publishedDate;

  const dateLabel = validDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const volumeIssue = [
    paper.volume ? `Volume ${paper.volume}` : '',
    paper.issue ? `Issue ${paper.issue}` : ''
  ].filter(Boolean).join(' | ');

  const publishedLine = [
    `Published on ${dateLabel}`,
    volumeIssue
  ].filter(Boolean).join(' | ');

  drawCentered(
    page,
    publishedLine,
    174,
    fonts.regular,
    9.2,
    C.muted,
    1000
  );

  drawCentered(
    page,
    `Paper ID: ${paper.id || 'N/A'}`,
    154,
    fonts.regular,
    8.5,
    C.muted,
    1000
  );

  if (paper.doi) {
    const doiFit = fitText(
      `DOI: ${paper.doi}`,
      fonts.regular,
      {
        maxWidth: 750,
        maxHeight: 12,
        maxSize: 8,
        minSize: 6,
        lineHeightRatio: 1.2
      }
    );

    drawTextLines(page, doiFit.lines, {
      centerX: 500,
      y: 137,
      font: fonts.regular,
      size: doiFit.size,
      color: C.blue
    });
  }

  // ----------------------------------------------------------
  // FOOTER - MEDAL AND CERTIFICATE ID
  // ----------------------------------------------------------

  drawMedal(page, fonts, 100, 73);

  const certificateID =
    `Certificate ID: ${certificate.certificateId}`;

  const idFit = fitText(
    certificateID,
    fonts.bold,
    {
      maxWidth: 420,
      maxHeight: 15,
      maxSize: 9,
      minSize: 6.5,
      lineHeightRatio: 1.2
    }
  );

  drawTextLines(page, idFit.lines, {
    x: 164,
    y: 80,
    font: fonts.bold,
    size: idFit.size,
    color: C.navy
  });

  page.drawText(
    'Digitally verifiable publication record',
    {
      x: 164,
      y: 61,
      size: 8,
      font: fonts.regular,
      color: C.muted
    }
  );

  // ----------------------------------------------------------
  // EDITOR SIGNATURE
  // ----------------------------------------------------------

  const signatureBytes = await optionalFile(
    'EDITOR_SIGNATURE_PATH',
    'public/brand/editor-signature.png'
  );

  if (signatureBytes) {
    try {
      const isPng =
        signatureBytes[0] === 0x89 &&
        signatureBytes[1] === 0x50;

      const signature = isPng
        ? await pdf.embedPng(signatureBytes)
        : await pdf.embedJpg(signatureBytes);

      const dims = signature.scale(
        Math.min(
          125 / signature.width,
          35 / signature.height
        )
      );

      page.drawImage(signature, {
        x: 655,
        y: 79,
        width: dims.width,
        height: dims.height
      });
    } catch (error) {
      console.error(
        'Signature image error:',
        error.message
      );
    }
  }

  page.drawLine({
    start: { x: 650, y: 73 },
    end: { x: 790, y: 73 },
    thickness: 0.8,
    color: C.navy
  });

  page.drawText(
    process.env.EDITOR_NAME || 'Editor in Chief',
    {
      x: 650,
      y: 56,
      size: 9,
      font: fonts.bold,
      color: C.navy
    }
  );

  page.drawText(
    process.env.EDITOR_TITLE || 'Editorial Office',
    {
      x: 650,
      y: 43,
      size: 7.5,
      font: fonts.regular,
      color: C.muted
    }
  );

  // ----------------------------------------------------------
  // VERIFICATION QR CODE
  // ----------------------------------------------------------

  if (verifyUrl) {
    const qr = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'H'
    });

    const qrImage = await pdf.embedPng(qr);

    page.drawImage(qrImage, {
      x: 875,
      y: 43,
      width: 65,
      height: 65
    });

    drawCentered(
      page,
      'SCAN TO VERIFY',
      32,
      fonts.bold,
      6.3,
      C.blue,
      1000
    );
  }

  return Buffer.from(await pdf.save());
}

// ============================================================
// 2. ORIGINAL PAYMENT RECEIPT GENERATOR
// PRESERVED TO MAINTAIN BACKEND COMPATIBILITY
// ============================================================

export async function generatePaymentReceiptPdf({
  paper,
  payment
}) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);

  [
    paper.title,
    paper.id,
    paper.submitterName,
    paper.authors?.[0]?.name,
    payment.utr
  ].forEach(item => checkFontText(item, fonts));

  const page = pdf.addPage([595, 842]);

  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: C.white
  });

  page.drawRectangle({
    x: 26,
    y: 26,
    width: width - 52,
    height: height - 52,
    borderColor: C.navy,
    borderWidth: 1.4
  });

  page.drawRectangle({
    x: 26,
    y: height - 170,
    width: width - 52,
    height: 144,
    color: C.navy
  });

  page.drawText('ijrise · EDITORIAL OFFICE', {
    x: 52,
    y: height - 62,
    size: 11,
    font: fonts.bold,
    color: C.gold
  });

  page.drawText('PAYMENT RECEIPT', {
    x: 52,
    y: height - 111,
    size: 27,
    font: fonts.bold,
    color: C.white
  });

  page.drawText('Manual UPI payment confirmation', {
    x: 54,
    y: height - 137,
    size: 10,
    font: fonts.regular,
    color: C.white
  });

  const fields = [
    [
      'Receipt reference',
      payment.receiptId || `RCPT-${paper.id}`
    ],
    ['Paper ID', paper.id],
    ['Manuscript', paper.title],
    [
      'Payer / submitting author',
      paper.submitterName ||
      paper.authors?.[0]?.name ||
      'Author'
    ],
    [
      'Amount received',
      `INR ${Number(payment.amount || 0).toFixed(2)}`
    ],
    [
      'UPI transaction reference (UTR)',
      payment.utr
    ],
    [
      'Payment submitted',
      payment.submittedAt
        ? new Date(payment.submittedAt).toLocaleString('en-IN')
        : ''
    ],
    [
      'Payment verified',
      payment.confirmedAt
        ? new Date(payment.confirmedAt).toLocaleString('en-IN')
        : ''
    ],
    [
      'Verification status',
      'CONFIRMED BY EDITORIAL OFFICE'
    ]
  ];

  let y = height - 220;

  for (const [label, value] of fields) {
    page.drawText(String(label), {
      x: 54,
      y,
      size: 9,
      font: fonts.bold,
      color: C.muted
    });

    const lines = wrapText(
      String(value || ''),
      fonts.regular,
      10,
      455
    );

    lines.slice(0, 2).forEach((line, index) => {
      page.drawText(line, {
        x: 54,
        y: y - 17 - index * 13,
        size: 10,
        font: fonts.regular,
        color: C.ink
      });
    });

    y -= 52;
  }

  page.drawText(
    'This receipt confirms that the journal marked the submitted UPI payment as received.',
    {
      x: 54,
      y: 104,
      size: 8.5,
      font: fonts.regular,
      color: C.muted
    }
  );

  page.drawText(
    'Keep this receipt with your publication records.',
    {
      x: 54,
      y: 88,
      size: 8.5,
      font: fonts.regular,
      color: C.muted
    }
  );

  page.drawText(
    process.env.JOURNAL_NAME ||
    'International Journal of Research and Innovation in Science and Engineering',
    {
      x: 54,
      y: 56,
      size: 8,
      font: fonts.bold,
      color: C.navy
    }
  );

  return Buffer.from(await pdf.save());
}

// ============================================================
// END OF MODULE
// ============================================================
