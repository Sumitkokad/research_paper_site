// ============================================================
// IJROS EMAIL SENDER
// Same exports as before: sendEmail, sendAdminNotice
// Theme matches the certificate + website:
//   forest green header with the IJ seal, gold stripe, cream panels.
// Publication emails also show the Figshare / Google Scholar logos
// (sent as inline images; skipped silently if the files are missing).
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { escapeHtml } from './core.mjs';

const EMAIL_TIMEOUT_MS = 25000;

// ------------------------------------------------------------
// THEME
// ------------------------------------------------------------
const T = {
  band: '#183a2e',
  bandDeep: '#12302a',
  green: '#1f4d3a',
  gold: '#b08d57',
  goldLight: '#c29d5a',
  goldText: '#9a7030',
  cream: '#faf7f2',
  creamDeep: '#f3ede4',
  line: '#e2ddd4',
  ink: '#1d2520',
  inkLight: '#4f5a54',
  muted: '#7a857e',
  pale: '#d9dfbd',
  footer: '#14211b'
};

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',Arial,Helvetica,sans-serif";

// ------------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------------
function clean(value) {
  return String(value ?? '').trim();
}

function html(value) {
  return escapeHtml(clean(value));
}

function getBrand() {
  return {
    shortName: clean(process.env.JOURNAL_SHORT_NAME || 'IJROS').toUpperCase(),
    monogram: clean(process.env.JOURNAL_MONOGRAM || 'IJ').toUpperCase(),
    name: clean(process.env.JOURNAL_NAME || 'International Journal of Research and Open Science'),
    issn: clean(process.env.JOURNAL_ISSN),
    website: clean(process.env.JOURNAL_WEBSITE),
    email: clean(process.env.JOURNAL_EMAIL)
  };
}

function getSiteUrl(options = {}) {
  return clean(options.siteUrl || process.env.JOURNAL_SITE_URL || process.env.URL || '').replace(/\/+$/, '');
}

