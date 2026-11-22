
import { escapeHtml } from './core.mjs';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function sender() {
  const address = String(process.env.MAIL_FROM_ADDRESS || '').trim();

  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error('MAIL_FROM_ADDRESS must be a valid, verified sender address in Brevo.');
  }

  return {
    email: address,
    name: String(process.env.MAIL_FROM_NAME || 'Journal Editorial Office').trim()
  };
}

function layout(title, body) {
  return `<!doctype html>
<html>
<body style="margin:0;background:#f4f2ec;font-family:Arial,sans-serif;color:#19243a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 10px">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e6e2d8;border-radius:14px;overflow:hidden">
<tr><td style="background:#101f3b;padding:24px 30px;color:#fff">
<div style="font-size:12px;letter-spacing:2px;color:#e5c98b">ijrise · EDITORIAL OFFICE</div>
<div style="font-family:Georgia,serif;font-size:24px;margin-top:8px">${escapeHtml(process.env.JOURNAL_NAME || 'International Journal of Research and Innovation in Science and Engineering')}</div>
</td></tr>
<tr><td style="padding:30px;line-height:1.65">
<h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 16px;color:#101f3b">${escapeHtml(title)}</h1>
${body}
<p style="font-size:13px;color:#687184;border-top:1px solid #ece9e2;padding-top:18px;margin-top:26px">This is an automated message from the journal editorial system. Please reply to the journal contact address shown on the website if you need assistance.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const paragraph = (text) => `<p style="margin:0 0 14px">${text}</p>`;

const callToAction = (url, label) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#b88d45;color:#101f3b;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`;

export function makeEmail(type, paper, options = {}) {
  const siteUrl = process.env.JOURNAL_SITE_URL || options.siteUrl || '';
  const title = escapeHtml(paper.title || 'your manuscript');
  const name = escapeHtml(paper.submitterName || paper.authors?.[0]?.name || 'Author');
  const paperId = escapeHtml(paper.id || '');
  const trackingUrl = options.trackingUrl || `${siteUrl}/track`;
  const paymentUrl = options.paymentUrl || '';
  const editorEmail = escapeHtml(process.env.EDITORIAL_INBOX || process.env.MAIL_FROM_ADDRESS || '');

  const subjects = {
    submitted: `Submission received · ${paperId}`,
    accepted: `Editorial decision: accepted · ${paperId}`,
    revision: `Revision requested · ${paperId}`,
    rejected: `Editorial decision · ${paperId}`,
    payment_received: `Payment confirmed · ${paperId}`,
    payment_submitted: `Payment reference received · ${paperId}`,
    payment_rejected: `Payment requires attention · ${paperId}`,
    publication: `Your paper is published · ${paperId}`,
    unpublished: `Publication record withdrawn · ${paperId}`,
    claimed: `Your author tracking access · ${paperId}`
  };

  let body = '';

  if (type === 'submitted') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`We have received your manuscript <strong>${title}</strong>. Its paper reference is <strong>${paperId}</strong>. The editorial office will perform an initial screening. Our current target for an initial update is 1–2 business days; this is a target, not a guarantee of acceptance.`) +
      paragraph('Use the private tracking link below and keep the access token secure. Do not share it publicly.') +
      callToAction(options.trackingUrl || trackingUrl, 'Track submission');

  } else if (type === 'accepted') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`The editorial decision for <strong>${title}</strong> is <strong>accepted</strong>, subject to completion of the payment and publication checks described in the journal policy.`) +
      paragraph(`Paper reference: <strong>${paperId}</strong>. The current publication fee is displayed on the secure payment page. Only pay after confirming the verified beneficiary name in your UPI app.`) +
      callToAction(paymentUrl, 'Continue to payment') +
      paragraph(`For questions, contact <a href="mailto:${editorEmail}">${editorEmail}</a>.`);

  } else if (type === 'revision') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`The editor has requested a revision for <strong>${title}</strong>.`) +
      `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.comments || 'Please review the editorial notes in your author tracking page.')}</div>` +
      paragraph('Open the tracking page and sign in using your paper reference and private author token. Upload the revised PDF against the same paper reference.');

  } else if (type === 'rejected') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`After editorial consideration, the submission <strong>${title}</strong> (${paperId}) has not been accepted for publication.`) +
      (options.reason
        ? `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.reason)}</div>`
        : '') +
      paragraph('Thank you for considering the journal for your work.');

  } else if (type === 'payment_submitted') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`We have recorded the UTR you submitted for <strong>${title}</strong> (${paperId}). The editorial office will verify the transaction manually. Publication is not complete until the payment is confirmed.`) +
      paragraph(`Submitted UTR: <strong>${escapeHtml(options.utr || '')}</strong>`);

  } else if (type === 'payment_received') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`Your submitted payment for <strong>${title}</strong> has been confirmed by the editorial office. The payment receipt is attached to this email.`) +
      paragraph('The publication certificate generation process is now underway.');

  } else if (type === 'payment_rejected') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`We could not verify the payment reference submitted for <strong>${title}</strong> (${paperId}).`) +
      (options.reason
        ? `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.reason)}</div>`
        : '') +
      paragraph('Please review the reference and contact the editorial office before submitting again.');

  } else if (type === 'unpublished') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`The published record for <strong>${title}</strong> (${paperId}) has been withdrawn from the public archive.`) +
      (options.reason
        ? `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.reason)}</div>`
        : '') +
      paragraph('Please contact the editorial office if you require further information.');

  } else if (type === 'publication') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`Congratulations. <strong>${title}</strong> has been marked as published in the journal archive.`) +
      paragraph('Individual author certificates are attached. Each certificate has its own certificate ID and a QR code that opens the public verification record.') +
      callToAction(options.paperUrl || `${siteUrl}/papers/${encodeURIComponent(paper.id)}`, 'View published paper');

  } else if (type === 'claimed') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(`A new private author tracking token has been issued for paper <strong>${paperId}</strong>. Use the details below to access your submission.`) +
      paragraph(`Paper ID: <strong>${paperId}</strong><br/>Author token: <strong>${escapeHtml(options.token || '')}</strong>`) +
      callToAction(trackingUrl, 'Open tracking page');

  } else {
    throw new Error(`Unsupported email template type: ${type}`);
  }

  let plainText = `${subjects[type] || 'Journal update'}\nPaper ID: ${paperId}\n${paper.title || ''}\n${options.reason || ''}`;

  if (type === 'submitted') {
    plainText += `\nPrivate tracking link: ${options.trackingUrl || trackingUrl}`;
  }

  if (type === 'claimed') {
    plainText += `\nAuthor tracking token: ${options.token || ''}\nOpen: ${trackingUrl}`;
  }

  if (type === 'accepted') {
    plainText += `\nSecure payment link: ${paymentUrl}`;
  }

  if (type === 'unpublished') {
    plainText += `\nWithdrawal reason: ${options.reason || ''}`;
  }

  if (type === 'revision') {
    plainText += `\nEditorial comments: ${options.comments || ''}`;
  }

  if (type === 'payment_submitted') {
    plainText += `\nSubmitted UTR: ${options.utr || ''}\nThe editorial office will verify this payment manually.`;
  }

  if (type === 'payment_rejected') {
    plainText += `\nPayment note: ${options.reason || ''}`;
  }

  if (type === 'payment_received') {
    plainText += '\nThe payment receipt PDF is attached.';
  }

  if (type === 'publication') {
    plainText += `\nPublished article: ${options.paperUrl || `${siteUrl}/papers/${encodeURIComponent(paper.id)}`}\nIndividual author certificates are attached.`;
  }

  return {
    subject: subjects[type] || `Journal update · ${paperId}`,
    html: layout(subjects[type] || 'Journal update', body),
    text: plainText
  };
}

