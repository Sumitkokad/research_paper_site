import nodemailer from 'nodemailer';
import { escapeHtml } from './core.mjs';

let transporter = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getTransport() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE ?? 'false') === 'true';

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.'
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid port number.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    dnsTimeout: 10000,
    tls: {
      minVersion: 'TLSv1.2'
    }
  });

  return transporter;
}

function resetTransport() {
  if (transporter) {
    try {
      transporter.close();
    } catch {
      // Ignore errors while closing a failed connection.
    }
  }

  transporter = null;
}

function sender() {
  const address = String(process.env.MAIL_FROM_ADDRESS || '').trim();
  const name = String(
    process.env.MAIL_FROM_NAME || 'Journal Editorial Office'
  ).trim();

  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error(
      'MAIL_FROM_ADDRESS must be a valid, verified Brevo sender address.'
    );
  }

  return { address, name };
}

function isRetryableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);

  const retryableCodes = [
    'ETIMEDOUT',
    'ESOCKET',
    'ECONNECTION',
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN'
  ];

  if (retryableCodes.includes(code)) return true;

  // Retry temporary SMTP 4xx responses, but not authentication/config errors.
  if (
    responseCode >= 400 &&
    responseCode < 500 &&
    ![530, 534, 535, 538].includes(responseCode)
  ) {
    return true;
  }

  return false;
}

async function sendWithRetry(message, label = 'email') {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await getTransport().sendMail(message);

      const accepted = info.accepted || [];
      const rejected = info.rejected || [];

      if (accepted.length === 0 || rejected.length > 0) {
        const error = new Error(
          `SMTP did not accept all recipients for ${label}. ` +
          `Accepted: ${accepted.length}, rejected: ${rejected.length}.`
        );

        error.code = 'EENVELOPE';
        error.accepted = accepted;
        error.rejected = rejected;

        throw error;
      }

      return {
        messageId: info.messageId,
        accepted
      };
    } catch (error) {
      lastError = error;

      const retryable = isRetryableError(error);

      console.error(
        `[EMAIL] ${label} failed (attempt ${attempt}/${maxAttempts}).`,
        {
          code: error?.code,
          responseCode: error?.responseCode,
          message: error?.message,
          retryable
        }
      );

      if (!retryable || attempt === maxAttempts) {
        break;
      }

      resetTransport();

      // Increasing delay: 1 second, then 2 seconds.
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
}

/**
 * Optional SMTP connection/authentication test.
 * Can be called from a protected backend diagnostic endpoint.
 */
export async function verifySmtp() {
  const transport = getTransport();
  await transport.verify();

  return {
    success: true,
    message: 'SMTP connection and authentication successful.'
  };
}

function layout(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ec;font-family:Arial,sans-serif;color:#19243a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 10px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #e6e2d8;border-radius:14px;overflow:hidden"><tr><td style="background:#101f3b;padding:24px 30px;color:#fff"><div style="font-size:12px;letter-spacing:2px;color:#e5c98b">ijrise · EDITORIAL OFFICE</div><div style="font-family:Georgia,serif;font-size:24px;margin-top:8px">${escapeHtml(process.env.JOURNAL_NAME || 'International Journal of Research and Innovation in Science and Engineering')}</div></td></tr><tr><td style="padding:30px;line-height:1.65"><h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 16px;color:#101f3b">${escapeHtml(title)}</h1>${body}<p style="font-size:13px;color:#687184;border-top:1px solid #ece9e2;padding-top:18px;margin-top:26px">This is an automated message from the journal editorial system. Please reply to the journal contact address shown on the website if you need assistance.</p></td></tr></table></td></tr></table></body></html>`;
}

const paragraph = (text) => `<p style="margin:0 0 14px">${text}</p>`;

const callToAction = (url, label) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#b88d45;color:#101f3b;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`;