function makeUrl(value, siteUrl = '') {
  const raw = clean(value);
  if (!raw) return '';

  try {
    const url = new URL(raw, siteUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeDoi(value) {
  const raw = clean(value);
  if (!raw) return null;

  const doi = raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();

  if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) return null;

  return {
    value: doi,
    url: `https://doi.org/${doi}`
  };
}

function getPaperName(paper = {}) {
  return paper.authorName || paper.submitterName || paper.name || paper.author || 'Author';
}

function getPaperTitle(paper = {}) {
  return paper.title || paper.manuscriptTitle || 'Your manuscript';
}

function getPaperId(paper = {}) {
  return paper.paperId || paper.id || paper.reference || 'Not available';
}

function getFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

// ------------------------------------------------------------
// HTML BUILDING BLOCKS (table based for email-client support)
// ------------------------------------------------------------
function button(url, label, variant = 'primary') {
  if (!url) return '';

  const primary = variant === 'primary';
  const background = primary ? T.green : '#ffffff';
  const color = primary ? '#ffffff' : T.green;
  const border = primary ? T.green : T.gold;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;">
      <tr>
        <td style="background:${background};border:1px solid ${border};border-radius:5px;">
          <a href="${html(url)}"
             style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:14px;
                    font-weight:700;color:${color};text-decoration:none;letter-spacing:0.01em;">
            ${html(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function paragraph(content) {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.7;color:${T.inkLight};">${content}</p>`;
}

function greetingBlock(author) {
  return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:19px;line-height:1.4;color:${T.ink};">Dear ${html(author)},</p>`;
}

// Cream panel with gold left rule: Manuscript / Reference ID / extras
function detailsPanel(rows) {
  const visible = rows.filter(([, value]) => clean(value));
  if (!visible.length) return '';

  const body = visible
    .map(
      ([label, value, mono]) => `
        <tr>
          <td style="padding:6px 0;font-family:${SANS};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${T.muted};width:128px;vertical-align:top;">
            ${html(label)}
          </td>
          <td style="padding:6px 0;font-family:${mono ? "'Courier New',monospace" : SERIF};font-size:${mono ? '13px' : '15px'};line-height:1.5;color:${T.ink};font-weight:${mono ? '400' : '700'};word-break:break-word;">
            ${html(value)}
          </td>
        </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:6px 0 20px;background:${T.creamDeep};border-left:4px solid ${T.gold};border-radius:4px;">
      <tr><td style="padding:12px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
      </td></tr>
    </table>
  `;
}

function noticeBox(content) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
      <tr>
        <td style="background:#fbf6ea;border:1px solid #e7d8b8;border-left:4px solid ${T.gold};border-radius:4px;padding:14px 16px;font-family:${SANS};font-size:13.5px;line-height:1.65;color:#7a5b23;">
          ${content}
        </td>
      </tr>
    </table>
  `;
}

function tokenBox(token) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;">
      <tr>
        <td style="background:#ffffff;border:1px dashed ${T.gold};border-radius:5px;padding:10px 14px;font-family:'Courier New',monospace;font-size:13px;color:${T.band};word-break:break-all;">
          ${html(token || '')}
        </td>
      </tr>
    </table>
  `;
}

// IJ seal drawn with a table cell (works without images)
function sealHtml(brand) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
      <tr>
        <td width="62" height="62" align="center" valign="middle"
            style="width:62px;height:62px;border-radius:50%;background:${T.bandDeep};border:3px solid ${T.goldLight};
                   font-family:${SERIF};font-size:23px;font-weight:700;color:#ffffff;line-height:62px;">
          ${html(brand.monogram)}
        </td>
      </tr>
    </table>
  `;
}

// Figshare / Google Scholar logos (publication emails only)
function logoStrip(logos = []) {
  if (!logos.length) return '';

  const cells = logos
    .map(
      (logo, index) => `
        ${index > 0 ? `<td width="1" style="width:1px;background:#d9d3c3;font-size:0;line-height:0;">&nbsp;</td>` : ''}
        <td align="center" style="padding:10px 22px;">
          <img src="cid:${html(logo.cid)}" alt="${html(logo.alt)}" height="30"
               style="display:block;height:30px;width:auto;border:0;outline:none;">
        </td>`
    )
    .join('');

  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"
           style="margin:24px auto 4px;background:#fffdf8;border:1px solid #e0d4b0;border-radius:12px;">
      <tr>${cells}</tr>
    </table>
  `;
}

function emailLayout(title, body) {
  const brand = getBrand();
  const contact = [brand.website, brand.email].filter(Boolean).join('  \u00b7  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${html(title)}</title>
</head>
<body style="margin:0;padding:0;background:${T.cream};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${T.cream};">${html(title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.cream};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:640px;background:#ffffff;border:1px solid ${T.line};border-radius:10px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:${T.band};padding:30px 24px 24px;">
              ${sealHtml(brand)}
              <div style="font-family:${SERIF};font-size:28px;font-weight:700;letter-spacing:0.06em;color:#ffffff;line-height:1.2;">
                ${html(brand.shortName)}
              </div>
              <div style="margin-top:6px;font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${T.goldLight};line-height:1.6;">
                ${html(brand.name)}
              </div>
              <div style="margin-top:10px;font-family:${SANS};font-size:10.5px;letter-spacing:0.2em;text-transform:uppercase;color:${T.pale};">
                Peer-reviewed &nbsp;&middot;&nbsp; Open access &nbsp;&middot;&nbsp; DOI via Figshare
              </div>
            </td>
          </tr>
          <tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:${T.goldLight};">&nbsp;</td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 34px 26px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:${T.footer};padding:22px 28px;">
              <div style="font-family:${SERIF};font-size:15px;color:#ffffff;margin-bottom:6px;">${html(brand.name)}</div>
              ${brand.issn ? `<div style="font-family:${SANS};font-size:12px;color:${T.pale};margin-bottom:6px;">ISSN ${html(brand.issn)}</div>` : ''}
              ${contact ? `<div style="font-family:${SANS};font-size:12px;color:#a8b5ae;margin-bottom:10px;">${html(contact)}</div>` : ''}
              <div style="font-family:${SANS};font-size:11.5px;line-height:1.6;color:#86948b;">
                This is an automated email from the journal editorial system.
                Please do not reply unless the journal has provided a reply address.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ------------------------------------------------------------
// EMAIL CONTENT
// ------------------------------------------------------------
function makeEmail(type, paper = {}, options = {}, extras = {}) {
  paper = paper || {};
  options = options || {};

  const author = getPaperName(paper);
  const title = getPaperTitle(paper);
  const paperId = getPaperId(paper);
  const siteUrl = getSiteUrl(options);

  const trackingUrl = makeUrl(getFirst(options.trackingUrl, paper.trackingUrl), siteUrl);
  const paperUrl = makeUrl(getFirst(options.paperUrl, paper.paperUrl, paper.publicUrl), siteUrl);
  const paymentUrl = makeUrl(getFirst(options.paymentUrl, paper.paymentUrl), siteUrl);

  const reason = getFirst(options.reason, options.comments, options.message);
  const amount = getFirst(options.amount, paper.amount, paper.paymentAmount);
  const utr = getFirst(options.utr, paper.utr, paper.paymentUtr);

  const greeting = greetingBlock(author);

  const manuscript = detailsPanel([
    ['Manuscript', title],
    ['Reference ID', paperId, true]
  ]);

  let subject = '';
  let body = '';
  let textBody = '';

  switch (type) {
    case 'submitted':
      subject = `Manuscript received \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('We have successfully received your manuscript. It is now in the editorial review process, and you will receive another email when the editorial team updates its status.')}
        ${manuscript}
        ${paragraph(`<strong style="color:${T.ink};">Private tracking token</strong><br>Save this token together with your Paper ID. The button below is the fastest way back to your submission.`)}
        ${tokenBox(options.token)}
        ${button(trackingUrl, 'Track your submission')}
        ${paragraph('Thank you for submitting your work.')}
      `;
      textBody = `Dear ${author},

Your manuscript has been received.
Title: ${title}
Reference ID: ${paperId}
Private tracking token: ${options.token || ''}
Track your submission: ${trackingUrl || 'Use the journal tracking page.'}`;
      break;

    case 'accepted':
      subject = `Manuscript accepted \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph("We are pleased to inform you that your manuscript has been accepted for the next stage of the journal's publication process.")}
        ${manuscript}
        ${paragraph('Please follow the payment or editorial instructions provided by the journal.')}
        ${button(paymentUrl, 'View payment instructions')}
        ${button(trackingUrl, 'Track your submission', 'secondary')}
      `;
      textBody = `Dear ${author},

Your manuscript has been accepted for the next stage.
Title: ${title}
Reference ID: ${paperId}
${paymentUrl ? `Payment instructions: ${paymentUrl}\n` : ''}${trackingUrl ? `Tracking: ${trackingUrl}` : ''}`;
      break;

    case 'revision':
      subject = `Revision required \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('The editorial team has reviewed your manuscript and requests revisions.')}
        ${manuscript}
        ${reason ? noticeBox(`<strong>Editorial comments</strong><br>${html(reason).replace(/\n/g, '<br>')}`) : ''}
        ${paragraph('Please review the comments and submit the revised manuscript through the journal.')}
        ${button(trackingUrl, 'View submission')}
      `;
      textBody = `Dear ${author},

Revision is required for your manuscript.
Title: ${title}
Reference ID: ${paperId}
${reason ? `Editorial comments: ${reason}\n` : ''}${trackingUrl ? `Submission: ${trackingUrl}` : ''}`;
      break;

    case 'rejected':
      subject = `Manuscript decision \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('Thank you for submitting your manuscript. After editorial review, we regret to inform you that the journal is unable to accept it for publication.')}
        ${manuscript}
        ${reason ? noticeBox(`<strong>Editorial comments</strong><br>${html(reason).replace(/\n/g, '<br>')}`) : ''}
        ${paragraph('We appreciate your interest in the journal.')}
      `;
      textBody = `Dear ${author},

The journal is unable to accept your manuscript.
Title: ${title}
Reference ID: ${paperId}
${reason ? `Editorial comments: ${reason}` : ''}`;
      break;

    case 'payment_received':
      subject = `Payment confirmed \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('Your payment has been reviewed and confirmed by the journal.')}
        ${detailsPanel([
          ['Manuscript', title],
          ['Reference ID', paperId, true],
          ['Amount', amount],
          ['UTR', utr, true]
        ])}
        ${noticeBox('<strong>Important:</strong> Payment confirmation does not itself publish your manuscript. The editorial team will complete the remaining checks and handle repository submission and publication separately.')}
        ${button(trackingUrl, 'Track your submission')}
        ${paragraph('Thank you.')}
      `;
      textBody = `Dear ${author},

Your payment has been confirmed.
Title: ${title}
Reference ID: ${paperId}
${amount ? `Amount: ${amount}\n` : ''}${utr ? `UTR: ${utr}\n` : ''}
Payment confirmation does not itself publish your manuscript. Publication will take place separately after the remaining checks and repository process.
${trackingUrl ? `Track your submission: ${trackingUrl}` : ''}`;
      break;

    case 'payment_submitted':
      subject = `Payment details received \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('We have received your payment details and transaction reference.')}
        ${detailsPanel([
          ['Manuscript', title],
          ['Reference ID', paperId, true],
          ['Amount submitted', amount],
          ['UTR', utr, true]
        ])}
        ${paragraph('The journal team will verify the transaction. Your manuscript will not be published automatically when payment details are submitted.')}
        ${button(trackingUrl, 'Track your submission')}
      `;
      textBody = `Dear ${author},

Your payment details have been received and are awaiting verification.
Title: ${title}
Reference ID: ${paperId}
${amount ? `Amount: ${amount}\n` : ''}${utr ? `UTR: ${utr}\n` : ''}
Payment submission does not automatically publish your manuscript.
${trackingUrl ? `Tracking: ${trackingUrl}` : ''}`;
      break;

    case 'payment_rejected':
      subject = `Payment verification update \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('We could not confirm your submitted payment details.')}
        ${manuscript}
        ${reason ? noticeBox(`<strong>Reason</strong><br>${html(reason).replace(/\n/g, '<br>')}`) : ''}
        ${paragraph('Please review the details and contact the journal if you need assistance.')}
        ${button(trackingUrl, 'View submission')}
      `;
      textBody = `Dear ${author},

Your payment could not be confirmed.
Title: ${title}
Reference ID: ${paperId}
${reason ? `Reason: ${reason}\n` : ''}${trackingUrl ? `Tracking: ${trackingUrl}` : ''}`;
      break;

    case 'publication': {
      subject = `Your manuscript has been published \u2013 ${paperId}`;

      const doiValue = getFirst(options.doi, paper.doi, paper.figshare?.doi);
      const doi = normalizeDoi(doiValue);

      const figshareUrl = makeUrl(
        getFirst(options.figshareUrl, options.recordUrl, paper.figshare?.recordUrl, paper.figshare?.url),
        siteUrl
      );

      const recordUrl = figshareUrl || (doi ? doi.url : '');

      const doiRow = doi
        ? `<p style="margin:0 0 6px;font-family:${SANS};font-size:14px;color:${T.inkLight};"><strong style="color:${T.ink};">DOI:</strong> <a href="${html(doi.url)}" style="color:${T.green};font-weight:700;">${html(doi.value)}</a></p>`
        : '';

      const doiText = doi ? `DOI: ${doi.value}\nDOI link: ${doi.url}\n` : '';
      const recordText = recordUrl ? `Figshare record: ${recordUrl}\n` : '';

      body = `
        ${greeting}
        ${paragraph('We are pleased to inform you that your manuscript has been published.')}
        ${manuscript}
        ${doiRow}
        ${button(recordUrl, 'View Figshare publication record')}
        ${button(paperUrl, 'View published paper', 'secondary')}
        ${logoStrip(extras.logos)}
        ${paragraph('<br>Thank you for publishing with our journal.')}
      `;

      textBody = `Dear ${author},

Your manuscript has been published.
Title: ${title}
Reference ID: ${paperId}
${doiText}${recordText}${paperUrl ? `Journal paper: ${paperUrl}\n` : ''}
Thank you for publishing with our journal.`;
      break;
    }

    case 'unpublished':
      subject = `Publication status update \u2013 ${paperId}`;
      body = `
        ${greeting}
        ${paragraph('There has been an update to the publication status of your manuscript.')}
        ${manuscript}
        ${reason ? noticeBox(html(reason).replace(/\n/g, '<br>')) : ''}
        ${button(trackingUrl, 'Track your submission')}
      `;
      textBody = `Dear ${author},

There has been an update to your manuscript's publication status.
Title: ${title}
Reference ID: ${paperId}
${reason ? `${reason}\n` : ''}${trackingUrl ? `Tracking: ${trackingUrl}` : ''}`;
      break;

    case 'claimed':
      subject = 'Your manuscript tracking access';
      body = `
        ${greeting}
        ${paragraph('A request was made to access your manuscript tracking information.')}
        ${manuscript}
        ${paragraph(`<strong style="color:${T.ink};">Private tracking token</strong><br>Use the secure link below, or enter these details manually on the Track page.`)}
        ${tokenBox(options.token)}
        ${button(trackingUrl, 'Access submission tracking')}
        ${paragraph('If you did not request this email, you can ignore it.')}
      `;
      textBody = `Dear ${author},

A request was made to access your manuscript tracking information.
Title: ${title}
Reference ID: ${paperId}
Private tracking token: ${options.token || ''}
${trackingUrl ? `Secure tracking link: ${trackingUrl}\n` : ''}
If you did not request this email, ignore this message.`;
      break;

    default:
      throw new Error(`Unsupported email type: ${type}`);
  }

  return {
    subject,
    html: emailLayout(subject, body),
    text: textBody
  };
}

// ------------------------------------------------------------
// INLINE LOGOS (Figshare / Google Scholar) - optional, never fatal
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

async function readBrandFile(envName, fallback) {
  for (const raw of [process.env[envName], fallback]) {
    const rel = clean(raw).replace(/\\/g, '/');
    if (!rel) continue;

    const targets = path.isAbsolute(rel) ? [rel] : searchRoots().map((root) => path.resolve(root, rel));
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

async function loadEmailLogos() {
  const definitions = [
    { env: 'FIGSHARE_LOGO_PATH', fallback: 'public/brand/figshare.png', cid: 'ijros-figshare-logo', alt: 'Figshare', filename: 'figshare' },
    { env: 'GOOGLE_SCHOLAR_LOGO_PATH', fallback: 'public/brand/google-scholar.png', cid: 'ijros-scholar-logo', alt: 'Google Scholar', filename: 'google-scholar' }
  ];

  const logos = [];

  for (const definition of definitions) {
    try {
      const bytes = await readBrandFile(definition.env, definition.fallback);
      if (!bytes) continue;

      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!isPng && !isJpg) continue;

      logos.push({
        cid: definition.cid,
        alt: definition.alt,
        attachment: {
          filename: `${definition.filename}.${isPng ? 'png' : 'jpg'}`,
          content: bytes,
          contentType: isPng ? 'image/png' : 'image/jpeg',
          cid: definition.cid,
          contentDisposition: 'inline'
        }
      });
    } catch (error) {
      console.error(`Email logo skipped (${definition.env}):`, error.message);
    }
  }

  return logos;
}

// ------------------------------------------------------------
// SMTP
// ------------------------------------------------------------
function validateEmailAddress(address) {
  const value = clean(address);

  if (!value || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`Invalid email address: ${value || '(empty)'}`);
  }

  return value;
}

function getSender() {
  const address = validateEmailAddress(process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER);

  const name = clean(process.env.MAIL_FROM_NAME || 'Journal Editorial Office').replace(/[\r\n"]/g, '');

  return name ? `"${name}" <${address}>` : address;
}

function getTransporter() {
  const host = clean(process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT || 465);
  const user = clean(process.env.SMTP_USER);
  const password = clean(process.env.SMTP_PASSWORD);

  if (!host) throw new Error('SMTP_HOST is not configured.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT is invalid.');
  }
  if (!user) throw new Error('SMTP_USER is not configured.');
  if (!password) throw new Error('SMTP_PASSWORD is not configured.');

  const secure = clean(process.env.SMTP_SECURE).toLowerCase() === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS
  });
}

function prepareAttachments(attachments = []) {
  return attachments.map((attachment) => {
    if (!attachment || typeof attachment !== 'object') {
      throw new Error('Invalid email attachment.');
    }

    const filename = clean(attachment.filename || attachment.name || 'attachment')
      .split(/[\\/]/)
      .pop();

    if (!filename) {
      throw new Error('Email attachment filename is missing.');
    }

    const source = attachment.content ?? attachment.data ?? attachment.buffer;

    if (source === undefined || source === null) {
      throw new Error(`Attachment content is missing: ${filename}`);
    }

    let content;

    if (Buffer.isBuffer(source)) {
      content = source;
    } else if (source instanceof Uint8Array) {
      content = Buffer.from(source);
    } else if (typeof source === 'string') {
      content = Buffer.from(source, 'utf8');
    } else {
      throw new Error(`Unsupported attachment content: ${filename}`);
    }

    const prepared = {
      filename,
      content,
      contentType: attachment.contentType || attachment.content_type
    };

    if (attachment.cid) {
      prepared.cid = attachment.cid;
      prepared.contentDisposition = attachment.contentDisposition || 'inline';
    }

    return prepared;
  });
}

async function sendViaSmtp({ to, subject, html: htmlContent, text, attachments = [] }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean).map(validateEmailAddress);

  if (!recipients.length) {
    throw new Error('No email recipient was provided.');
  }

  const replyTo = clean(process.env.MAIL_REPLY_TO);

  const transporter = getTransporter();

  try {
    const info = await transporter.sendMail({
      from: getSender(),
      to: recipients,
      replyTo: replyTo ? validateEmailAddress(replyTo) : undefined,
      subject: clean(subject),
      html: htmlContent,
      text: text || undefined,
      attachments: prepareAttachments(attachments)
    });

    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp',
      accepted: info.accepted,
      rejected: info.rejected
    };
  } catch (error) {
    throw new Error(`SMTP email failed: ${clean(error.message).slice(0, 500)}`);
  } finally {
    transporter.close();
  }
}

// ------------------------------------------------------------
// PUBLIC API
// ------------------------------------------------------------
export async function sendEmail({ to, type, paper = {}, options = {}, attachments = [] }) {
  if (!type) {
    throw new Error('Email type is required.');
  }

  if (!Array.isArray(attachments)) {
    throw new Error('Attachments must be an array.');
  }

  const logos = type === 'publication' ? await loadEmailLogos() : [];
  const message = makeEmail(type, paper, options, { logos });

  return sendViaSmtp({
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: [...attachments, ...logos.map((logo) => logo.attachment)]
  });
}

export async function sendAdminNotice(subject, message) {
  const adminEmail = clean(process.env.EDITORIAL_INBOX || process.env.ADMIN_EMAIL);

  if (!adminEmail) {
    throw new Error('EDITORIAL_INBOX or ADMIN_EMAIL is not configured.');
  }

  const safeSubject = clean(subject) || 'Journal admin notification';
  const safeMessage = clean(message);

  const htmlContent = emailLayout(
    safeSubject,
    `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.7;color:${T.inkLight};">${html(safeMessage).replace(/\n/g, '<br>')}</p>`
  );

  return sendViaSmtp({
    to: adminEmail,
    subject: safeSubject,
    html: htmlContent,
    text: safeMessage
  });
}