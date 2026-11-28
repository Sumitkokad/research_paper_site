// // ============================================================
// // IJROS CERTIFICATE & PAYMENT RECEIPT GENERATOR
// // "Forest Band" layout  -  Netlify ES module
// //
// // Layout (matches 2__Forest_Band.pdf):
// //   left   : forest-green band with seal, wordmark, tags and the
// //            verification QR code (bottom, inside the band)
// //   right  : Figshare / Google Scholar pill (top right), journal
// //            name, certificate title, author, paper, metadata
// //   footer : certificate / paper / DOI + editor signature line
// //
// // Exports (unchanged):
// //   generateCertificatePdf({ paper, certificate, verifyUrl })
// //   generatePaymentReceiptPdf({ paper, payment })
// // ============================================================

// import fs from 'node:fs/promises';
// import path from 'node:path';
// import { fileURLToPath } from 'node:url';
// import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
// import fontkit from '@pdf-lib/fontkit';
// import QRCode from 'qrcode';

// // ------------------------------------------------------------
// // PAGE GEOMETRY
// // All layout numbers below are in a 1308 x 924 design grid with a
// // TOP-LEFT origin (same proportions as A4 landscape). Y() flips them
// // into PDF coordinates. At the end the page is scaled to A4 landscape.
// // ------------------------------------------------------------
// const W = 1308;
// const H = 924;
// const A4_LANDSCAPE_WIDTH = 841.89;
// const Y = (top) => H - top;

// // ------------------------------------------------------------
// // COLOR PALETTE
// // ------------------------------------------------------------
// const hex = (value) => {
//   const n = parseInt(value.slice(1), 16);
//   return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
// };

// const C = {
//   band: hex('#183a2e'),
//   bandDeep: hex('#12302a'),
//   bandLine: hex('#2f5f4d'),
//   gold: hex('#c29d5a'),
//   goldLine: hex('#d6bc82'),
//   goldText: hex('#9a7030'),
//   cream: hex('#faf6ec'),
//   title: hex('#153a2c'),
//   ink: hex('#1c2433'),
//   muted: hex('#5b6168'),
//   pale: hex('#d9dfbd'),
//   white: hex('#ffffff'),
//   pill: hex('#fffdf8'),
//   pillBorder: hex('#e0d4b0'),
//   divider: hex('#d9d3c3'),
//   qrDark: hex('#0f2a20'),
//   green: hex('#1b5e3a'),
//   // legacy names used by the payment receipt
//   navy: hex('#183a2e')
// };

// // ------------------------------------------------------------
// // FILE HELPERS (work locally and inside a Netlify function bundle)
// // ------------------------------------------------------------
// const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// function searchRoots() {
//   return [
//     ...new Set(
//       [
//         process.cwd(),
//         process.env.LAMBDA_TASK_ROOT,
//         MODULE_DIR,
//         path.resolve(MODULE_DIR, '..'),
//         path.resolve(MODULE_DIR, '../..'),
//         path.resolve(MODULE_DIR, '../../..')
//       ].filter(Boolean)
//     )
//   ];
// }

// async function readFirst(candidates) {
//   for (const raw of candidates) {
//     if (!raw) continue;
//     const rel = String(raw).trim().replace(/\\/g, '/');
//     if (!rel) continue;

//     const targets = path.isAbsolute(rel)
//       ? [rel]
//       : searchRoots().map((root) => path.resolve(root, rel));

//     for (const target of targets) {
//       try {
//         return await fs.readFile(target);
//       } catch {
//         // try next location
//       }
//     }
//   }
//   return null;
// }

// // optionalFile('ENV_NAME', 'default/path', 'other/default') -> Buffer | null
// async function optionalFile(envName, ...fallbacks) {
//   return readFirst([process.env[envName], ...fallbacks]);
// }

// async function embedImageBytes(pdf, bytes, label) {
//   if (!bytes) return null;
//   try {
//     const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
//     const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
//     if (isPng) return await pdf.embedPng(bytes);
//     if (isJpg) return await pdf.embedJpg(bytes);
//     console.error(`Unsupported image format (use PNG or JPG): ${label}`);
//     return null;
//   } catch (error) {
//     console.error(`Failed to embed image: ${label}`, error.message);
//     return null;
//   }
// }

// async function loadImage(pdf, envVar, ...fallbackPaths) {
//   const bytes = await optionalFile(envVar, ...fallbackPaths);
//   if (!bytes) {
//     console.warn(`Logo not found for ${envVar}; certificate will render without it.`);
//     return null;
//   }
//   return embedImageBytes(pdf, bytes, envVar);
// }

// // ------------------------------------------------------------
// // FONTS
// //   serif (headings, names)  : CERTIFICATE_FONT_PATH / _BOLD / _ITALIC
// //   sans  (labels, metadata) : CERTIFICATE_SANS_FONT_PATH / _SANS_BOLD
// // Anything missing falls back to a built-in PDF font, so the
// // certificate always renders.
// // ------------------------------------------------------------
// async function loadFonts(pdf) {
//   const [regularBytes, boldBytes, italicBytes, sansBytes, sansBoldBytes] = await Promise.all([
//     optionalFile('CERTIFICATE_FONT_PATH', 'public/fonts/NotoSerif-Regular.ttf', 'public/fonts/Lora-Regular.ttf'),
//     optionalFile('CERTIFICATE_BOLD_FONT_PATH', 'public/fonts/NotoSerif-Bold.ttf', 'public/fonts/Lora-Bold.ttf'),
//     optionalFile('CERTIFICATE_ITALIC_FONT_PATH', 'public/fonts/NotoSerif-Italic.ttf', 'public/fonts/Lora-Italic.ttf'),
//     optionalFile('CERTIFICATE_SANS_FONT_PATH', 'public/fonts/DMSans-Regular.ttf', 'public/fonts/NotoSans-Regular.ttf'),
//     optionalFile('CERTIFICATE_SANS_BOLD_FONT_PATH', 'public/fonts/DMSans-Bold.ttf', 'public/fonts/NotoSans-Bold.ttf')
//   ]);

//   if ([regularBytes, boldBytes, italicBytes, sansBytes, sansBoldBytes].some(Boolean)) {
//     pdf.registerFontkit(fontkit);
//   }

//   const embed = async (bytes) => {
//     if (!bytes) return null;
//     try {
//       return await pdf.embedFont(bytes, { subset: true });
//     } catch (error) {
//       console.error('Font embed failed, using fallback:', error.message);
//       return null;
//     }
//   };

//   // Serif family
//   let regular = await embed(regularBytes);
//   const unicode = Boolean(regular);
//   let bold;
//   let italic;

//   if (unicode) {
//     bold = (await embed(boldBytes)) || regular;
//     italic = (await embed(italicBytes)) || bold; // no italic file -> bold, still Unicode-safe
//   } else {
//     regular = await pdf.embedFont(StandardFonts.TimesRoman);
//     bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
//     italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
//   }

//   // Sans family
//   let sans = await embed(sansBytes);
//   const sansUnicode = Boolean(sans);
//   let sansBold;
//   if (sansUnicode) {
//     sansBold = (await embed(sansBoldBytes)) || sans;
//   } else {
//     sans = await pdf.embedFont(StandardFonts.Helvetica);
//     sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
//   }

//   return { regular, bold, italic, sans, sansBold, unicode, sansUnicode };
// }

