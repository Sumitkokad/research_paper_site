import nodemailer from 'nodemailer';
import { escapeHtml } from './core.mjs';

const EMAIL_TIMEOUT_MS = 25000;

function clean(value) {
  return String(value ?? '').trim();
}

function html(value) {
  return escapeHtml(clean(value));
}

function getSiteUrl(options = {}) {
  return clean(
    options.siteUrl ||
    process.env.JOURNAL_SITE_URL ||
    process.env.URL ||
    ''
  ).replace(/\/+$/, '');
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

  const doi = raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim();

  if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) return null;

  return {
    value: doi,
    url: `https://doi.org/${doi}`
  };
}

function getPaperName(paper = {}) {
  return (
    paper.authorName ||
    paper.submitterName ||
    paper.name ||
    paper.author ||
    'Author'
  );
}

function getPaperTitle(paper = {}) {
  return paper.title || paper.manuscriptTitle || 'Your manuscript';
}

function getPaperId(paper = {}) {
  return paper.paperId || paper.id || paper.reference || 'Not available';
}

function getFirst(...values) {
  return values.find(
    value => value !== undefined &&
      value !== null &&
      clean(value) !== ''
  );
}

function button(url, label) {
  if (!url) return '';

  return `
    <p style="margin:24px 0;">
      <a href="${html(url)}"
         style="display:inline-block;background:#173b63;color:#ffffff;
                padding:12px 22px;border-radius:6px;text-decoration:none;
                font-weight:600;">
        ${html(label)}
      </a>
    </p>
  `;
}