export function makeEmail(type, paper, options = {}) {
  const siteUrl = process.env.JOURNAL_SITE_URL || options.siteUrl || '';
  const title = escapeHtml(paper.title || 'your manuscript');
  const name = escapeHtml(
    paper.submitterName || paper.authors?.[0]?.name || 'Author'
  );
  const paperId = escapeHtml(paper.id || '');
  const trackingUrl = options.trackingUrl || `${siteUrl}/track`;
  const paymentUrl = options.paymentUrl || '';
  const editorEmail = escapeHtml(
    process.env.EDITORIAL_INBOX || process.env.MAIL_FROM_ADDRESS || ''
  );

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
      paragraph(
        `We have received your manuscript <strong>${title}</strong>. Its paper reference is <strong>${paperId}</strong>. The editorial office will perform an initial screening. Our current target for an initial update is 1–2 business days; this is a target, not a guarantee of acceptance.`
      ) +
      paragraph(
        'Use the private tracking link below and keep the access token secure. Do not share it publicly.'
      ) +
      callToAction(trackingUrl, 'Track submission');
  } else if (type === 'accepted') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `The editorial decision for <strong>${title}</strong> is <strong>accepted</strong>, subject to completion of the payment and publication checks described in the journal policy.`
      ) +
      paragraph(
        `Paper reference: <strong>${paperId}</strong>. The current publication fee is displayed on the secure payment page. Only pay after confirming the verified beneficiary name in your UPI app.`
      ) +
      callToAction(paymentUrl, 'Continue to payment') +
      paragraph(
        `For questions, contact <a href="mailto:${editorEmail}">${editorEmail}</a>.`
      );
  } else if (type === 'revision') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `The editor has requested a revision for <strong>${title}</strong>.`
      ) +
      `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.comments || 'Please review the editorial notes in your author tracking page.')}</div>` +
      paragraph(
        'Open the tracking page and sign in using your paper reference and private author token. Upload the revised PDF against the same paper reference.'
      );
  } else if (type === 'rejected') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `After editorial consideration, the submission <strong>${title}</strong> (${paperId}) has not been accepted for publication.`
      ) +
      (options.reason
        ? `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.reason)}</div>`
        : '') +
      paragraph('Thank you for considering the journal for your work.');
  } else if (type === 'payment_submitted') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `We have recorded the UTR you submitted for <strong>${title}</strong> (${paperId}). The editorial office will verify the transaction manually. Publication is not complete until the payment is confirmed.`
      ) +
      paragraph(
        `Submitted UTR: <strong>${escapeHtml(options.utr || '')}</strong>`
      );
  } else if (type === 'payment_received') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `Your submitted payment for <strong>${title}</strong> has been confirmed by the editorial office. The payment receipt is attached to this email.`
      ) +
      paragraph('The publication certificate generation process is now underway.');
  } else if (type === 'payment_rejected') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `We could not verify the payment reference submitted for <strong>${title}</strong> (${paperId}).`
      ) +
      (options.reason
        ? `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.reason)}</div>`
        : '') +
      paragraph(
        'Please review the reference and contact the editorial office before submitting again.'
      );
  } else if (type === 'unpublished') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `The published record for <strong>${title}</strong> (${paperId}) has been withdrawn from the public archive.`
      ) +
      (options.reason
        ? `<div style="background:#f6f3ed;padding:16px;border-left:3px solid #b88d45;margin:18px 0">${escapeHtml(options.reason)}</div>`
        : '') +
      paragraph(
        'Please contact the editorial office if you require further information.'
      );
  } else if (type === 'publication') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `Congratulations. <strong>${title}</strong> has been marked as published in the journal archive.`
      ) +
      paragraph(
        'Individual author certificates are attached. Each certificate has its own certificate ID and a QR code that opens the public verification record.'
      ) +
      callToAction(
        options.paperUrl || `${siteUrl}/papers/${encodeURIComponent(paper.id)}`,
        'View published paper'
      );
  } else if (type === 'claimed') {
    body =
      paragraph(`Dear ${name},`) +
      paragraph(
        `A new private author tracking token has been issued for paper <strong>${paperId}</strong>. Use the details below to access your submission.`
      ) +
      paragraph(
        `Paper ID: <strong>${paperId}</strong><br/>Author token: <strong>${escapeHtml(options.token || '')}</strong>`
      ) +
      callToAction(trackingUrl, 'Open tracking page');
  }

  let plainText =
    `${subjects[type] || 'Journal update'}\n` +
    `Paper ID: ${paperId}\n` +
    `${paper.title || ''}\n` +
    `${options.reason || ''}`;

  if (type === 'submitted') {
    plainText += `\nPrivate tracking link: ${trackingUrl}`;
  }

  if (type === 'claimed') {
    plainText +=
      `\nAuthor tracking token: ${options.token || ''}\n` +
      `Open: ${trackingUrl}`;
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
    plainText +=
      `\nSubmitted UTR: ${options.utr || ''}\n` +
      'The editorial office will verify this payment manually.';
  }

  if (type === 'payment_rejected') {
    plainText += `\nPayment note: ${options.reason || ''}`;
  }

  if (type === 'payment_received') {
    plainText += '\nThe payment receipt PDF is attached.';
  }

  if (type === 'publication') {
    plainText +=
      `\nPublished article: ${options.paperUrl || `${siteUrl}/papers/${encodeURIComponent(paper.id)}`}\n` +
      'Individual author certificates are attached.';
  }

  return {
    subject: subjects[type] || `Journal update · ${paperId}`,
    html: layout(subjects[type] || 'Journal update', body),
    text: plainText
  };
}

export async function sendEmail({
  to,
  type,
  paper,
  options = {},
  attachments = []
}) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('Email recipient is missing.');
  }

  if (!paper) {
    throw new Error('Paper information is missing.');
  }

  const mail = makeEmail(type, paper, options);
  const from = sender();

  return sendWithRetry(
    {
      from: {
        name: from.name,
        address: from.address
      },
      to,
      replyTo: process.env.EDITORIAL_INBOX || from.address,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments
    },
    `journal ${type} email`
  );
}

export async function sendAdminNotice(subject, message) {
  const recipient =
    process.env.EDITORIAL_INBOX || process.env.SMTP_USER;

  if (!recipient) {
    throw new Error('EDITORIAL_INBOX is not configured.');
  }

  const from = sender();

  return sendWithRetry(
    {
      from: {
        name: from.name,
        address: from.address
      },
      to: recipient,
      replyTo: from.address,
      subject,
      text: message,
      html: layout(
        subject,
        paragraph(escapeHtml(message).replace(/\n/g, '<br/>'))
      )
    },
    'admin notification'
  );
}