// // Throws when text cannot be shown with built-in fonts (author / title text).
// function checkFontText(text, fonts) {
//   if (!fonts.unicode && /[^\u0000-\u00ff]/u.test(String(text || ''))) {
//     throw new Error('A certificate contains non-Latin characters.');
//   }
// }

// // For short labels set in the sans font: never fail, just replace.
// function sansSafe(text, fonts) {
//   const value = String(text ?? '');
//   return fonts.sansUnicode ? value : value.replace(/[^\u0000-\u00ff]/gu, '?');
// }

// // ------------------------------------------------------------
// // TEXT HELPERS
// // ------------------------------------------------------------
// function wrapText(text, font, size, maxWidth) {
//   const sourceWords = String(text || '').split(/\s+/).filter(Boolean);
//   const words = [];

//   for (const word of sourceWords) {
//     if (font.widthOfTextAtSize(word, size) <= maxWidth) {
//       words.push(word);
//       continue;
//     }
//     let chunk = '';
//     for (const character of Array.from(word)) {
//       const candidate = chunk + character;
//       if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
//         words.push(chunk);
//         chunk = character;
//       } else {
//         chunk = candidate;
//       }
//     }
//     if (chunk) words.push(chunk);
//   }

//   const lines = [];
//   let line = '';

//   for (const word of words) {
//     const candidate = line ? `${line} ${word}` : word;
//     if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
//       line = candidate;
//     } else {
//       lines.push(line);
//       line = word;
//     }
//   }
//   if (line) lines.push(line);
//   return lines;
// }

// function fitText(text, font, options) {
//   const { maxWidth, maxHeight, maxSize, minSize = 8, lineHeightRatio = 1.25 } = options;
//   for (let size = maxSize; size >= minSize; size = Math.round((size - 0.5) * 10) / 10) {
//     const lines = wrapText(text, font, size, maxWidth);
//     const lineHeight = size * lineHeightRatio;
//     if (lines.length * lineHeight <= maxHeight) {
//       return { lines, size, lineHeight };
//     }
//   }
//   const size = minSize;
//   const lines = wrapText(text, font, size, maxWidth);
//   return { lines, size, lineHeight: size * lineHeightRatio };
// }

// function spacedWidth(text, font, size, spacing) {
//   const chars = Array.from(String(text));
//   const glyphs = chars.reduce((sum, ch) => sum + font.widthOfTextAtSize(ch, size), 0);
//   return glyphs + spacing * Math.max(0, chars.length - 1);
// }

// // Draws text with letter-spacing. `base` is the baseline in design-grid (top-left) units.
// function drawSpaced(page, text, { x, base, font, size, color, spacing = 0, align = 'left' }) {
//   const chars = Array.from(String(text ?? ''));
//   const total = spacedWidth(text, font, size, spacing);
//   let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;

//   for (const ch of chars) {
//     if (ch.trim()) {
//       page.drawText(ch, { x: cursor, y: Y(base), size, font, color });
//     }
//     cursor += font.widthOfTextAtSize(ch, size) + spacing;
//   }
// }

// function drawText(page, text, { x, base, font, size, color, align = 'left' }) {
//   const value = String(text ?? '');
//   const width = font.widthOfTextAtSize(value, size);
//   const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
//   page.drawText(value, { x: left, y: Y(base), size, font, color });
// }

// function roundedRectPath(w, h, r) {
//   return (
//     `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} ` +
//     `Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
//   );
// }

// function drawRoundedRect(page, { x, top, w, h, r, color, borderColor, borderWidth }) {
//   page.drawSvgPath(roundedRectPath(w, h, r), {
//     x,
//     y: Y(top),
//     color,
//     borderColor,
//     borderWidth
//   });
// }

// function hostOf(value) {
//   const raw = String(value || '').trim();
//   if (!raw) return '';
//   return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
// }

// // ------------------------------------------------------------
// // LEFT BAND
// // ------------------------------------------------------------
// const BAND_WIDTH = 285;
// const BAND_CENTER = 142;
// const CONTENT_X = 380;
// const CONTENT_RIGHT = 1219;

// function drawBand(page, fonts, brand) {
//   // Band + gold stripe
//   page.drawRectangle({ x: 0, y: 0, width: BAND_WIDTH, height: H, color: C.band });
//   page.drawRectangle({ x: BAND_WIDTH, y: 0, width: 6, height: H, color: C.gold });

//   // Seal
//   page.drawCircle({ x: BAND_CENTER, y: Y(135), size: 62, color: C.bandDeep, borderColor: C.gold, borderWidth: 3 });
//   page.drawCircle({
//     x: BAND_CENTER,
//     y: Y(135),
//     size: 44,
//     borderColor: C.gold,
//     borderWidth: 1.2,
//     borderDashArray: [1.4, 3.6]
//   });
//   drawText(page, brand.monogram, {
//     x: BAND_CENTER,
//     base: 148,
//     font: fonts.bold,
//     size: 36,
//     color: C.white,
//     align: 'center'
//   });

//   // Wordmark badge
//   drawRoundedRect(page, { x: 67, top: 222, w: 151, h: 63, r: 10, color: C.cream });
//   drawSpaced(page, brand.shortName, {
//     x: BAND_CENTER,
//     base: 268,
//     font: fonts.bold,
//     size: 38,
//     color: C.title,
//     spacing: 1.5,
//     align: 'center'
//   });

//   // Tags
//   ['PEER-REVIEWED', 'OPEN ACCESS', 'DOI VIA FIGSHARE'].forEach((label, index) => {
//     drawSpaced(page, label, {
//       x: BAND_CENTER,
//       base: 309 + index * 20.5,
//       font: fonts.sans,
//       size: 13,
//       color: C.pale,
//       spacing: 2.2,
//       align: 'center'
//     });
//   });

//   if (brand.host) {
//     drawSpaced(page, sansSafe(brand.host, fonts), {
//       x: BAND_CENTER,
//       base: 391,
//       font: fonts.sans,
//       size: 17,
//       color: C.cream,
//       spacing: 1.2,
//       align: 'center'
//     });
//   }
// }

// async function drawQr(page, pdf, fonts, verifyUrl) {
//   if (!verifyUrl) return;

//   const qrBuffer = await QRCode.toBuffer(verifyUrl, {
//     type: 'png',
//     width: 480,
//     margin: 0,
//     errorCorrectionLevel: 'H',
//     color: { dark: '#0f2a20', light: '#ffffff' }
//   });
//   const qrImage = await pdf.embedPng(qrBuffer);

//   // White tile inside the band, bottom-left
//   const tile = 116;
//   const tileX = BAND_CENTER - tile / 2;
//   const tileTop = 716;
//   page.drawRectangle({
//     x: tileX,
//     y: Y(tileTop + tile),
//     width: tile,
//     height: tile,
//     color: C.white,
//     borderColor: C.bandLine,
//     borderWidth: 2.5
//   });

//   const pad = 9;
//   page.drawImage(qrImage, {
//     x: tileX + pad,
//     y: Y(tileTop + tile - pad),
//     width: tile - pad * 2,
//     height: tile - pad * 2
//   });

//   drawSpaced(page, 'SCAN TO VERIFY', {
//     x: BAND_CENTER,
//     base: 852,
//     font: fonts.sans,
//     size: 12.5,
//     color: C.pale,
//     spacing: 1.6,
//     align: 'center'
//   });
// }

// // ------------------------------------------------------------
// // FIGSHARE / GOOGLE SCHOLAR PILL (top right)
// // ------------------------------------------------------------
// function drawLogoPill(page, logos) {
//   const available = logos.filter(Boolean);
//   if (!available.length) return;