function attachmentToBrevo(attachment) {
  if (!attachment || !attachment.filename || attachment.content == null) {
    throw new Error('Email attachment must include filename and content.');
  }

  let bytes;

  if (Buffer.isBuffer(attachment.content)) {
    bytes = attachment.content;
  } else if (attachment.content instanceof Uint8Array) {
    bytes = Buffer.from(attachment.content);
  } else if (typeof attachment.content === 'string') {
    bytes = Buffer.from(attachment.content, 'utf8');
  } else {
    throw new Error(`Unsupported content type for attachment ${attachment.filename}.`);
  }

  return {
    name: String(attachment.filename),
    content: bytes.toString('base64')
  };
}

async function sendViaBrevo({
  to,
  subject,
  htmlContent,
  textContent,
  attachments = [],
  replyTo
}) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();

  console.log("[BREVO DEBUG]", {
  apiKeyLoaded: Boolean(apiKey),
  sender: process.env.MAIL_FROM_ADDRESS || "MISSING",
  recipient: process.env.EDITORIAL_INBOX || "MISSING"
});

  if (!apiKey) {
    throw new Error('BREVO_API_KEY is missing. Add it to the Netlify environment variables and redeploy.');
  }

  if (/\s/.test(apiKey)) {
    throw new Error('BREVO_API_KEY contains whitespace. Re-copy the complete API key into the environment variable without spaces or line breaks.');
  }

  const from = sender();

  const recipientList = (Array.isArray(to) ? to : [to])
    .flatMap((item) => {
      if (typeof item === 'string') {
        return [{ email: item.trim() }];
      }

      if (item && typeof item.address === 'string') {
        return [{
          email: item.address.trim(),
          ...(item.name ? { name: item.name } : {})
        }];
      }

      if (item && typeof item.email === 'string') {
        return [{
          email: item.email.trim(),
          ...(item.name ? { name: item.name } : {})
        }];
      }

      return [];
    })
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email));

  if (!recipientList.length) {
    throw new Error('No valid recipient email address was provided.');
  }

  const payload = {
    sender: from,
    to: recipientList,
    subject,
    htmlContent,
    textContent,
    ...(replyTo ? { replyTo: { email: String(replyTo).trim() } } : {}),
    tags: ['journal-transactional'],
    ...(attachments.length
      ? { attachment: attachments.map(attachmentToBrevo) }
      : {})
  };

  let response;

  try {
    response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    throw new Error(`Brevo API network request failed: ${error.message}`);
  }

  const responseText = await response.text();

  let result = {};

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { message: responseText };
  }

  if (!response.ok) {
    const detail =
      result.message ||
      result.code ||
      response.statusText ||
      'Unknown Brevo API error';

    throw new Error(`Brevo API error (${response.status}): ${detail}`);
  }

  if (!result.messageId) {
    throw new Error(
      `Brevo API returned HTTP ${response.status} without a messageId: ${responseText.slice(0, 500)}`
    );
  }

  return {
    messageId: result.messageId,
    accepted: recipientList.map((item) => item.email),
    response: result
  };
}

export async function sendEmail({
  to,
  type,
  paper,
  options = {},
  attachments = []
}) {
  const mail = makeEmail(type, paper, options);

  return sendViaBrevo({
    to,
    subject: mail.subject,
    htmlContent: mail.html,
    textContent: mail.text,
    attachments,
    replyTo: process.env.EDITORIAL_INBOX || process.env.MAIL_FROM_ADDRESS
  });
}

export async function sendAdminNotice(subject, message) {
  const recipient = String(process.env.EDITORIAL_INBOX || '').trim();

  if (!recipient) {
    throw new Error('EDITORIAL_INBOX is not configured.');
  }

  return sendViaBrevo({
    to: recipient,
    subject,
    textContent: String(message || ''),
    htmlContent: layout(
      subject,
      paragraph(escapeHtml(message).replace(/\n/g, '<br/>'))
    ),
    replyTo: process.env.MAIL_FROM_ADDRESS
  });
}