function emailLayout(title, body) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${html(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f6f8;
                 font-family:Arial,Helvetica,sans-serif;color:#263445;">
      <div style="max-width:650px;margin:30px auto;background:#ffffff;
                  border:1px solid #e5e9ee;border-radius:10px;overflow:hidden;">
        <div style="background:#173b63;padding:24px;text-align:center;">
          <h2 style="margin:0;color:#ffffff;font-size:21px;">
            ${html(process.env.MAIL_FROM_NAME || 'Journal Editorial Office')}
          </h2>
        </div>

        <div style="padding:30px;line-height:1.65;font-size:15px;">
          ${body}
        </div>

        <div style="background:#f7f9fb;padding:18px 25px;
                    text-align:center;color:#6b7280;font-size:12px;">
          This is an automated email from the journal editorial system.
          Please do not reply unless the journal has provided a reply address.
        </div>
      </div>
    </body>
    </html>
  `;
}

function makeEmail(type, paper = {}, options = {}) {
  paper = paper || {};
  options = options || {};

  const author = getPaperName(paper);
  const title = getPaperTitle(paper);
  const paperId = getPaperId(paper);
  const siteUrl = getSiteUrl(options);

  const trackingUrl = makeUrl(
    getFirst(options.trackingUrl, paper.trackingUrl),
    siteUrl
  );

  const paperUrl = makeUrl(
    getFirst(options.paperUrl, paper.paperUrl, paper.publicUrl),
    siteUrl
  );

  const paymentUrl = makeUrl(
    getFirst(options.paymentUrl, paper.paymentUrl),
    siteUrl
  );

  const reason = getFirst(options.reason, options.comments, options.message);
  const amount = getFirst(options.amount, paper.amount, paper.paymentAmount);
  const utr = getFirst(options.utr, paper.utr, paper.paymentUtr);

  const greeting = `<p>Dear ${html(author)},</p>`;

  const manuscript = `
    <p><strong>Manuscript:</strong> ${html(title)}</p>
    <p><strong>Reference ID:</strong> ${html(paperId)}</p>
  `;

  let subject = '';
  let body = '';
  let textBody = '';

  switch (type) {
    case 'submitted':
      subject = `Manuscript received – ${paperId}`;
      body = `
        ${greeting}
        <p>We have successfully received your manuscript.</p>
        ${manuscript}
        <p>Your submission is now in the editorial review process.
           You will receive another email when the editorial team updates its status.</p>
        ${button(trackingUrl, 'Track Your Submission')}
        <p>Thank you for submitting your work.</p>
      `;
      textBody = `Dear ${author},

Your manuscript has been received.
Title: ${title}
Reference ID: ${paperId}
Track your submission: ${trackingUrl || 'Use the journal tracking page.'}`;
      break;

    case 'accepted':
      subject = `Manuscript accepted – ${paperId}`;
      body = `
        ${greeting}
        <p>We are pleased to inform you that your manuscript has been accepted
           for the next stage of the journal's publication process.</p>
        ${manuscript}
        <p>Please follow the payment or editorial instructions provided by the journal.</p>
        ${button(paymentUrl, 'View Payment Instructions')}
        ${button(trackingUrl, 'Track Your Submission')}
      `;
      textBody = `Dear ${author},

Your manuscript has been accepted for the next stage.
Title: ${title}
Reference ID: ${paperId}
${paymentUrl ? `Payment instructions: ${paymentUrl}\n` : ''}${trackingUrl ? `Tracking: ${trackingUrl}` : ''}`;
      break;

    case 'revision':
      subject = `Revision required – ${paperId}`;
      body = `
        ${greeting}
        <p>The editorial team has reviewed your manuscript and requests revisions.</p>
        ${manuscript}
        ${reason ? `<p><strong>Editorial comments:</strong><br>${html(reason)}</p>` : ''}
        <p>Please review the comments and submit the revised manuscript through the journal.</p>
        ${button(trackingUrl, 'View Submission')}
      `;
      textBody = `Dear ${author},

Revision is required for your manuscript.
Title: ${title}
Reference ID: ${paperId}
${reason ? `Editorial comments: ${reason}\n` : ''}${trackingUrl ? `Submission: ${trackingUrl}` : ''}`;
      break;

    case 'rejected':
      subject = `Manuscript decision – ${paperId}`;
      body = `
        ${greeting}
        <p>Thank you for submitting your manuscript. After editorial review,
           we regret to inform you that the journal is unable to accept it for publication.</p>
        ${manuscript}
        ${reason ? `<p><strong>Editorial comments:</strong><br>${html(reason)}</p>` : ''}
        <p>We appreciate your interest in the journal.</p>
      `;
      textBody = `Dear ${author},

The journal is unable to accept your manuscript.
Title: ${title}
Reference ID: ${paperId}
${reason ? `Editorial comments: ${reason}` : ''}`;
      break;

    case 'payment_received':
      subject = `Payment confirmed – ${paperId}`;
      body = `
        ${greeting}
        <p>Your payment has been reviewed and confirmed by the journal.</p>
        ${manuscript}
        ${amount ? `<p><strong>Amount:</strong> ${html(amount)}</p>` : ''}
        ${utr ? `<p><strong>UTR / Transaction Reference:</strong> ${html(utr)}</p>` : ''}
        <p><strong>Important:</strong> Payment confirmation does not itself publish
           your manuscript. The editorial team will complete the remaining checks
           and handle repository submission and publication separately.</p>
        ${button(trackingUrl, 'Track Your Submission')}
        <p>Thank you.</p>
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
      subject = `Payment details received – ${paperId}`;
      body = `
        ${greeting}
        <p>We have received your payment details and transaction reference.</p>
        ${manuscript}
        ${amount ? `<p><strong>Amount submitted:</strong> ${html(amount)}</p>` : ''}
        ${utr ? `<p><strong>UTR / Transaction Reference:</strong> ${html(utr)}</p>` : ''}
        <p>The journal team will verify the transaction. Your manuscript will not
           be published automatically when payment details are submitted.</p>
        ${button(trackingUrl, 'Track Your Submission')}
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
      subject = `Payment verification update – ${paperId}`;
      body = `
        ${greeting}
        <p>We could not confirm your submitted payment details.</p>
        ${manuscript}
        ${reason ? `<p><strong>Reason:</strong><br>${html(reason)}</p>` : ''}
        <p>Please review the details and contact the journal if you need assistance.</p>
        ${button(trackingUrl, 'View Submission')}
      `;
      textBody = `Dear ${author},

Your payment could not be confirmed.
Title: ${title}
Reference ID: ${paperId}
${reason ? `Reason: ${reason}\n` : ''}${trackingUrl ? `Tracking: ${trackingUrl}` : ''}`;
      break;

    case 'publication': {
      subject = `Your manuscript has been published – ${paperId}`;

      const doiValue = getFirst(
        options.doi,
        paper.doi,
        paper.figshare?.doi
      );

      const doi = normalizeDoi(doiValue);

      const figshareUrl = makeUrl(
        getFirst(
          options.figshareUrl,
          options.recordUrl,
          paper.figshare?.recordUrl,
          paper.figshare?.url
        ),
        siteUrl
      );

      const recordUrl = figshareUrl || (doi ? doi.url : '');

      const doiHtml = doi
        ? `<p><strong>DOI:</strong> <a href="${html(doi.url)}">${html(doi.value)}</a></p>`
        : '';

      const recordHtml = recordUrl
        ? button(recordUrl, 'View Figshare Publication Record')
        : '';

      const doiText = doi
        ? `DOI: ${doi.value}\nDOI link: ${doi.url}\n`
        : '';

      const recordText = recordUrl
        ? `Figshare record: ${recordUrl}\n`
        : '';

      body = `
        ${greeting}
        <p>We are pleased to inform you that your manuscript has been published.</p>
        ${manuscript}
        ${doiHtml}
        ${recordHtml}
        ${button(paperUrl, 'View Published Paper')}
        <p>Thank you for publishing with our journal.</p>
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
      subject = `Publication status update – ${paperId}`;
      body = `
        ${greeting}
        <p>There has been an update to the publication status of your manuscript.</p>
        ${manuscript}
        ${reason ? `<p>${html(reason)}</p>` : ''}
        ${button(trackingUrl, 'Track Your Submission')}
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
        <p>A request was made to access your manuscript tracking information.</p>
        ${manuscript}
        <p>Use the secure link below to view your submission status.</p>
        ${button(trackingUrl, 'Access Submission Tracking')}
        <p>If you did not request this email, you can ignore it.</p>
      `;
      textBody = `Dear ${author},

A request was made to access your manuscript tracking information.
Title: ${title}
Reference ID: ${paperId}
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

function validateEmailAddress(address) {
  const value = clean(address);

  if (
    !value ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new Error(`Invalid email address: ${value || '(empty)'}`);
  }

  return value;
}

function getSender() {
  const address = validateEmailAddress(
    process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER
  );

  const name = clean(
    process.env.MAIL_FROM_NAME || 'Journal Editorial Office'
  ).replace(/[\r\n"]/g, '');

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
  return attachments.map(attachment => {
    if (!attachment || typeof attachment !== 'object') {
      throw new Error('Invalid email attachment.');
    }

    const filename = clean(
      attachment.filename || attachment.name || 'attachment'
    ).split(/[\\/]/).pop();

    if (!filename) {
      throw new Error('Email attachment filename is missing.');
    }

    const source =
      attachment.content ??
      attachment.data ??
      attachment.buffer;

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

    return {
      filename,
      content,
      contentType: attachment.contentType || attachment.content_type
    };
  });
}

async function sendViaSmtp({
  to,
  subject,
  html: htmlContent,
  text,
  attachments = []
}) {
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(validateEmailAddress);

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

export async function sendEmail({
  to,
  type,
  paper = {},
  options = {},
  attachments = []
}) {
  if (!type) {
    throw new Error('Email type is required.');
  }

  if (!Array.isArray(attachments)) {
    throw new Error('Attachments must be an array.');
  }

  const message = makeEmail(type, paper, options);

  return sendViaSmtp({
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments
  });
}

export async function sendAdminNotice(subject, message) {
  const adminEmail = clean(
    process.env.EDITORIAL_INBOX || process.env.ADMIN_EMAIL
  );

  if (!adminEmail) {
    throw new Error('EDITORIAL_INBOX or ADMIN_EMAIL is not configured.');
  }

  const safeSubject = clean(subject) || 'Journal admin notification';
  const safeMessage = clean(message);

  const htmlContent = emailLayout(
    safeSubject,
    `<p>${html(safeMessage).replace(/\n/g, '<br>')}</p>`
  );

  return sendViaSmtp({
    to: adminEmail,
    subject: safeSubject,
    html: htmlContent,
    text: safeMessage
  });
}