//   const two = available.length === 2;
//   const pillW = two ? 394 : 250;
//   const pillH = 65;
//   const pillTop = 55;
//   const pillX = CONTENT_RIGHT - pillW;

//   drawRoundedRect(page, {
//     x: pillX,
//     top: pillTop,
//     w: pillW,
//     h: pillH,
//     r: 14,
//     color: C.pill,
//     borderColor: C.pillBorder,
//     borderWidth: 1
//   });

//   const pad = 24;
//   const gap = 32;
//   const boxW = (pillW - pad * 2 - gap * (available.length - 1)) / available.length;
//   const boxH = 44;

//   available.forEach((logo, index) => {
//     const boxX = pillX + pad + index * (boxW + gap);
//     const dims = logo.scaleToFit(boxW, boxH);
//     page.drawImage(logo, {
//       x: boxX + (boxW - dims.width) / 2,
//       y: Y(pillTop + pillH / 2) - dims.height / 2,
//       width: dims.width,
//       height: dims.height
//     });

//     if (index > 0) {
//       const dividerX = boxX - gap / 2;
//       page.drawLine({
//         start: { x: dividerX, y: Y(pillTop + 14) },
//         end: { x: dividerX, y: Y(pillTop + pillH - 14) },
//         thickness: 1,
//         color: C.divider
//       });
//     }
//   });
// }

// // ============================================================
// // 1. CERTIFICATE
// // ============================================================
// export async function generateCertificatePdf({ paper, certificate, verifyUrl }) {
//   const pdf = await PDFDocument.create();
//   const fonts = await loadFonts(pdf);

//   const authorName = certificate.authorName || paper.authors?.[certificate.authorIndex]?.name || 'Author';
//   const coauthors = (paper.authors || [])
//     .filter((_, index) => index !== certificate.authorIndex)
//     .map((author) => author.name)
//     .filter(Boolean)
//     .join(', ');

//   const journalName = process.env.JOURNAL_NAME || 'International Journal of Research and Open Science';
//   const brand = {
//     shortName: String(process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase(),
//     monogram: String(process.env.JOURNAL_MONOGRAM || 'IJ').toUpperCase(),
//     host: hostOf(process.env.JOURNAL_WEBSITE) || 'ijros.com'
//   };
//   const doi = paper.figshare?.doi || paper.doi || '';
//   const paperId = paper.id || 'N/A';
//   const certificateId = certificate.certificateId || 'N/A';

//   [paper.title, authorName, coauthors].forEach((item) => checkFontText(item, fonts));

//   pdf.setTitle(`Certificate of Publication - ${paper.title || paperId}`);
//   pdf.setAuthor(journalName);
//   pdf.setSubject(`Certificate ${certificateId}`);

//   const page = pdf.addPage([W, H]);

//   // Background + left band
//   page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.cream });
//   drawBand(page, fonts, brand);
//   await drawQr(page, pdf, fonts, verifyUrl);

//   // Gold frame around the content area
//   page.drawRectangle({
//     x: 321,
//     y: Y(893),
//     width: 956,
//     height: 862,
//     borderColor: C.goldLine,
//     borderWidth: 1.3
//   });

//   // Logos (top right)
//   const figshareLogo = await loadImage(pdf, 'FIGSHARE_LOGO_PATH', 'public/brand/figshare.png');
//   const scholarLogo = await loadImage(pdf, 'GOOGLE_SCHOLAR_LOGO_PATH', 'public/brand/google-scholar.png');
//   drawLogoPill(page, [figshareLogo, scholarLogo]);

//   // Journal name
//   const journalUpper = sansSafe(journalName.toUpperCase(), fonts);
//   let journalSize = 14;
//   while (journalSize > 9 && spacedWidth(journalUpper, fonts.sans, journalSize, 3.2) > 800) journalSize -= 0.5;
//   drawSpaced(page, journalUpper, {
//     x: CONTENT_X,
//     base: 163,
//     font: fonts.sans,
//     size: journalSize,
//     color: C.goldText,
//     spacing: 3.2
//   });

//   // Title
//   drawText(page, 'Certificate of Publication', {
//     x: CONTENT_X,
//     base: 232,
//     font: fonts.bold,
//     size: 54,
//     color: C.title
//   });

//   drawSpaced(page, 'THIS IS TO CERTIFY THAT', {
//     x: CONTENT_X,
//     base: 282,
//     font: fonts.sans,
//     size: 14,
//     color: C.muted,
//     spacing: 2.6
//   });

//   // Author name (italic serif)
//   const contentWidth = 830;
//   const nameFit = fitText(authorName, fonts.italic, {
//     maxWidth: contentWidth,
//     maxHeight: 80,
//     maxSize: 66,
//     minSize: 30,
//     lineHeightRatio: 1.12
//   });
//   const nameBase = 357;
//   nameFit.lines.forEach((line, index) => {
//     drawText(page, line, {
//       x: CONTENT_X,
//       base: nameBase + index * nameFit.lineHeight,
//       font: fonts.italic,
//       size: nameFit.size,
//       color: C.ink
//     });
//   });
//   const lastNameBase = nameBase + (nameFit.lines.length - 1) * nameFit.lineHeight;

//   // "has authored..."
//   const descBase = lastNameBase + 33;
//   drawText(page, 'has authored the research paper entitled', {
//     x: CONTENT_X,
//     base: descBase,
//     font: fonts.regular,
//     size: 16,
//     color: C.muted
//   });

//   // Paper title
//   const titleBase = descBase + 45;
//   const titleFit = fitText(paper.title || 'Untitled manuscript', fonts.bold, {
//     maxWidth: contentWidth,
//     maxHeight: Math.max(60, 640 - titleBase),
//     maxSize: 28,
//     minSize: 14,
//     lineHeightRatio: 1.22
//   });
//   titleFit.lines.forEach((line, index) => {
//     drawText(page, line, {
//       x: CONTENT_X,
//       base: titleBase + index * titleFit.lineHeight,
//       font: fonts.bold,
//       size: titleFit.size,
//       color: C.ink
//     });
//   });
//   let cursor = titleBase + (titleFit.lines.length - 1) * titleFit.lineHeight;

//   // Co-authors (optional)
//   if (coauthors) {
//     const coFit = fitText(`Co-authors: ${coauthors}`, fonts.regular, {
//       maxWidth: contentWidth,
//       maxHeight: 40,
//       maxSize: 14,
//       minSize: 9,
//       lineHeightRatio: 1.25
//     });
//     cursor += 30;
//     coFit.lines.forEach((line, index) => {
//       drawText(page, line, {
//         x: CONTENT_X,
//         base: cursor + index * coFit.lineHeight,
//         font: fonts.regular,
//         size: coFit.size,
//         color: C.muted
//       });
//     });
//     cursor += (coFit.lines.length - 1) * coFit.lineHeight;
//   }

//   // Published line
//   const publishedAt = paper.publishedAt ? new Date(paper.publishedAt) : new Date();
//   const validDate = Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt;
//   const dateLabel = validDate.toLocaleDateString('en-GB', {
//     day: 'numeric',
//     month: 'long',
//     year: 'numeric',
//     timeZone: 'UTC'
//   });

//   const volumeText = paper.volume
//     ? /^vol/i.test(String(paper.volume)) ? String(paper.volume) : `Volume ${paper.volume}`
//     : '';
//   const issueText = paper.issue
//     ? /^issue/i.test(String(paper.issue)) ? String(paper.issue) : `Issue ${paper.issue}`
//     : '';
//   const publishedLine = [`Published ${dateLabel}`, volumeText, issueText].filter(Boolean).join(' \u00b7 ');

//   const publishedBase = Math.min(cursor + 35, 745);
//   drawText(page, sansSafe(publishedLine, fonts), {
//     x: CONTENT_X,
//     base: publishedBase,
//     font: fonts.sans,
//     size: 15,
//     color: C.muted
//   });

//   // Footer: certificate / paper / DOI
//   const metaRows = [
//     ['Certificate ID', certificateId],
//     ['Paper ID', paperId]
//   ];
//   if (doi) metaRows.push(['DOI', doi]);

//   const metaStart = doi ? 803 : 815;
//   const metaStep = 24.5;
//   metaRows.forEach(([label, value], index) => {
//     const base = metaStart + index * metaStep;
//     const labelText = sansSafe(label, fonts);
//     drawText(page, labelText, { x: CONTENT_X, base, font: fonts.sansBold, size: 14, color: C.ink });
//     const labelWidth = fonts.sansBold.widthOfTextAtSize(labelText, 14);
//     drawText(page, sansSafe(value, fonts), {
//       x: CONTENT_X + labelWidth + 7,
//       base,
//       font: fonts.sans,
//       size: 14,
//       color: C.muted
//     });
//   });

//   // Footer: editor signature
//   const signatureX = 1103;
//   const signatureBytes = await optionalFile('EDITOR_SIGNATURE_PATH', 'public/brand/editor-signature.png');
//   const signature = await embedImageBytes(pdf, signatureBytes, 'EDITOR_SIGNATURE_PATH');
//   if (signature) {
//     const dims = signature.scaleToFit(190, 52);
//     page.drawImage(signature, {
//       x: signatureX - dims.width / 2,
//       y: Y(809),
//       width: dims.width,
//       height: dims.height
//     });
//   }

//   page.drawLine({
//     start: { x: 987, y: Y(813) },
//     end: { x: CONTENT_RIGHT + 1, y: Y(813) },
//     thickness: 1.2,
//     color: C.ink
//   });
//   drawText(page, 'Editorial Office', {
//     x: signatureX,
//     base: 836,
//     font: fonts.sansBold,
//     size: 15,
//     color: C.ink,
//     align: 'center'
//   });
//   drawText(page, sansSafe(`Editor, ${brand.shortName}`, fonts), {
//     x: signatureX,
//     base: 855,
//     font: fonts.sans,
//     size: 14,
//     color: C.muted,
//     align: 'center'
//   });

//   // Scale the design grid to real A4 landscape (no-op if unsupported)
//   try {
//     const k = A4_LANDSCAPE_WIDTH / W;
//     if (typeof page.scale === 'function') page.scale(k, k);
//   } catch (error) {
//     console.error('Page scaling skipped:', error.message);
//   }

//   return Buffer.from(await pdf.save());
// }

// // ============================================================
// // 2. PAYMENT RECEIPT (behaviour preserved, themed to match)
// // ============================================================
// export async function generatePaymentReceiptPdf({ paper, payment }) {
//   const pdf = await PDFDocument.create();
//   const fonts = await loadFonts(pdf);

//   [paper.title, paper.id, paper.submitterName, paper.authors?.[0]?.name, payment.utr].forEach((item) =>
//     checkFontText(item, fonts)
//   );

//   const page = pdf.addPage([595, 842]);
//   const { width, height } = page.getSize();
//   const shortName = String(process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase();

//   page.drawRectangle({ x: 0, y: 0, width, height, color: C.white });
//   page.drawRectangle({ x: 26, y: 26, width: width - 52, height: height - 52, borderColor: C.band, borderWidth: 1.4 });
//   page.drawRectangle({ x: 26, y: height - 170, width: width - 52, height: 144, color: C.band });
//   page.drawRectangle({ x: 26, y: height - 174, width: width - 52, height: 4, color: C.gold });

//   page.drawText(`${shortName} \u00b7 EDITORIAL OFFICE`, {
//     x: 52,
//     y: height - 62,
//     size: 11,
//     font: fonts.bold,
//     color: C.gold
//   });
//   page.drawText('PAYMENT RECEIPT', { x: 52, y: height - 111, size: 27, font: fonts.bold, color: C.white });
//   page.drawText('Manual UPI payment confirmation', {
//     x: 54,
//     y: height - 137,
//     size: 10,
//     font: fonts.regular,
//     color: C.white
//   });

//   const fields = [
//     ['Receipt reference', payment.receiptId || `RCPT-${paper.id}`],
//     ['Paper ID', paper.id],
//     ['Manuscript', paper.title],
//     ['Payer / submitting author', paper.submitterName || paper.authors?.[0]?.name || 'Author'],
//     ['Amount received', `INR ${Number(payment.amount || 0).toFixed(2)}`],
//     ['UPI transaction reference (UTR)', payment.utr],
//     ['Payment submitted', payment.submittedAt ? new Date(payment.submittedAt).toLocaleString('en-IN') : ''],
//     ['Payment verified', payment.confirmedAt ? new Date(payment.confirmedAt).toLocaleString('en-IN') : ''],
//     ['Verification status', 'CONFIRMED BY EDITORIAL OFFICE']
//   ];

//   let y = height - 220;
//   for (const [label, value] of fields) {
//     page.drawText(String(label), { x: 54, y, size: 9, font: fonts.bold, color: C.muted });
//     const lines = wrapText(String(value || ''), fonts.regular, 10, 455);
//     lines.slice(0, 2).forEach((line, index) => {
//       page.drawText(line, { x: 54, y: y - 17 - index * 13, size: 10, font: fonts.regular, color: C.ink });
//     });
//     y -= 52;
//   }

//   page.drawText('This receipt confirms that the journal marked the submitted UPI payment as received.', {
//     x: 54,
//     y: 104,
//     size: 8.5,
//     font: fonts.regular,
//     color: C.muted
//   });
//   page.drawText('Keep this receipt with your publication records.', {
//     x: 54,
//     y: 88,
//     size: 8.5,
//     font: fonts.regular,
//     color: C.muted
//   });
//   page.drawText(process.env.JOURNAL_NAME || 'International Journal of Research and Open Science', {
//     x: 54,
//     y: 56,
//     size: 8,
//     font: fonts.bold,
//     color: C.band
//   });

//   return Buffer.from(await pdf.save());
// }





// ============================================================
// IJROS CERTIFICATE & PAYMENT RECEIPT GENERATOR
// "Ribbon Banner" layout  -  Netlify ES module
//
// Layout (matches 15__Ribbon_Banner.png), everything centred:
//   header : Figshare logo | IJ seal | Google Scholar logo
//   title  : journal name + folded green "CERTIFICATE OF PUBLICATION" ribbon
//   body   : author (italic), ornament, paper title, co-authors, publish line
//   footer : certificate / paper / DOI (left), editor signature (centre),
//            verification QR code (right)
//
// Exports (unchanged):
//   generateCertificatePdf({ paper, certificate, verifyUrl })
//   generatePaymentReceiptPdf({ paper, payment })
// ============================================================


// ============================================================
// IJROS CERTIFICATE & PAYMENT RECEIPT GENERATOR
// "Ribbon Banner" layout  -  Netlify ES module
//
// Layout, everything centred:
//   header : Figshare logo | IJ seal | Google Scholar logo
//   title  : journal name + folded green "CERTIFICATE OF PUBLICATION" ribbon
//   body   : author (italic), ornament, paper title, co-authors, publish line
//   footer : certificate / paper / DOI (left), editor signature (centre),
//            verification QR code (right)
//
// Exports (unchanged):
//   generateCertificatePdf({ paper, certificate, verifyUrl })
//   generatePaymentReceiptPdf({ paper, payment })
//
// CHANGE IN THIS VERSION
//   Header logos are now fitted into fixed boxes (see LOGO_BOXES), so the
//   Figshare and Google Scholar logos look the same size. Use the trimmed
//   logo files that come with this update (public/brand/*.png): the old
//   Google Scholar PNG had a lot of empty space around the text, which made
//   it look tiny.
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

// ------------------------------------------------------------
// PAGE GEOMETRY
// All layout numbers below are in a 1123 x 794 design grid (1 unit = 1 CSS px
// of the approved design) with a TOP-LEFT origin, the same proportions as
// A4 landscape. Y() flips them into PDF coordinates. At the end the page is
// scaled to A4 landscape.
// ------------------------------------------------------------
const W = 1123;
const H = 794;
const A4_LANDSCAPE_WIDTH = 841.89;
const Y = (top) => H - top;

// ------------------------------------------------------------
// COLOR PALETTE
// ------------------------------------------------------------
const hex = (value) => {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const C = {
  band: hex('#183a2e'),
  bandDeep: hex('#12302a'),
  bandLine: hex('#2f5f4d'),
  gold: hex('#c29d5a'),
  goldLine: hex('#d6bc82'),
  goldText: hex('#9a7030'),
  cream: hex('#faf6ec'),
  title: hex('#153a2c'),
  ink: hex('#1c2433'),
  muted: hex('#5b6168'),
  pale: hex('#d9dfbd'),
  white: hex('#ffffff'),
  pill: hex('#fffdf8'),
  pillBorder: hex('#e0d4b0'),
  divider: hex('#d9d3c3'),
  qrDark: hex('#0f2a20'),
  green: hex('#1b5e3a'),
  // legacy names used by the payment receipt
  navy: hex('#183a2e'),
  // ribbon certificate
  shadow: hex('#000000')
};

// ------------------------------------------------------------
// FILE HELPERS (work locally and inside a Netlify function bundle)
// ------------------------------------------------------------
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function searchRoots() {
  return [
    ...new Set(
      [
        process.cwd(),
        process.env.LAMBDA_TASK_ROOT,
        MODULE_DIR,
        path.resolve(MODULE_DIR, '..'),
        path.resolve(MODULE_DIR, '../..'),
        path.resolve(MODULE_DIR, '../../..')
      ].filter(Boolean)
    )
  ];
}

async function readFirst(candidates) {
  for (const raw of candidates) {
    if (!raw) continue;
    const rel = String(raw).trim().replace(/\\/g, '/');
    if (!rel) continue;

    const targets = path.isAbsolute(rel)
      ? [rel]
      : searchRoots().map((root) => path.resolve(root, rel));

    for (const target of targets) {
      try {
        return await fs.readFile(target);
      } catch {
        // try next location
      }
    }
  }
  return null;
}

// optionalFile('ENV_NAME', 'default/path', 'other/default') -> Buffer | null
async function optionalFile(envName, ...fallbacks) {
  return readFirst([process.env[envName], ...fallbacks]);
}

async function embedImageBytes(pdf, bytes, label) {
  if (!bytes) return null;
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (isPng) return await pdf.embedPng(bytes);
    if (isJpg) return await pdf.embedJpg(bytes);
    console.error(`Unsupported image format (use PNG or JPG): ${label}`);
    return null;
  } catch (error) {
    console.error(`Failed to embed image: ${label}`, error.message);
    return null;
  }
}

async function loadImage(pdf, envVar, ...fallbackPaths) {
  const bytes = await optionalFile(envVar, ...fallbackPaths);
  if (!bytes) {
    console.warn(`Logo not found for ${envVar}; certificate will render without it.`);
    return null;
  }
  return embedImageBytes(pdf, bytes, envVar);
}

// ------------------------------------------------------------
// FONTS
//   serif (headings, names)  : CERTIFICATE_FONT_PATH / _BOLD / _ITALIC
//   sans  (labels, metadata) : CERTIFICATE_SANS_FONT_PATH / _SANS_BOLD
// Anything missing falls back to a built-in PDF font, so the
// certificate always renders.
// ------------------------------------------------------------
async function loadFonts(pdf) {
  const [regularBytes, boldBytes, italicBytes, sansBytes, sansBoldBytes, displayBytes, nameBytes] = await Promise.all([
    optionalFile('CERTIFICATE_FONT_PATH', 'public/fonts/NotoSerif-Regular.ttf', 'public/fonts/Lora-Regular.ttf'),
    optionalFile('CERTIFICATE_BOLD_FONT_PATH', 'public/fonts/NotoSerif-Bold.ttf', 'public/fonts/Lora-Bold.ttf'),
    optionalFile('CERTIFICATE_ITALIC_FONT_PATH', 'public/fonts/NotoSerif-Italic.ttf', 'public/fonts/Lora-Italic.ttf'),
    optionalFile('CERTIFICATE_SANS_FONT_PATH', 'public/fonts/DMSans-Regular.ttf', 'public/fonts/NotoSans-Regular.ttf'),
    optionalFile('CERTIFICATE_SANS_BOLD_FONT_PATH', 'public/fonts/DMSans-Bold.ttf', 'public/fonts/NotoSans-Bold.ttf'),
    // Optional display fonts (ribbon title / author name). Missing files simply fall back.
    optionalFile('CERTIFICATE_DISPLAY_FONT_PATH', 'public/fonts/PlayfairDisplay-Bold.ttf'),
    optionalFile('CERTIFICATE_NAME_FONT_PATH', 'public/fonts/CormorantGaramond-Italic.ttf', 'public/fonts/CormorantGaramond-MediumItalic.ttf')
  ]);

  if ([regularBytes, boldBytes, italicBytes, sansBytes, sansBoldBytes, displayBytes, nameBytes].some(Boolean)) {
    pdf.registerFontkit(fontkit);
  }

  const embed = async (bytes) => {
    if (!bytes) return null;
    try {
      return await pdf.embedFont(bytes, { subset: true });
    } catch (error) {
      console.error('Font embed failed, using fallback:', error.message);
      return null;
    }
  };

  // Serif family
  let regular = await embed(regularBytes);
  const unicode = Boolean(regular);
  let bold;
  let italic;

  if (unicode) {
    bold = (await embed(boldBytes)) || regular;
    italic = (await embed(italicBytes)) || bold; // no italic file -> bold, still Unicode-safe
  } else {
    regular = await pdf.embedFont(StandardFonts.TimesRoman);
    bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  }

  // Sans family
  let sans = await embed(sansBytes);
  const sansUnicode = Boolean(sans);
  let sansBold;
  if (sansUnicode) {
    sansBold = (await embed(sansBoldBytes)) || sans;
  } else {
    sans = await pdf.embedFont(StandardFonts.Helvetica);
    sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }

  // Display fonts only apply when the main serif family is Unicode-capable.
  let display = bold;
  let nameItalic = italic;
  if (unicode) {
    display = (await embed(displayBytes)) || bold;
    nameItalic = (await embed(nameBytes)) || italic;
  }

  return { regular, bold, italic, sans, sansBold, display, nameItalic, unicode, sansUnicode };
}

// Throws when text cannot be shown with built-in fonts (author / title text).
function checkFontText(text, fonts) {
  if (!fonts.unicode && /[^\u0000-\u00ff]/u.test(String(text || ''))) {
    throw new Error('A certificate contains non-Latin characters.');
  }
}

// For short labels set in the sans font: never fail, just replace.
function sansSafe(text, fonts) {
  const value = String(text ?? '');
  return fonts.sansUnicode ? value : value.replace(/[^\u0000-\u00ff]/gu, '?');
}

// ------------------------------------------------------------
// TEXT HELPERS
// ------------------------------------------------------------
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

function spacedWidth(text, font, size, spacing) {
  const chars = Array.from(String(text));
  const glyphs = chars.reduce((sum, ch) => sum + font.widthOfTextAtSize(ch, size), 0);
  return glyphs + spacing * Math.max(0, chars.length - 1);
}

// Draws text with letter-spacing. `base` is the baseline in design-grid (top-left) units.
function drawSpaced(page, text, { x, base, font, size, color, spacing = 0, align = 'left' }) {
  const chars = Array.from(String(text ?? ''));
  const total = spacedWidth(text, font, size, spacing);
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;

  for (const ch of chars) {
    if (ch.trim()) {
      page.drawText(ch, { x: cursor, y: Y(base), size, font, color });
    }
    cursor += font.widthOfTextAtSize(ch, size) + spacing;
  }
}

function drawText(page, text, { x, base, font, size, color, align = 'left' }) {
  const value = String(text ?? '');
  const width = font.widthOfTextAtSize(value, size);
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  page.drawText(value, { x: left, y: Y(base), size, font, color });
}

function roundedRectPath(w, h, r) {
  return (
    `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} ` +
    `Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
  );
}

function drawRoundedRect(page, { x, top, w, h, r, color, borderColor, borderWidth }) {
  page.drawSvgPath(roundedRectPath(w, h, r), {
    x,
    y: Y(top),
    color,
    borderColor,
    borderWidth
  });
}

function hostOf(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

// ------------------------------------------------------------
// DRAWING PRIMITIVES (gradients are built from thin strips so the
// output stays plain, widely compatible PDF)
// ------------------------------------------------------------
const CX = W / 2;
const HEADER_Y = 96; // vertical centre of the logo / seal row

const FOIL_STOPS = ['#8a6420', '#e3c27a', '#b8893b', '#ebd08c', '#8a6420'];
const BAND_STOPS = ['#235641', '#17392d', '#112e22'];

const rgbOf = (value) => {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function mix(stops, t) {
  const pts = stops.map(rgbOf);
  const scaled = Math.min(Math.max(t, 0), 1) * (pts.length - 1);
  const i = Math.min(Math.floor(scaled), pts.length - 2);
  const f = scaled - i;
  const c = pts[i].map((v, k) => (v + (pts[i + 1][k] - v) * f) / 255);
  return rgb(c[0], c[1], c[2]);
}

function hGradient(page, { x, top, w, h, stops, steps = 60 }) {
  const sw = w / steps;
  for (let i = 0; i < steps; i += 1) {
    page.drawRectangle({
      x: x + i * sw,
      y: Y(top + h),
      width: sw + 0.6,
      height: h,
      color: mix(stops, (i + 0.5) / steps)
    });
  }
}

function vGradient(page, { x, top, w, h, stops, steps = 24 }) {
  const sh = h / steps;
  for (let i = 0; i < steps; i += 1) {
    page.drawRectangle({
      x,
      y: Y(top + (i + 1) * sh) - 0.3,
      width: w,
      height: sh + 0.6,
      color: mix(stops, (i + 0.5) / steps)
    });
  }
}

// Closed polygon from [x, top] points (design-grid units).
function polygon(page, points, options) {
  const d = points.map(([px, py], i) => `${i ? 'L' : 'M'} ${px} ${py}`).join(' ') + ' Z';
  page.drawSvgPath(d, { x: 0, y: H, ...options });
}

// Horizontal hairline that fades out; fadeIn=true grows toward the right end.
function fadeLine(page, { x1, x2, y, fadeIn, color, steps = 16 }) {
  const sw = (x2 - x1) / steps;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    page.drawLine({
      start: { x: x1 + i * sw, y: Y(y) },
      end: { x: x1 + (i + 1) * sw + 0.4, y: Y(y) },
      thickness: 1,
      color,
      opacity: fadeIn ? t : 1 - t
    });
  }
}

// Never let a purely decorative element break certificate generation.
function safely(label, task) {
  try {
    return task();
  } catch (error) {
    console.error(`Certificate decoration skipped (${label}):`, error.message);
    return undefined;
  }
}

// ------------------------------------------------------------
// HEADER: Figshare logo | seal | Google Scholar logo
// ------------------------------------------------------------
function drawSeal(page, fonts, monogram) {
  page.drawCircle({ x: CX, y: Y(HEADER_Y), size: 39.5, borderColor: C.gold, borderWidth: 1.7 });
  page.drawCircle({ x: CX, y: Y(HEADER_Y), size: 34.4, color: C.band });
  page.drawCircle({
    x: CX,
    y: Y(HEADER_Y),
    size: 29.4,
    borderColor: C.gold,
    borderWidth: 0.85,
    borderDashArray: [1.7, 2.5]
  });
  drawText(page, sansSafe(monogram, fonts), {
    x: CX,
    base: HEADER_Y + 6.8,
    font: fonts.bold,
    size: 20,
    color: C.white,
    align: 'center'
  });
}

// ------------------------------------------------------------
// LOGO SIZING
// Each logo is scaled to fit inside its own box (aspect ratio kept) and
// centred on the header row. To make a logo bigger or smaller, change only
// its `w` (max width) and `h` (max height) below; whichever is reached first
// limits the size.
//
//   figshare : wide mark + text, roughly 3.3 : 1  -> limited by height
//   scholar  : trimmed wordmark, roughly 6.4 : 1  -> limited by width
//
// The two boxes are chosen so both logos read as the same visual size.
// ------------------------------------------------------------
const LOGO_BOXES = {
  figshare: { cx: 383.5, w: 176, h: 54 },
  scholar: { cx: 739.5, w: 190, h: 54 }
};

function drawLogo(page, logo, box) {
  if (!logo) return;
  const scale = Math.min(box.w / logo.width, box.h / logo.height);
  const w = logo.width * scale;
  const h = logo.height * scale;
  page.drawImage(logo, {
    x: box.cx - w / 2,
    y: Y(HEADER_Y) - h / 2,
    width: w,
    height: h
  });
}

function drawHeader(page, fonts, brand, logos) {
  safely('header lines', () => {
    fadeLine(page, { x1: 118, x2: 258, y: HEADER_Y, fadeIn: true, color: C.gold });
    fadeLine(page, { x1: 865, x2: 1005, y: HEADER_Y, fadeIn: false, color: C.gold });
  });
  safely('seal', () => drawSeal(page, fonts, brand.monogram));
  safely('logos', () => {
    drawLogo(page, logos.figshare, LOGO_BOXES.figshare);
    drawLogo(page, logos.scholar, LOGO_BOXES.scholar);
  });
}

// ------------------------------------------------------------
// RIBBON: folded green banner with foil edges and stitching
// ------------------------------------------------------------
const RIBBON = { left: 190, right: 933, top: 186, height: 72 };

function drawRibbon(page, fonts) {
  const { left, right, top, height } = RIBBON;
  const width = right - left;
  const mirror = (px) => W - px;

  safely('ribbon shadow', () => {
    [4, 6, 8].forEach((offset) => {
      page.drawRectangle({
        x: left + 6,
        y: Y(top + height + offset),
        width: width - 12,
        height,
        color: C.shadow,
        opacity: 0.06
      });
    });
  });

  safely('ribbon tails', () => {
    const tail = [[114, 202], [212, 202], [212, 274], [114, 274], [142, 238]];
    const fold = [[190, 258], [212, 274], [190, 274]];
    polygon(page, tail, { color: hex('#0f2a20') });
    polygon(page, tail.map(([px, py]) => [mirror(px), py]), { color: hex('#0f2a20') });
    polygon(page, fold, { color: hex('#07160f') });
    polygon(page, fold.map(([px, py]) => [mirror(px), py]), { color: hex('#07160f') });
  });

  safely('ribbon band', () => {
    vGradient(page, { x: left, top, w: width, h: height, stops: BAND_STOPS });
    hGradient(page, { x: left, top, w: width, h: 3, stops: FOIL_STOPS });
    hGradient(page, { x: left, top: top + height - 3, w: width, h: 3, stops: FOIL_STOPS });

    [top + 10, top + height - 10].forEach((lineTop) => {
      page.drawLine({
        start: { x: left + 16, y: Y(lineTop) },
        end: { x: right - 16, y: Y(lineTop) },
        thickness: 1,
        color: C.gold,
        opacity: 0.85,
        dashArray: [5, 4]
      });
    });

    const mid = top + height / 2;
    [[228, mid], [895, mid]].forEach(([dx, dy]) => {
      polygon(page, [[dx - 6, dy], [dx, dy - 6], [dx + 6, dy], [dx, dy + 6]], { color: C.gold });
    });
  });

  // Title (always drawn, auto-fitted between the two diamonds)
  const label = 'CERTIFICATE OF PUBLICATION';
  let size = 36;
  let spacing = 3;
  while (size > 22 && spacedWidth(label, fonts.display, size, spacing) > 620) {
    size -= 0.5;
    spacing = size * 0.083;
  }
  drawSpaced(page, label, {
    x: CX,
    base: top + height / 2 + size * 0.35,
    font: fonts.display,
    size,
    color: C.cream,
    spacing,
    align: 'center'
  });
}

// ------------------------------------------------------------
// FOOTER: QR (right)
// ------------------------------------------------------------
const FOOTER_BASE = 734; // shared baseline of the three footer blocks

async function drawQr(page, pdf, fonts, verifyUrl) {
  if (!verifyUrl) return;

  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 480,
    margin: 0,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f2a20', light: '#ffffff' }
  });
  const qrImage = await pdf.embedPng(qrBuffer);

  const tile = 92;
  const centerX = 983;
  const tileX = centerX - tile / 2;
  const tileTop = FOOTER_BASE - 16 - tile;

  page.drawRectangle({
    x: tileX,
    y: Y(tileTop + tile),
    width: tile,
    height: tile,
    color: C.white,
    borderColor: C.band,
    borderWidth: 2
  });

  const pad = 7;
  page.drawImage(qrImage, {
    x: tileX + pad,
    y: Y(tileTop + tile - pad),
    width: tile - pad * 2,
    height: tile - pad * 2
  });

  drawSpaced(page, 'SCAN TO VERIFY', {
    x: centerX,
    base: FOOTER_BASE,
    font: fonts.sans,
    size: 10,
    color: C.muted,
    spacing: 1.6,
    align: 'center'
  });
}

// ============================================================
// 1. CERTIFICATE
// ============================================================
export async function generateCertificatePdf({ paper, certificate, verifyUrl }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);

  const authorName = certificate.authorName || paper.authors?.[certificate.authorIndex]?.name || 'Author';
  const coauthors = (paper.authors || [])
    .filter((_, index) => index !== certificate.authorIndex)
    .map((author) => author.name)
    .filter(Boolean)
    .join(', ');

  const journalName = process.env.JOURNAL_NAME || 'International Journal of Research and Open Science';
  const brand = {
    shortName: String(process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase(),
    monogram: String(process.env.JOURNAL_MONOGRAM || 'IJ').toUpperCase(),
    host: hostOf(process.env.JOURNAL_WEBSITE) || 'ijros.com'
  };
  const doi = paper.figshare?.doi || paper.doi || '';
  const paperId = paper.id || 'N/A';
  const certificateId = certificate.certificateId || 'N/A';

  [paper.title, authorName, coauthors].forEach((item) => checkFontText(item, fonts));

  pdf.setTitle(`Certificate of Publication - ${paper.title || paperId}`);
  pdf.setAuthor(journalName);
  pdf.setSubject(`Certificate ${certificateId}`);

  const page = pdf.addPage([W, H]);

  // Background + double gold frame
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.cream });
  page.drawRectangle({ x: 23, y: 23, width: W - 46, height: H - 46, borderColor: C.gold, borderWidth: 2 });
  page.drawRectangle({ x: 32.5, y: 32.5, width: W - 65, height: H - 65, borderColor: C.goldLine, borderWidth: 1 });

  // Header: logos + seal
  const logos = {
    figshare: await loadImage(pdf, 'FIGSHARE_LOGO_PATH', 'public/brand/figshare.png'),
    scholar: await loadImage(pdf, 'GOOGLE_SCHOLAR_LOGO_PATH', 'public/brand/google-scholar.png')
  };
  drawHeader(page, fonts, brand, logos);

  // Journal name
  const journalUpper = sansSafe(journalName.toUpperCase(), fonts);
  let journalSize = 12;
  let journalSpacing = 3.4;
  while (journalSize > 8 && spacedWidth(journalUpper, fonts.sansBold, journalSize, journalSpacing) > 800) {
    journalSize -= 0.5;
    journalSpacing = journalSize * 0.28;
  }
  drawSpaced(page, journalUpper, {
    x: CX,
    base: 162,
    font: fonts.sansBold,
    size: journalSize,
    color: C.goldText,
    spacing: journalSpacing,
    align: 'center'
  });

  // Ribbon title
  drawRibbon(page, fonts);

  drawSpaced(page, 'THIS IS TO CERTIFY THAT', {
    x: CX,
    base: 311,
    font: fonts.sans,
    size: 12,
    color: C.muted,
    spacing: 2.4,
    align: 'center'
  });

  // Author name (italic serif, centred, auto-fitted)
  const contentWidth = 830;
  const nameFit = fitText(authorName, fonts.nameItalic, {
    maxWidth: contentWidth,
    maxHeight: 80,
    maxSize: 64,
    minSize: 28,
    lineHeightRatio: 1.12
  });
  const nameBase = 382;
  nameFit.lines.forEach((line, index) => {
    drawText(page, line, {
      x: CX,
      base: nameBase + index * nameFit.lineHeight,
      font: fonts.nameItalic,
      size: nameFit.size,
      color: C.ink,
      align: 'center'
    });
  });
  const lastNameBase = nameBase + (nameFit.lines.length - 1) * nameFit.lineHeight;

  // Gold ornament under the name
  const ornamentY = lastNameBase + 23;
  safely('ornament', () => {
    page.drawLine({ start: { x: 442.5, y: Y(ornamentY) }, end: { x: 542.5, y: Y(ornamentY) }, thickness: 1, color: C.gold });
    page.drawLine({ start: { x: 580.5, y: Y(ornamentY) }, end: { x: 680.5, y: Y(ornamentY) }, thickness: 1, color: C.gold });
    polygon(
      page,
      [[CX - 5, ornamentY], [CX, ornamentY - 5], [CX + 5, ornamentY], [CX, ornamentY + 5]],
      { color: C.gold }
    );
  });

  // "has authored..."
  const descBase = ornamentY + 27;
  drawText(page, 'has authored the research paper entitled', {
    x: CX,
    base: descBase,
    font: fonts.regular,
    size: 14,
    color: C.muted,
    align: 'center'
  });

  // Paper title
  const titleBase = descBase + 39;
  const titleFit = fitText(paper.title || 'Untitled manuscript', fonts.bold, {
    maxWidth: contentWidth,
    maxHeight: Math.max(64, 575 - titleBase),
    maxSize: 23,
    minSize: 12,
    lineHeightRatio: 1.4
  });
  titleFit.lines.forEach((line, index) => {
    drawText(page, line, {
      x: CX,
      base: titleBase + index * titleFit.lineHeight,
      font: fonts.bold,
      size: titleFit.size,
      color: C.ink,
      align: 'center'
    });
  });
  let cursor = titleBase + (titleFit.lines.length - 1) * titleFit.lineHeight;

  // Co-authors (optional)
  if (coauthors) {
    const coFit = fitText(`Co-authors: ${coauthors}`, fonts.regular, {
      maxWidth: contentWidth,
      maxHeight: 38,
      maxSize: 13,
      minSize: 8.5,
      lineHeightRatio: 1.25
    });
    cursor += 27;
    coFit.lines.forEach((line, index) => {
      drawText(page, line, {
        x: CX,
        base: cursor + index * coFit.lineHeight,
        font: fonts.regular,
        size: coFit.size,
        color: C.muted,
        align: 'center'
      });
    });
    cursor += (coFit.lines.length - 1) * coFit.lineHeight;
  }

  // Published line
  const publishedAt = paper.publishedAt ? new Date(paper.publishedAt) : new Date();
  const validDate = Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt;
  const dateLabel = validDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const volumeText = paper.volume
    ? /^vol/i.test(String(paper.volume)) ? String(paper.volume) : `Volume ${paper.volume}`
    : '';
  const issueText = paper.issue
    ? /^issue/i.test(String(paper.issue)) ? String(paper.issue) : `Issue ${paper.issue}`
    : '';
  const publishedLine = [`Published ${dateLabel}`, volumeText, issueText].filter(Boolean).join(' \u00b7 ');

  drawText(page, sansSafe(publishedLine, fonts), {
    x: CX,
    base: Math.min(cursor + 36, 625),
    font: fonts.sans,
    size: 13,
    color: C.muted,
    align: 'center'
  });

  // Footer left: certificate / paper / DOI (bottom row shares FOOTER_BASE)
  const metaRows = [
    ['Certificate ID', certificateId],
    ['Paper ID', paperId]
  ];
  if (doi) metaRows.push(['DOI', doi]);

  const metaStep = 20.4;
  metaRows.forEach(([label, value], index) => {
    const base = FOOTER_BASE - (metaRows.length - 1 - index) * metaStep;
    const labelText = sansSafe(label, fonts);
    drawText(page, labelText, { x: 90, base, font: fonts.sansBold, size: 12, color: C.ink });
    const labelWidth = fonts.sansBold.widthOfTextAtSize(labelText, 12);
    drawText(page, sansSafe(value, fonts), {
      x: 90 + labelWidth + 6,
      base,
      font: fonts.sans,
      size: 12,
      color: C.muted
    });
  });

  // Footer centre: editor signature
  const signatureBytes = await optionalFile('EDITOR_SIGNATURE_PATH', 'public/brand/editor-signature.png');
  const signature = await embedImageBytes(pdf, signatureBytes, 'EDITOR_SIGNATURE_PATH');
  const lineY = FOOTER_BASE - 36;
  if (signature) {
    const dims = signature.scaleToFit(190, 52);
    page.drawImage(signature, {
      x: CX - dims.width / 2,
      y: Y(lineY - 3),
      width: dims.width,
      height: dims.height
    });
  }
  page.drawLine({
    start: { x: CX - 100, y: Y(lineY) },
    end: { x: CX + 100, y: Y(lineY) },
    thickness: 1,
    color: C.ink
  });
  drawText(page, 'Editorial Office', {
    x: CX,
    base: FOOTER_BASE - 17,
    font: fonts.sansBold,
    size: 13,
    color: C.ink,
    align: 'center'
  });
  drawText(page, sansSafe(`Editor, ${brand.shortName}`, fonts), {
    x: CX,
    base: FOOTER_BASE,
    font: fonts.sans,
    size: 12,
    color: C.muted,
    align: 'center'
  });

  // Footer right: verification QR
  await drawQr(page, pdf, fonts, verifyUrl);

  // Scale the design grid to real A4 landscape (no-op if unsupported)
  try {
    const k = A4_LANDSCAPE_WIDTH / W;
    if (typeof page.scale === 'function') page.scale(k, k);
  } catch (error) {
    console.error('Page scaling skipped:', error.message);
  }

  return Buffer.from(await pdf.save());
}

// ============================================================
// 2. PAYMENT RECEIPT (behaviour preserved, themed to match)
// ============================================================
export async function generatePaymentReceiptPdf({ paper, payment }) {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);

  [paper.title, paper.id, paper.submitterName, paper.authors?.[0]?.name, payment.utr].forEach((item) =>
    checkFontText(item, fonts)
  );

  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const shortName = String(process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase();

  page.drawRectangle({ x: 0, y: 0, width, height, color: C.white });
  page.drawRectangle({ x: 26, y: 26, width: width - 52, height: height - 52, borderColor: C.band, borderWidth: 1.4 });
  page.drawRectangle({ x: 26, y: height - 170, width: width - 52, height: 144, color: C.band });
  page.drawRectangle({ x: 26, y: height - 174, width: width - 52, height: 4, color: C.gold });

  page.drawText(`${shortName} \u00b7 EDITORIAL OFFICE`, {
    x: 52,
    y: height - 62,
    size: 11,
    font: fonts.bold,
    color: C.gold
  });
  page.drawText('PAYMENT RECEIPT', { x: 52, y: height - 111, size: 27, font: fonts.bold, color: C.white });
  page.drawText('Manual UPI payment confirmation', {
    x: 54,
    y: height - 137,
    size: 10,
    font: fonts.regular,
    color: C.white
  });

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
    lines.slice(0, 2).forEach((line, index) => {
      page.drawText(line, { x: 54, y: y - 17 - index * 13, size: 10, font: fonts.regular, color: C.ink });
    });
    y -= 52;
  }

  page.drawText('This receipt confirms that the journal marked the submitted UPI payment as received.', {
    x: 54,
    y: 104,
    size: 8.5,
    font: fonts.regular,
    color: C.muted
  });
  page.drawText('Keep this receipt with your publication records.', {
    x: 54,
    y: 88,
    size: 8.5,
    font: fonts.regular,
    color: C.muted
  });
  page.drawText(process.env.JOURNAL_NAME || 'International Journal of Research and Open Science', {
    x: 54,
    y: 56,
    size: 8,
    font: fonts.bold,
    color: C.band
  });

  return Buffer.from(await pdf.save());
}