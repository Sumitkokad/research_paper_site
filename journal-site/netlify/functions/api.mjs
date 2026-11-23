
import crypto from 'node:crypto';

import {
  updateDatabase,
  readDatabase,
  writeBinary,
  readBinary,
  isStoreConfigured
} from './lib/store.mjs';

import {
  json,
  readJson,
  requestIp,
  createAdminCookie,
  setAdminCookie,
  clearAdminCookie,
  requireAdmin,
  assertSameOrigin,
  verifyOpaqueToken
} from './lib/security.mjs';

import {
  cleanText,
  safeFilename,
  sha256,
  makeRandomToken,
  addTimeline,
  ensureCertificates,
  assignArchive,
  isValidUtr,
  timingSafeEqualText
} from './lib/core.mjs';

import {
  getPaymentConfig,
  buildUpiUri,
  validatePaymentUtr
} from './lib/payments.mjs';

import {
  sendEmail,
  sendAdminNotice
} from './lib/email.mjs';

import {
  generateCertificatePdf,
  generatePaymentReceiptPdf
} from './lib/certificates.mjs';

import {
  createFigshareArticle,
  updateFigshareArticle,
  uploadFigsharePdf,
  publishFigshareArticle
} from './lib/figshare.mjs';

export const config = { path: '/api/*' };

const configuredMaxPdfMb = Number(process.env.MAX_PDF_MB || 4);
const MAX_MB = Number.isFinite(configuredMaxPdfMb)
  ? Math.min(4, Math.max(1, configuredMaxPdfMb))
  : 4;

const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const siteUrl = () =>
  (process.env.JOURNAL_SITE_URL || process.env.URL || '').replace(/\/$/, '');

const publicCache = new Map();

const PUBLIC_REVALIDATE_MS =
  Math.min(
    3600,
    Math.max(30, Number(process.env.SITE_REVALIDATE_SECONDS || 300))
  ) * 1000;

// Set EMAIL_ENABLED=false in Netlify to disable all outgoing email.
function emailEnabled() {
  return String(process.env.EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
}

async function getCachedPublicPaper(paperId = null) {
  const key = paperId || '__published_papers__';
  const cached = publicCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const db = await readDatabase();

  const value = paperId
    ? (
        db.papers.find(
          (paper) => paper.id === paperId && paper.status === 'published'
        ) || null
      )
    : db.papers
        .filter((paper) => paper.status === 'published')
        .map(publicPaper)
        .sort(
          (a, b) =>
            new Date(b.publishedAt) - new Date(a.publishedAt)
        );

  publicCache.set(key, {
    value,
    expiresAt: Date.now() + PUBLIC_REVALIDATE_MS
  });

  return value;
}

const publicCacheHeaders = {
  'Cache-Control':
    'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
};

const publicConfig = () => ({
  journalName:
    process.env.JOURNAL_NAME ||
    'International Journal of Research and Open Science',
  shortName: process.env.JOURNAL_SHORT_NAME || 'ijros',
  siteUrl: siteUrl(),
  contactEmail:
    process.env.JOURNAL_CONTACT_EMAIL ||
    process.env.EDITORIAL_INBOX ||
    '',
  issn: process.env.JOURNAL_ISSN || '',
  payment: getPaymentConfig(),
  maxPdfMb: MAX_MB
});

function idToken(prefix = '') {
  return `${prefix}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function fileResponse(
  buffer,
  filename,
  contentType = 'application/pdf',
  cacheControl = 'public, max-age=300'
) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Content-Disposition':
        `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': cacheControl
    }
  });
}

async function consumeRateLimit(key, max, windowMs) {
  return updateDatabase((db) => {
    db.rateLimits ||= {};

    const now = Date.now();

    const prior = db.rateLimits[key] || {
      count: 0,
      startedAt: now
    };

    const active =
      now - prior.startedAt < windowMs
        ? prior
        : { count: 0, startedAt: now };

    active.count += 1;
    db.rateLimits[key] = active;

    for (const [name, value] of Object.entries(db.rateLimits)) {
      if (
        now - Number(value.startedAt || 0) >
        48 * 60 * 60 * 1000
      ) {
        delete db.rateLimits[name];
      }
    }

    return {
      allowed: active.count <= max,
      remaining: Math.max(0, max - active.count),
      retryAfter: Math.max(
        1,
        Math.ceil(
          (windowMs - (now - active.startedAt)) / 1000
        )
      )
    };
  }, 'Update request rate limits');
}

async function logMail(paperId, type, status, detail = '') {
  await updateDatabase((db) => {
    const paper = db.papers.find((item) => item.id === paperId);
    if (!paper) return;

    paper.mailLog ||= [];

    paper.mailLog.push({
      type,
      status,
      detail: cleanText(detail, 700),
      at: new Date().toISOString()
    });

    if (paper.mailLog.length > 60) {
      paper.mailLog = paper.mailLog.slice(-60);
    }

    if (status === 'failed') {
      paper.emailFailure = cleanText(detail, 500);
    } else if (paper.emailFailure) {
      delete paper.emailFailure;
    }
  }, `Record ${type} email ${status}`);
}

async function deliver(paper, type, options = {}, attachments = []) {
  if (!emailEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: 'email-disabled'
    };
  }

  try {
    const result = await sendEmail({
      to: paper.submitterEmail,
      type,
      paper,
      options,
      attachments
    });

    await logMail(
      paper.id,
      type,
      'sent',
      result.messageId || 'Sent'
    );

    return { ok: true };
  } catch (error) {
    await logMail(paper.id, type, 'failed', error.message);

    return {
      ok: false,
      error: error.message
    };
  }
}

async function notifyAdminOnce(key, subject, message) {
  if (!emailEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: 'email-disabled'
    };
  }

  const lock = await updateDatabase((db) => {
    db.adminNoticeLocks ||= {};

    const current = db.adminNoticeLocks[key];

    if (current?.sentAt) {
      return { acquired: false, reason: 'already-sent' };
    }

    if (
      current?.lockedAt &&
      Date.now() - current.lockedAt < 5 * 60 * 1000
    ) {
      return { acquired: false, reason: 'in-progress' };
    }

    db.adminNoticeLocks[key] = {
      lockedAt: Date.now()
    };

    return { acquired: true };
  }, 'Acquire admin notification lock');

  if (!lock?.acquired) {
    return {
      ok: true,
      skipped: true,
      reason: lock?.reason
    };
  }

  try {
    await sendAdminNotice(subject, message);

    await updateDatabase((db) => {
      db.adminNoticeLocks ||= {};
      db.adminNoticeLocks[key] = {
        sentAt: new Date().toISOString()
      };
    }, 'Record admin notification');

    return { ok: true };
  } catch (error) {
    await updateDatabase((db) => {
      db.adminNoticeLocks ||= {};
      delete db.adminNoticeLocks[key];
    }, 'Release failed admin notification lock');

    console.error('[admin-email]', error.message);

    return {
      ok: false,
      error: error.message
    };
  }
}

async function updatePaper(paperId, mutator, message = 'Update paper') {
  return updateDatabase((db) => {
    const paper = db.papers.find((item) => item.id === paperId);
    if (!paper) return null;

    const result = mutator(paper, db);

    return result === undefined ? paper : result;
  }, message);
}

// Prevent duplicate routine emails when an API action is repeated.
async function deliverOnce(
  paper,
  type,
  sentMarker,
  options = {},
  attachments = []
) {
  if (!emailEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: 'email-disabled'
    };
  }

  const lock = await updatePaper(
    paper.id,
    (current) => {
      current.emailSendLocks ||= {};

      if (current[sentMarker]) {
        return {
          acquired: false,
          reason: 'already-sent'
        };
      }

      const active = current.emailSendLocks[type];

      if (
        active &&
        Date.now() - Number(active.at || 0) < 5 * 60 * 1000
      ) {
        return {
          acquired: false,
          reason: 'in-progress'
        };
      }

      current.emailSendLocks[type] = {
        at: Date.now()
      };

      return { acquired: true };
    },
    `Acquire ${type} email send lock`
  );

  if (!lock?.acquired) {
    return {
      ok: true,
      skipped: true,
      reason: lock?.reason || 'not-acquired'
    };
  }

  const result = await deliver(
    paper,
    type,
    options,
    attachments
  );

  await updatePaper(
    paper.id,
    (current) => {
      if (current.emailSendLocks) {
        delete current.emailSendLocks[type];
      }

      if (result.ok && !result.skipped) {
        current[sentMarker] = new Date().toISOString();
      }
    },
    `Complete ${type} email send`
  );

  return result;
}

function getPaper(db, id) {
  return db.papers.find((paper) => paper.id === id) || null;
}

function publicPaper(paper) {
  const authors = (paper.authors || []).map(
    ({ name, affiliation, orcid }) => ({
      name,
      affiliation,
      orcid
    })
  );

  return {
    id: paper.id,
    title: paper.title,
    abstract: paper.abstract,
    keywords: paper.keywords || [],
    category: paper.category,
    articleType: paper.articleType,
    authors,
    volume: paper.volume || '',
    issue: paper.issue || '',
    doi: paper.figshare?.doi || '',
    figshareUrl: paper.figshare?.recordUrl || '',
    issn: paper.issn || '',
    publishedAt: paper.publishedAt,
    pageRange: paper.pageRange || '',
    pdfUrl: `/api/download/${encodeURIComponent(paper.id)}`
  };
}

function validateAuthors(authors) {
  if (
    !Array.isArray(authors) ||
    authors.length < 1 ||
    authors.length > 5
  ) {
    return false;
  }

  return authors.every(
    (author) =>
      cleanText(author?.name, 120).length > 1 &&
      cleanText(author?.affiliation, 180).length > 0
  );
}

function validatePdf(bytes) {
  if (!bytes || bytes.length < 8) {
    return 'Upload a valid PDF file.';
  }

  if (bytes.length > MAX_MB * 1024 * 1024) {
    return `PDF files must be ${MAX_MB} MB or smaller.`;
  }

  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return 'The uploaded file does not have valid PDF magic bytes.';
  }

  return null;
}

async function verifyAuthorAccess(paper, token) {
  if (
    !paper ||
    !paper.trackTokenHash ||
    !paper.trackTokenExpiresAt
  ) {
    return false;
  }

  if (
    new Date(paper.trackTokenExpiresAt).getTime() < Date.now()
  ) {
    return false;
  }

  return verifyOpaqueToken(token, paper.trackTokenHash);
}

async function issuePaymentLink(paperId) {
  const token = makeRandomToken(32);

  const ttlHours = Math.min(
    336,
    Math.max(1, Number(process.env.PAY_TOKEN_TTL_HOURS || 168))
  );

  await updatePaper(
    paperId,
    (paper) => {
      paper.payTokenHash = sha256(token);
      paper.payTokenExpiresAt = new Date(
        Date.now() + ttlHours * 60 * 60 * 1000
      ).toISOString();
    },
    'Issue payment access token'
  );

  return `${siteUrl()}/pay/${encodeURIComponent(paperId)}?token=${encodeURIComponent(token)}`;
}

async function getPaymentPaper(paperId, token) {
  const db = await readDatabase();
  const paper = getPaper(db, paperId);

  if (
    !paper ||
    !['accepted', 'payment_submitted'].includes(paper.status)
  ) {
    return null;
  }

  if (
    !paper.payTokenExpiresAt ||
    new Date(paper.payTokenExpiresAt).getTime() < Date.now()
  ) {
    return null;
  }

  if (!verifyOpaqueToken(token, paper.payTokenHash)) {
    return null;
  }

  return paper;
}

// Generate certificates and receipt only after Figshare DOI is saved.
async function generateAndPublish(paperId) {
  let paper = await updatePaper(
    paperId,
    (current) => {
      if (!current) return null;

      if (
        current.paymentStatus !== 'confirmed' ||
        !current.payment?.utr
      ) {
        throw new Error(
          'Payment must be confirmed before publication.'
        );
      }

      if (
        !current.figshare?.doi ||
        current.figshare.status !== 'published'
      ) {
        throw new Error(
          'A published Figshare DOI is required before final publication.'
        );
      }

      if (current.status !== 'published' && current.status !== 'publishing') {
        current.status = 'publishing';
        current.publishedAt ||= current.figshare.publishedAt || new Date().toISOString();

        addTimeline(
          current,
          'publishing',
          'Figshare DOI recorded. Preparing publication files and author certificates.',
          'admin'
        );
      }

      assignArchive(
        current,
        current.publishedAt,
        Number(process.env.JOURNAL_LAUNCH_YEAR || 2026)
      );

      ensureCertificates(current);

      return current;
    },
    'Begin DOI-backed publication'
  );

  if (!paper) {
    throw new Error('Paper not found.');
  }

  // Generate missing certificates after DOI has been saved.
  for (const certificate of paper.certificates || []) {
    if (certificate.filePath) continue;

    const verifyUrl =
      `${siteUrl()}/verify/${encodeURIComponent(certificate.certificateId)}`;

    const bytes = await generateCertificatePdf({
      paper,
      certificate,
      verifyUrl
    });

    const filePath =
      `certificates/${certificate.certificateId}.pdf`;

    await writeBinary(
      filePath,
      bytes,
      `Create certificate ${certificate.certificateId}`
    );

    await updatePaper(
      paperId,
      (current) => {
        const item = current.certificates?.find(
          (entry) =>
            entry.certificateId === certificate.certificateId
        );

        if (item) {
          item.filePath = filePath;
          item.generatedAt = new Date().toISOString();
        }
      },
      `Record certificate ${certificate.certificateId}`
    );

    paper = await readDatabase().then(
      (db) => getPaper(db, paperId)
    );
  }

  paper = await updatePaper(
    paperId,
    (current) => {
      current.status = 'published';
      current.paymentStatus = 'confirmed';
      current.payTokenHash = null;
      current.payTokenExpiresAt = null;

      if (!current.history?.some((item) => item.type === 'published')) {
        addTimeline(
          current,
          'published',
          'Paper published with its Figshare DOI and author certificates.',
          'admin'
        );
      }

      return current;
    },
    'Finalize DOI-backed publication'
  );

  publicCache.clear();

  // Create payment receipt if it does not already exist.
  if (!paper.payment?.receiptFilePath) {
    paper = await updatePaper(
      paperId,
      (current) => {
        current.payment ||= {};

        current.payment.receiptId ||=
          `ijros-RCPT-${new Date().getFullYear()}-${idToken()}`;

        return current;
      },
      'Reserve payment receipt reference'
    );

    const receiptId = paper.payment.receiptId;
    const receiptFilePath = `receipts/${receiptId}.pdf`;

    const receiptBytes = await generatePaymentReceiptPdf({
      paper,
      payment: {
        ...paper.payment,
        receiptId,
        amount: paper.payment?.amount || getPaymentConfig().amount
      }
    });

    await writeBinary(
      receiptFilePath,
      receiptBytes,
      `Create payment receipt ${receiptId}`
    );

    await updatePaper(
      paperId,
      (current) => {
        current.payment ||= {};

        if (!current.payment.receiptFilePath) {
          current.payment.receiptId = receiptId;
          current.payment.receiptFilePath = receiptFilePath;
          current.payment.receiptGeneratedAt = new Date().toISOString();
        }
      },
      'Record payment receipt'
    );

    paper = await readDatabase().then(
      (db) => getPaper(db, paperId)
    );
  }

  // Email delivery is optional. Publication itself does not depend on SMTP.
  const payment = paper.payment || {};

  const receipt = payment.receiptFilePath
    ? await readBinary(payment.receiptFilePath)
    : null;

  const receiptAttachment = receipt
    ? [{
        filename: `${payment.receiptId || 'payment-receipt'}.pdf`,
        content: receipt,
        contentType: 'application/pdf'
      }]
    : [];

  await deliverOnce(
    paper,
    'payment_received',
    'paymentEmailSentAt',
    {},
    receiptAttachment
  );

  paper = await readDatabase().then(
    (db) => getPaper(db, paperId)
  );

  const attachments = [];

  for (const certificate of paper.certificates || []) {
    if (!certificate.filePath) continue;

    const bytes = await readBinary(certificate.filePath);

    if (bytes) {
      attachments.push({
        filename: `${certificate.certificateId}.pdf`,
        content: bytes,
        contentType: 'application/pdf'
      });
    }
  }

  await deliverOnce(
    paper,
    'publication',
    'publicationEmailSentAt',
    {
      paperUrl: `${siteUrl()}/papers/${paper.id}`
    },
    attachments
  );

  return await readDatabase().then(
    (db) => getPaper(db, paperId)
  );
}

async function handleSubmit(request, context) {
  const limit = await consumeRateLimit(
    `submit:${requestIp(request, context)}`,
    5,
    60 * 60 * 1000
  );

  if (!limit.allowed) {
    return json(
      {
        error:
          'Too many submissions from this connection. Please try again later.'
      },
      429,
      { 'Retry-After': String(limit.retryAfter) }
    );
  }

  const form = await request.formData();

  const honeypot = String(form.get('website') || '').trim();

  if (honeypot) {
    return json({ ok: true, paperId: 'received' }, 202);
  }

  const file = form.get('manuscript');

  if (!file || typeof file.arrayBuffer !== 'function') {
    return json(
      { error: 'Please attach your manuscript PDF.' },
      400
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const pdfProblem = validatePdf(bytes);

  if (pdfProblem) {
    return json({ error: pdfProblem }, 400);
  }

  let authors;

  try {
    authors = JSON.parse(String(form.get('authors') || '[]'));
  } catch {
    authors = null;
  }

  if (!validateAuthors(authors)) {
    return json(
      {
        error:
          'Add between one and five authors. Each author needs a name and affiliation.'
      },
      400
    );
  }

  const submitterEmail =
    cleanText(form.get('submitterEmail'), 180).toLowerCase();

  const submitterName =
    cleanText(form.get('submitterName'), 120) || authors[0].name;

  if (!validEmail(submitterEmail)) {
    return json(
      { error: 'Enter a valid corresponding-author email address.' },
      400
    );
  }

  const title = cleanText(form.get('title'), 260);
  const abstract = cleanText(form.get('abstract'), 5000);

  if (title.length < 8 || abstract.length < 40) {
    return json(
      {
        error:
          'Enter a descriptive title and an abstract of at least 40 characters.'
      },
      400
    );
  }

  const year = new Date().getUTCFullYear();
  const paperId = `ijros-${year}-${idToken()}`;
  const filePath = `submissions/${paperId}/v1.pdf`;

  const trackToken = makeRandomToken(32);

  const trackDays = Math.min(
    730,
    Math.max(1, Number(process.env.TRACK_TOKEN_TTL_DAYS || 365))
  );

  const paper = {
    id: paperId,
    title,
    abstract,

    keywords: cleanText(form.get('keywords'), 500)
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean)
      .slice(0, 12),

    category: cleanText(form.get('category'), 80),
    articleType: cleanText(form.get('articleType'), 80),

    authors: authors.map((author) => ({
      name: cleanText(author.name, 120),
      affiliation: cleanText(author.affiliation, 180),
      orcid: cleanText(author.orcid, 40)
    })),

    submitterName,
    submitterEmail,

    status: 'submitted',
    paymentStatus: 'not_due',

    version: 1,

    versions: [{
      version: 1,
      filePath,
      filename: safeFilename(file.name),
      uploadedAt: new Date().toISOString()
    }],

    currentFilePath: filePath,

    // DOI is stored only in paper.figshare.doi after Figshare publication.
    issn: process.env.JOURNAL_ISSN || '',
    volume: '',
    issue: '',

    submittedAt: new Date().toISOString(),

    trackTokenHash: sha256(trackToken),

    trackTokenExpiresAt: new Date(
      Date.now() + trackDays * 24 * 60 * 60 * 1000
    ).toISOString(),

    history: [],
    mailLog: [],
    certificates: [],
    payment: null
  };

  addTimeline(
    paper,
    'submitted',
    'Manuscript received by the editorial office.',
    'author'
  );

  await writeBinary(
    filePath,
    bytes,
    `Upload manuscript ${paperId}`
  );

  await updateDatabase(
    (db) => {
      db.papers.push(paper);
    },
    `Create submission ${paperId}`
  );

  const link =
    `${siteUrl()}/track?paperId=${encodeURIComponent(paperId)}&token=${encodeURIComponent(trackToken)}`;

  const mail = await deliverOnce(
    paper,
    'submitted',
    'submissionEmailSentAt',
    { trackingUrl: link }
  );

  return json(
    {
      ok: true,
      paperId,
      emailSent: mail.ok && !mail.skipped,
      emailSkipped: Boolean(mail.skipped),
      message: mail.skipped
        ? 'Submission received. Email sending is disabled. Save your paper ID and use the Track page.'
        : mail.ok
          ? 'Submission received. Your tracking link has been emailed.'
          : 'Submission received. Email delivery needs attention; save your paper ID and use the Track page.'
    },
    201
  );
}

async function handleRevision(request) {
  const form = await request.formData();

  const paperId = cleanText(form.get('paperId'), 80);
  const token = String(form.get('token') || '');
  const file = form.get('manuscript');

  const db = await readDatabase();
  const paper = getPaper(db, paperId);

  if (!await verifyAuthorAccess(paper, token)) {
    return json(
      {
        error:
          'Your tracking token is invalid or expired. Use the claim form to request new access.'
      },
      401
    );
  }

  if (paper.status !== 'revision_requested') {
    return json(
      {
        error:
          'A revised manuscript is not currently requested for this paper.'
      },
      409
    );
  }

  if (!file || typeof file.arrayBuffer !== 'function') {
    return json(
      { error: 'Attach the revised manuscript PDF.' },
      400
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const pdfProblem = validatePdf(bytes);

  if (pdfProblem) {
    return json({ error: pdfProblem }, 400);
  }

  const nextVersion = Number(paper.version || 1) + 1;
  const filePath = `submissions/${paperId}/v${nextVersion}.pdf`;

  await writeBinary(
    filePath,
    bytes,
    `Upload revised manuscript ${paperId} v${nextVersion}`
  );

  const updated = await updatePaper(
    paperId,
    (current) => {
      current.version = nextVersion;
      current.currentFilePath = filePath;

      current.versions.push({
        version: nextVersion,
        filePath,
        filename: safeFilename(file.name),
        uploadedAt: new Date().toISOString()
      });

      current.status = 'revision_submitted';
      current.revisionComments = '';

      addTimeline(
        current,
        'revision_submitted',
        `Author uploaded revised manuscript version ${nextVersion}.`,
        'author'
      );

      return current;
    },
    `Save revision ${paperId} v${nextVersion}`
  );

  await notifyAdminOnce(
    `revision:${paperId}:${nextVersion}`,
    `Revised manuscript received · ${paperId}`,
    `A revised PDF has been uploaded for ${paperId}: ${updated.title}`
  );

  return json({
    ok: true,
    message: 'Your revised PDF has been received.'
  });
}

async function handleTrack(body) {
  const paperId = cleanText(body.paperId, 80);

  const db = await readDatabase();
  const paper = getPaper(db, paperId);

  if (!await verifyAuthorAccess(paper, body.token)) {
    return json(
      {
        error:
          'Paper ID or private tracking token is incorrect or expired.'
      },
      401
    );
  }

  return json({
    paperId: paper.id,
    title: paper.title,
    status: paper.status,
    paymentStatus: paper.paymentStatus,
    submittedAt: paper.submittedAt,
    publishedAt: paper.publishedAt || null,

    // Author tracking page can display the Figshare DOI after publication.
    doi: paper.figshare?.doi || '',
    figshareUrl: paper.figshare?.recordUrl || '',

    revisionComments: paper.revisionComments || '',

    history: (paper.history || []).map(
      ({ type, message, at }) => ({
        type,
        message,
        at
      })
    ),

    certificates: (paper.certificates || [])
      .filter((cert) => cert.filePath)
      .map(({ certificateId, authorName }) => ({
        certificateId,
        authorName,
        url: `/api/certificate/${encodeURIComponent(certificateId)}`
      }))
  });
}

async function handleClaim(body, context) {
  const genericMessage =
    'If this email is associated with one or more submissions, new tracking details will be sent to it.';

  // Do not rotate author tokens when email delivery is disabled.
  if (!emailEnabled()) {
    return json({ message: genericMessage });
  }

  const ipLimit = await consumeRateLimit(
    `claim:${requestIp(context.request, context)}`,
    5,
    60 * 60 * 1000
  );

  if (!ipLimit.allowed) {
    return json({ message: genericMessage });
  }

  const email = cleanText(body.email, 180).toLowerCase();

  if (!validEmail(email)) {
    return json({ message: genericMessage });
  }

  const emailLimit = await consumeRateLimit(
    `claim-email:${sha256(email)}`,
    3,
    24 * 60 * 60 * 1000
  );

  if (!emailLimit.allowed) {
    return json({ message: genericMessage });
  }

  const db = await readDatabase();

  const matchingPaperIds = db.papers
    .filter(
      (paper) =>
        String(paper.submitterEmail || '').trim().toLowerCase() === email
    )
    .map((paper) => paper.id)
    .filter(Boolean)
    .slice(0, 10);

  for (const paperId of matchingPaperIds) {
    const token = makeRandomToken(32);
    const tokenHash = sha256(token);

    let previousAccess = null;

    const matched = await updatePaper(
      paperId,
      (paper) => {
        if (
          String(paper.submitterEmail || '').trim().toLowerCase() !== email
        ) {
          return null;
        }

        previousAccess = {
          hash: paper.trackTokenHash || null,
          expiresAt: paper.trackTokenExpiresAt || null
        };

        const configuredDays =
          Number(process.env.TRACK_TOKEN_TTL_DAYS || 365);

        const trackDays = Number.isFinite(configuredDays)
          ? Math.min(730, Math.max(1, configuredDays))
          : 365;

        paper.trackTokenHash = tokenHash;

        paper.trackTokenExpiresAt = new Date(
          Date.now() + trackDays * 24 * 60 * 60 * 1000
        ).toISOString();

        addTimeline(
          paper,
          'tracking_access_renewal_pending',
          'Author requested new tracking access; email delivery is pending.',
          'system'
        );

        return { ...paper };
      },
      `Prepare tracking recovery for ${paperId}`
    );

    if (!matched) continue;

    const mail = await deliver(
      matched,
      'claimed',
      {
        token,
        trackingUrl: `${siteUrl()}/track`
      }
    );

    if (mail.ok && !mail.skipped) {
      await updatePaper(
        paperId,
        (paper) => {
          if (paper.trackTokenHash !== tokenHash) return;

          addTimeline(
            paper,
            'tracking_access_renewed',
            'A new private tracking token was emailed to the corresponding author.',
            'system'
          );
        },
        `Confirm tracking recovery email for ${paperId}`
      );
    } else {
      await updatePaper(
        paperId,
        (paper) => {
          if (paper.trackTokenHash !== tokenHash) return;

          if (previousAccess?.hash) {
            paper.trackTokenHash = previousAccess.hash;
          } else {
            delete paper.trackTokenHash;
          }

          if (previousAccess?.expiresAt) {
            paper.trackTokenExpiresAt = previousAccess.expiresAt;
          } else {
            delete paper.trackTokenExpiresAt;
          }

          addTimeline(
            paper,
            'tracking_access_email_failed',
            'Tracking access email could not be delivered; the previous token was preserved.',
            'system'
          );
        },
        `Restore tracking access after email failure for ${paperId}`
      );
    }
  }

  return json({ message: genericMessage });
}

async function handlePaymentSubmit(body) {
  const paperId = cleanText(body.paperId, 80);
  const token = String(body.token || '');

  if (!paperId || !token) {
    return json(
      { error: 'Paper ID and payment token are required.' },
      400
    );
  }

  const paper = await getPaymentPaper(paperId, token);

  if (!paper) {
    return json(
      {
        error:
          'This payment link is invalid or expired. Contact the editorial office for a fresh link.'
      },
      401
    );
  }

  // Prevent duplicate payment submission and repeated notifications.
  if (
    paper.status === 'payment_submitted' ||
    paper.paymentStatus === 'submitted' ||
    paper.paymentStatus === 'confirmed'
  ) {
    return json(
      {
        error:
          'A payment reference has already been submitted or confirmed for this paper. Contact the editorial office if you need to correct it.'
      },
      409
    );
  }

  const utr = String(body.utr || '').trim();

  if (!validatePaymentUtr(utr)) {
    return json(
      {
        error:
          'Enter a valid 12-digit UTR / transaction reference.'
      },
      400
    );
  }

  const config = getPaymentConfig();

  if (!config.ready) {
    return json(
      {
        error:
          'UPI payment details are not configured. Contact the editorial office.'
      },
      503
    );
  }

  const database = await readDatabase();

  const duplicate = database.papers.some(
    (item) =>
      item.id !== paperId &&
      String(item.payment?.utr || '').trim() === utr
  );

  if (duplicate) {
    return json(
      {
        error:
          'This transaction reference has already been submitted for another manuscript.'
      },
      409
    );
  }

  const updated = await updatePaper(
    paperId,
    (current) => {
      if (!current) {
        throw new Error('Paper not found.');
      }

      if (
        current.status === 'payment_submitted' ||
        current.paymentStatus === 'submitted' ||
        current.paymentStatus === 'confirmed'
      ) {
        throw new Error(
          'A payment reference has already been submitted for this paper.'
        );
      }

      current.payment = {
        utr,
        amount: config.amount,
        submittedAt: new Date().toISOString(),
        status: 'submitted',
        note: cleanText(body.note, 200)
      };

      current.paymentStatus = 'submitted';
      current.status = 'payment_submitted';

      addTimeline(
        current,
        'payment_submitted',
        'Author submitted a UPI transaction reference. Awaiting manual verification.',
        'author'
      );

      return current;
    },
    `Record payment UTR ${paperId}`
  );

  const authorMail = await deliverOnce(
    updated,
    'payment_submitted',
    'paymentSubmittedEmailSentAt',
    { utr }
  );

  const adminMail = await notifyAdminOnce(
    `payment-submitted:${paperId}`,
    `UPI payment awaiting verification - ${paperId}`,
    [
      `Paper: ${updated.title}`,
      `Paper ID: ${paperId}`,
      `Author: ${updated.submitterName}`,
      `Amount: INR ${config.amount}`,
      `UTR: ${utr}`,
      '',
      'Please verify the transaction against the actual bank credit.',
      'Do not publish until payment is confirmed.'
    ].join('\n')
  );

  return json({
    ok: true,
    status: 'payment_submitted',
    emailSent: authorMail.ok && !authorMail.skipped,
    adminEmailSent: adminMail.ok && !adminMail.skipped,
    message:
      'UTR submitted successfully. Your payment is awaiting manual verification.'
  });
}

// Complete Figshare publication workflow.
// DOI is saved before certificates and publication emails are generated.
async function publishPaperToFigshare(paperId) {
  let paper = getPaper(await readDatabase(), paperId);

  if (!paper) {
    throw new Error('Paper not found.');
  }

  if (
    paper.paymentStatus !== 'confirmed' ||
    !paper.payment?.utr
  ) {
    throw new Error(
      'Confirm the author payment before publishing this paper.'
    );
  }

  // A completed Figshare publication can safely resume local finalisation.
  if (
    paper.figshare?.status === 'published' &&
    paper.figshare?.doi
  ) {
    const completed = await generateAndPublish(paperId);

    return {
      paper: completed,
      resumed: true
    };
  }

  if (
    !['ready_to_publish', 'publishing'].includes(paper.status)
  ) {
    throw new Error(
      'This paper must be payment-confirmed and ready to publish.'
    );
  }

  const licenseId = Number(process.env.FIGSHARE_LICENSE_ID || 0);

  if (!Number.isInteger(licenseId) || licenseId <= 0) {
    throw new Error(
      'FIGSHARE_LICENSE_ID is missing. Configure a licence that the copyright holder or authors have authorised.'
    );
  }

  const paperUrl =
    `${siteUrl()}/papers/${encodeURIComponent(paperId)}`;

  const publicationDate =
    paper.publishedAt || new Date().toISOString();

  const figsharePaper = {
    ...paper,
    publishedAt: publicationDate
  };

  let figshare = paper.figshare || {};

  // Create the private Figshare draft once.
  if (!figshare.articleId) {
    const created = await createFigshareArticle(
      figsharePaper,
      paperUrl
    );

    if (!created?.articleId) {
      throw new Error(
        'Figshare did not return an article ID. The private draft could not be saved.'
      );
    }

    figshare = {
      ...figshare,
      articleId: created.articleId,
      privateUrl: created.privateUrl || '',
      status: 'draft_created',
      createdAt: new Date().toISOString()
    };

    await updatePaper(
      paperId,
      (current) => {
        current.figshare = {
          ...(current.figshare || {}),
          ...figshare
        };

        // Never maintain a second IJRISE-owned DOI field.
        delete current.doi;

        addTimeline(
          current,
          'figshare_draft_created',
          'Private Figshare draft created.',
          'admin'
        );
      },
      `Save Figshare draft ${paperId}`
    );
  }

  paper = getPaper(await readDatabase(), paperId);

  const filePath =
    paper.currentFilePath ||
    paper.versions?.at(-1)?.filePath;

  if (!filePath) {
    throw new Error(
      'The final manuscript PDF could not be located.'
    );
  }

  const pdf = await readBinary(filePath);

  if (!pdf) {
    throw new Error(
      'The final manuscript PDF could not be read from GitHub storage.'
    );
  }

  // Synchronise Figshare metadata before upload and publication.
  await updateFigshareArticle(
    figshare.articleId,
    figsharePaper,
    paperUrl
  );

  const uploaded = await uploadFigsharePdf(
    figshare.articleId,
    `${paperId}.pdf`,
    pdf
  );

  await updatePaper(
    paperId,
    (current) => {
      current.figshare = {
        ...(current.figshare || {}),
        status: 'draft',
        fileId: uploaded?.fileId || current.figshare?.fileId || '',
        fileName: uploaded?.name || `${paperId}.pdf`,
        updatedAt: new Date().toISOString()
      };

      if (!current.history?.some(
        (item) => item.type === 'figshare_draft_ready'
      )) {
        addTimeline(
          current,
          'figshare_draft_ready',
          'Final PDF and article metadata uploaded to Figshare draft.',
          'admin'
        );
      }
    },
    `Save Figshare upload ${paperId}`
  );

  // Publish the Figshare record and obtain its DOI.
  const result = await publishFigshareArticle(
    figshare.articleId,
    figsharePaper,
    paperUrl,
    licenseId
  );

  const doi = cleanText(result?.doi, 200);

  if (!doi) {
    throw new Error(
      'Figshare did not return a DOI. The paper has not been finalised on IJRISE. Check the Figshare record before retrying.'
    );
  }

  const figsharePublishedAt =
    result.publishedAt || new Date().toISOString();

  // IMPORTANT: Save DOI before generating certificates or emails.
  const updated = await updatePaper(
    paperId,
    (current) => {
      current.figshare = {
        ...(current.figshare || {}),
        status: 'published',
        doi,
        recordUrl: result.recordUrl || '',
        publishedAt: figsharePublishedAt,
        updatedAt: new Date().toISOString()
      };

      current.publishedAt ||= figsharePublishedAt;

      // Remove any old, independently stored DOI.
      delete current.doi;

      addTimeline(
        current,
        'figshare_published',
        `Figshare record published with DOI ${doi}.`,
        'admin'
      );

      return current;
    },
    `Save Figshare DOI ${paperId}`
  );

  if (!updated?.figshare?.doi) {
    throw new Error(
      'Figshare returned a DOI, but it could not be saved to the paper record. Check the Figshare record before retrying.'
    );
  }

  const finalPaper = await generateAndPublish(paperId);

  return {
    paper: finalPaper,
    resumed: false
  };
}

async function adminAction(body) {
  const paperId = cleanText(body.paperId, 80);
  const action = cleanText(body.action, 40);

  const existing = getPaper(await readDatabase(), paperId);

  if (!existing) {
    return json({ error: 'Paper not found.' }, 404);
  }

  // Publish button: payment confirmation -> Figshare -> DOI -> certificates.
  if (
    action === 'publish' ||
    action === 'figshare_publish'
  ) {
    try {
      const result = await publishPaperToFigshare(paperId);

      return json({
        ok: true,
        status: result.paper.status,
        paymentStatus: result.paper.paymentStatus,
        doi: result.paper.figshare?.doi || '',
        figshareUrl: result.paper.figshare?.recordUrl || '',
        certificates: (result.paper.certificates || []).map(
          (certificate) => ({
            certificateId: certificate.certificateId,
            authorName: certificate.authorName,
            url: certificate.filePath
              ? `/api/certificate/${encodeURIComponent(certificate.certificateId)}`
              : ''
          })
        ),
        resumed: result.resumed,
        emailEnabled: emailEnabled(),
        message: result.resumed
          ? 'Figshare DOI already existed. Local publication finalisation was completed.'
          : 'Figshare publication completed and DOI saved.'
      });
    } catch (error) {
      console.error('[figshare-publish]', paperId, error);

      return json(
        {
          error: error.message || 'Figshare publication failed.',
          figshare: getPaper(await readDatabase(), paperId)?.figshare || null
        },
        502
      );
    }
  }

  // Optional: prepare a Figshare draft without publishing it.
  if (action === 'figshare_create') {
    if (
      existing.paymentStatus !== 'confirmed' ||
      !existing.payment?.utr ||
      !['ready_to_publish', 'publishing'].includes(existing.status)
    ) {
      return json(
        {
          error:
            'Confirm payment before creating the Figshare publication draft.'
        },
        409
      );
    }

    try {
      const paperUrl =
        `${siteUrl()}/papers/${encodeURIComponent(paperId)}`;

      let figshare = existing.figshare || {};

      if (!figshare.articleId) {
        const created = await createFigshareArticle(
          existing,
          paperUrl
        );

        if (!created?.articleId) {
          throw new Error('Figshare did not return an article ID.');
        }

        figshare = {
          articleId: created.articleId,
          privateUrl: created.privateUrl || '',
          status: 'draft_created',
          createdAt: new Date().toISOString()
        };

        await updatePaper(
          paperId,
          (paper) => {
            paper.figshare = {
              ...(paper.figshare || {}),
              ...figshare
            };
            delete paper.doi;
          },
          `Save Figshare draft ${paperId}`
        );
      }

      const latest = getPaper(await readDatabase(), paperId);

      const filePath =
        latest.currentFilePath ||
        latest.versions?.at(-1)?.filePath;

      if (!filePath) {
        throw new Error('The manuscript PDF could not be located.');
      }

      const pdf = await readBinary(filePath);

      if (!pdf) {
        throw new Error('The manuscript PDF could not be read.');
      }

      await updateFigshareArticle(
        figshare.articleId,
        latest,
        paperUrl
      );

      const uploaded = await uploadFigsharePdf(
        figshare.articleId,
        `${paperId}.pdf`,
        pdf
      );

      const updated = await updatePaper(
        paperId,
        (paper) => {
          paper.figshare = {
            ...(paper.figshare || {}),
            status: 'draft',
            fileId: uploaded?.fileId || '',
            fileName: uploaded?.name || `${paperId}.pdf`,
            updatedAt: new Date().toISOString()
          };

          addTimeline(
            paper,
            'figshare_draft_ready',
            'Final PDF and article metadata uploaded to Figshare draft.',
            'admin'
          );

          return paper;
        },
        `Complete Figshare draft ${paperId}`
      );

      return json({
        ok: true,
        figshare: updated.figshare
      });
    } catch (error) {
      console.error('[figshare-draft]', paperId, error);

      return json(
        { error: error.message || 'Figshare draft creation failed.' },
        502
      );
    }
  }

  // 1. Start editorial review.
  if (action === 'start_review') {
    if (
      !['submitted', 'revision_submitted'].includes(existing.status)
    ) {
      return json(
        {
          error:
            'This paper cannot be moved to review from its current state.'
        },
        409
      );
    }

    const updated = await updatePaper(
      paperId,
      (paper) => {
        paper.status = 'under_review';

        addTimeline(
          paper,
          'under_review',
          'Editorial screening / review started.',
          'admin'
        );

        return paper;
      },
      `Start editorial review ${paperId}`
    );

    return json({ ok: true, status: updated.status });
  }

  // 2. Accept manuscript.
  if (action === 'accept') {
    if (existing.status === 'accepted') {
      return json({
        ok: true,
        status: existing.status,
        message: 'This manuscript has already been accepted.'
      });
    }

    if (
      !['submitted', 'under_review', 'revision_submitted'].includes(
        existing.status
      )
    ) {
      return json(
        {
          error:
            'This paper cannot be accepted from its current state.'
        },
        409
      );
    }

    const paymentUrl = await issuePaymentLink(paperId);

    const updated = await updatePaper(
      paperId,
      (paper) => {
        paper.status = 'accepted';
        paper.paymentStatus = 'due';

        addTimeline(
          paper,
          'accepted',
          'Editor accepted the manuscript. Payment is now due.',
          'admin'
        );

        return paper;
      },
      `Accept paper ${paperId}`
    );

    const mail = await deliverOnce(
      updated,
      'accepted',
      'acceptedEmailSentAt',
      { paymentUrl }
    );

    return json({
      ok: true,
      emailSent: mail.ok && !mail.skipped,
      emailSkipped: Boolean(mail.skipped)
    });
  }

  // 3. Reject manuscript.
  if (action === 'reject') {
    const reason = cleanText(body.reason, 1200);

    const updated = await updatePaper(
      paperId,
      (paper) => {
        if (paper.status === 'rejected') return paper;

        paper.status = 'rejected';
        paper.decisionReason = reason;

        addTimeline(
          paper,
          'rejected',
          reason || 'Editor declined the submission.',
          'admin'
        );

        return paper;
      },
      `Reject paper ${paperId}`
    );

    const mail = await deliverOnce(
      updated,
      'rejected',
      'rejectedEmailSentAt',
      { reason }
    );

    return json({
      ok: true,
      emailSent: mail.ok && !mail.skipped
    });
  }

  // 4. Request manuscript revision.
  if (action === 'request_revision') {
    const comments = cleanText(body.comments, 3000);

    if (!comments) {
      return json(
        {
          error:
            'Add revision comments before sending the request.'
        },
        400
      );
    }

    const updated = await updatePaper(
      paperId,
      (paper) => {
        paper.status = 'revision_requested';
        paper.revisionComments = comments;

        addTimeline(
          paper,
          'revision_requested',
          'Editor requested a revised manuscript.',
          'admin'
        );

        return paper;
      },
      `Request revision ${paperId}`
    );

    const mail = await deliverOnce(
      updated,
      'revision',
      'revisionEmailSentAt',
      { comments }
    );

    return json({
      ok: true,
      emailSent: mail.ok && !mail.skipped
    });
  }

  // 5. Confirm payment only. Does not publish.
  if (action === 'confirm_payment') {
    if (
      existing.paymentStatus === 'confirmed' &&
      existing.payment?.utr
    ) {
      return json({
        ok: true,
        status: existing.status,
        paymentStatus: 'confirmed',
        message:
          'Payment is already confirmed. The paper is ready for publication.'
      });
    }

    if (
      !existing.payment?.utr ||
      existing.status !== 'payment_submitted'
    ) {
      return json(
        {
          error:
            'There is no submitted UTR awaiting confirmation.'
        },
        409
      );
    }

    const updated = await updatePaper(
      paperId,
      (paper) => {
        paper.payment ||= {};

        paper.payment.status = 'confirmed';
        paper.payment.confirmedAt = new Date().toISOString();
        paper.paymentStatus = 'confirmed';
        paper.status = 'ready_to_publish';

        addTimeline(
          paper,
          'payment_confirmed',
          `Admin confirmed UTR ${paper.payment.utr}. Paper is ready for publication.`,
          'admin'
        );

        return paper;
      },
      `Confirm payment ${paperId}`
    );

    return json({
      ok: true,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      message:
        'Payment confirmed. Click Publish when you are ready to publish this paper.'
    });
  }

  // 6. Reject payment.
  if (action === 'reject_payment') {
    const reason = cleanText(body.reason, 1000);
    const newUrl = await issuePaymentLink(paperId);

    const updated = await updatePaper(
      paperId,
      (paper) => {
        paper.status = 'accepted';
        paper.paymentStatus = 'rejected';

        paper.payment = {
          ...(paper.payment || {}),
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectionReason: reason
        };

        addTimeline(
          paper,
          'payment_rejected',
          reason || 'Payment could not be verified.',
          'admin'
        );

        return paper;
      },
      `Reject payment ${paperId}`
    );

    const mail = await deliverOnce(
      updated,
      'payment_rejected',
      'paymentRejectedEmailSentAt',
      { reason }
    );

    await deliverOnce(
      updated,
      'accepted',
      'acceptedEmailSentAt',
      { paymentUrl: newUrl }
    );

    return json({
      ok: true,
      emailSent: mail.ok && !mail.skipped
    });
  }

  // 7. Unpublish paper.
  if (action === 'unpublish') {
    const reason = cleanText(body.reason, 1200);

    if (!reason) {
      return json(
        { error: 'A reason is required to unpublish a paper.' },
        400
      );
    }

    const updated = await updatePaper(
      paperId,
      (paper) => {
        paper.status = 'unpublished';
        paper.unpublishedAt = new Date().toISOString();
        paper.unpublishReason = reason;

        addTimeline(
          paper,
          'unpublished',
          `Paper unpublished: ${reason}`,
          'admin'
        );

        return paper;
      },
      `Unpublish paper ${paperId}`
    );

    await deliverOnce(
      updated,
      'unpublished',
      'unpublishedEmailSentAt',
      { reason }
    );

    publicCache.clear();

    return json({ ok: true });
  }

  // 8. Edit paper metadata.
  if (action === 'edit_metadata') {
    const updated = await updatePaper(
      paperId,
      (paper) => {
        for (const field of [
          'title',
          'abstract',
          'category',
          'articleType',
          'issn',
          'volume',
          'issue',
          'pageRange'
        ]) {
          if (Object.hasOwn(body, field)) {
            paper[field] = cleanText(
              body[field],
              field === 'abstract' ? 5000 : 300
            );
          }
        }

        addTimeline(
          paper,
          'metadata_updated',
          'Editor updated paper metadata.',
          'admin'
        );

        return paper;
      },
      `Edit metadata ${paperId}`
    );

    publicCache.clear();

    return json({
      ok: true,
      paper: {
        id: updated.id,
        title: updated.title
      }
    });
  }

  // 9. Explicit admin email resend.
  if (action === 'resend_email') {
    let type = cleanText(body.type, 40);

    if (type === 'last_failed') {
      const lastFailure = [...(existing.mailLog || [])]
        .reverse()
        .find((entry) => entry.status === 'failed');

      if (!lastFailure) {
        return json(
          {
            error:
              'There is no failed email recorded for this paper.'
          },
          409
        );
      }

      type = lastFailure.type;
    }

    let current = existing;
    const options = {};
    const attachments = [];

    if (type === 'accepted') {
      options.paymentUrl = await issuePaymentLink(paperId);

      current = await readDatabase().then(
        (db) => getPaper(db, paperId)
      );
    } else if (type === 'claimed' || type === 'submitted') {
      const token = makeRandomToken(32);

      await updatePaper(
        paperId,
        (paper) => {
          paper.trackTokenHash = sha256(token);

          paper.trackTokenExpiresAt = new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString();
        },
        `Rotate author token ${paperId}`
      );

      current = await readDatabase().then(
        (db) => getPaper(db, paperId)
      );

      options.token = token;
      options.trackingUrl = `${siteUrl()}/track`;
    } else if (type === 'payment_received') {
      const receipt = existing.payment?.receiptFilePath
        ? await readBinary(existing.payment.receiptFilePath)
        : null;

      if (receipt) {
        attachments.push({
          filename:
            `${existing.payment.receiptId || 'payment-receipt'}.pdf`,
          content: receipt,
          contentType: 'application/pdf'
        });
      }
    } else if (type === 'revision') {
      options.comments =
        existing.revisionComments ||
        'Please review the editorial comments previously sent.';
    } else if (type === 'rejected' || type === 'unpublished') {
      options.reason =
        existing.decisionReason ||
        existing.unpublishReason ||
        '';
    } else if (type === 'payment_submitted') {
      options.utr = existing.payment?.utr || '';
    } else if (type === 'payment_rejected') {
      options.reason = existing.payment?.rejectionReason || '';
    } else if (type === 'publication') {
      for (const cert of existing.certificates || []) {
        if (!cert.filePath) continue;

        const bytes = await readBinary(cert.filePath);

        if (bytes) {
          attachments.push({
            filename: `${cert.certificateId}.pdf`,
            content: bytes,
            contentType: 'application/pdf'
          });
        }
      }

      options.paperUrl = `${siteUrl()}/papers/${paperId}`;
    } else if (
      ![
        'revision',
        'rejected',
        'unpublished',
        'payment_submitted',
        'payment_received',
        'payment_rejected'
      ].includes(type)
    ) {
      return json(
        { error: 'Unsupported email type.' },
        400
      );
    }

    const sent = await deliver(
      current,
      type === 'submitted' ? 'claimed' : type,
      options,
      attachments
    );

    if (sent.ok && !sent.skipped && type === 'publication') {
      await updatePaper(
        paperId,
        (paper) => {
          paper.publicationEmailSentAt = new Date().toISOString();
        },
        'Record resent publication email'
      );
    }

    return json({
      ok: sent.ok,
      skipped: Boolean(sent.skipped),
      error: sent.error || null
    });
  }

  return json(
    { error: 'Unknown admin action.' },
    400
  );
}

async function apiHandler(request, context) {
  const url = new URL(request.url);

  const parts = url.pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));

  const method = request.method.toUpperCase();
  const route = parts[0] || '';

  if (method === 'GET' && route === 'health') {
    return json({
      ok: true,
      storageConfigured: isStoreConfigured(),
      emailEnabled: emailEnabled(),
      time: new Date().toISOString()
    });
  }

  if (method === 'GET' && route === 'config') {
    return json(publicConfig());
  }

  if (method === 'POST' && route === 'submit') {
    return handleSubmit(request, context);
  }

  if (method === 'POST' && route === 'track') {
    return handleTrack(await readJson(request));
  }

  if (method === 'POST' && route === 'claim') {
    return handleClaim(
      await readJson(request),
      { request, ...context }
    );
  }

  if (method === 'POST' && route === 'revision') {
    return handleRevision(request);
  }

  if (
    method === 'GET' &&
    route === 'pay' &&
    parts[1]
  ) {
    const paper = await getPaymentPaper(
      parts[1],
      url.searchParams.get('token')
    );

    if (!paper) {
      return json(
        { error: 'Payment link is invalid or expired.' },
        401
      );
    }

    const payment = getPaymentConfig();

    if (!payment.ready) {
      return json(
        {
          error:
            'Payment details are not configured. Contact the editorial office.'
        },
        503
      );
    }

    const uri = buildUpiUri({
      ...payment,
      reference: paper.id,
      note: `${payment.note} ${paper.id}`
    });

    return json({
      paperId: paper.id,
      title: paper.title,
      amount: payment.amount,
      vpa: payment.vpa,
      payeeName: payment.payeeName,
      uri,
      tokenValid: true
    });
  }

  if (method === 'POST' && route === 'payment') {
    return handlePaymentSubmit(await readJson(request));
  }

  if (method === 'GET' && route === 'papers') {
    const papers = await getCachedPublicPaper();

    return json(
      { papers },
      200,
      publicCacheHeaders
    );
  }

  if (
    method === 'GET' &&
    route === 'paper' &&
    parts[1]
  ) {
    const paper = await getCachedPublicPaper(parts[1]);

    if (!paper) {
      return json(
        { error: 'Published paper not found.' },
        404,
        publicCacheHeaders
      );
    }

    return json(
      { paper: publicPaper(paper) },
      200,
      publicCacheHeaders
    );
  }

  if (
    method === 'GET' &&
    route === 'download' &&
    parts[1]
  ) {
    const paper = getPaper(
      await readDatabase(),
      parts[1]
    );

    if (!paper || paper.status !== 'published') {
      return json(
        { error: 'Published paper not found.' },
        404
      );
    }

    const buffer = await readBinary(paper.currentFilePath);

    if (!buffer) {
      return json(
        { error: 'Paper PDF not found in the repository.' },
        404
      );
    }

    return fileResponse(buffer, `${paper.id}.pdf`);
  }

  if (
    method === 'GET' &&
    route === 'verify' &&
    parts[1]
  ) {
    const db = await readDatabase();

    for (const paper of db.papers) {
      const certificate = (paper.certificates || []).find(
        (cert) => cert.certificateId === parts[1]
      );

      if (certificate && paper.status === 'published') {
        return json({
          valid: true,
          certificateId: certificate.certificateId,
          authorName: certificate.authorName,
          paperId: paper.id,
          paperTitle: paper.title,
          publishedAt: paper.publishedAt,
          volume: paper.volume,
          issue: paper.issue,
          doi: paper.figshare?.doi || '',
          figshareUrl: paper.figshare?.recordUrl || '',
          downloadUrl:
            `/api/certificate/${encodeURIComponent(certificate.certificateId)}`
        });
      }
    }

    return json(
      {
        valid: false,
        error: 'No matching published certificate was found.'
      },
      404
    );
  }

  if (
    method === 'GET' &&
    route === 'certificate' &&
    parts[1]
  ) {
    const db = await readDatabase();

    for (const paper of db.papers) {
      const certificate = (paper.certificates || []).find(
        (cert) => cert.certificateId === parts[1]
      );

      if (
        certificate &&
        paper.status === 'published' &&
        certificate.filePath
      ) {
        const buffer = await readBinary(certificate.filePath);

        if (buffer) {
          return fileResponse(
            buffer,
            `${certificate.certificateId}.pdf`
          );
        }
      }
    }

    return json(
      { error: 'Certificate not found.' },
      404
    );
  }

  if (
    method === 'POST' &&
    route === 'admin' &&
    parts[1] === 'login'
  ) {
    if (!assertSameOrigin(request)) {
      return json(
        { error: 'Invalid request origin.' },
        403
      );
    }

    const rate = await consumeRateLimit(
      `admin-login:${requestIp(request, context)}`,
      8,
      15 * 60 * 1000
    );

    if (!rate.allowed) {
      return json(
        {
          error:
            'Too many login attempts. Try again later.'
        },
        429,
        { 'Retry-After': String(rate.retryAfter) }
      );
    }

    const body = await readJson(request);

    const emailOk = timingSafeEqualText(
      String(body.email || '').toLowerCase(),
      String(process.env.ADMIN_EMAIL || '').toLowerCase()
    );

    const passOk = timingSafeEqualText(
      String(body.password || ''),
      String(process.env.ADMIN_PASSWORD || '')
    );

    if (
      !process.env.ADMIN_SESSION_SECRET ||
      !process.env.ADMIN_PASSWORD ||
      !emailOk ||
      !passOk
    ) {
      return json(
        { error: 'Email or password is incorrect.' },
        401
      );
    }

    return json(
      { ok: true },
      200,
      {
        'Set-Cookie': setAdminCookie(
          createAdminCookie(process.env.ADMIN_SESSION_SECRET)
        )
      }
    );
  }

  if (
    method === 'POST' &&
    route === 'admin' &&
    parts[1] === 'logout'
  ) {
    return json(
      { ok: true },
      200,
      { 'Set-Cookie': clearAdminCookie() }
    );
  }

  if (route === 'admin') {
    const authError = requireAdmin(request);

    if (authError) return authError;

    if (
      method === 'GET' &&
      parts[1] === 'dashboard'
    ) {
      const db = await readDatabase();
      const counts = {};

      for (const paper of db.papers) {
        counts[paper.status] =
          (counts[paper.status] || 0) + 1;
      }

      return json({
        counts,
        papers: db.papers.sort(
          (a, b) =>
            new Date(b.submittedAt) - new Date(a.submittedAt)
        ),
        paymentConfig: getPaymentConfig(),
        storageConfigured: isStoreConfigured(),
        emailEnabled: emailEnabled()
      });
    }

    if (
      method === 'POST' &&
      parts[1] === 'action'
    ) {
      return adminAction(await readJson(request));
    }

    if (
      method === 'GET' &&
      parts[1] === 'file' &&
      parts[2]
    ) {
      const paper = getPaper(
        await readDatabase(),
        parts[2]
      );

      if (!paper) {
        return json(
          { error: 'Paper not found.' },
          404
        );
      }

      const filePath =
        paper.currentFilePath ||
        paper.versions?.at(-1)?.filePath;

      if (!filePath) {
        return json(
          {
            error:
              'No manuscript PDF is attached to this record.'
          },
          404
        );
      }

      const buffer = await readBinary(filePath);

      return buffer
        ? fileResponse(
            buffer,
            `${paper.id}-manuscript.pdf`,
            'application/pdf',
            'private, no-store'
          )
        : json(
            {
              error:
                'Manuscript file not found in GitHub.'
            },
            404
          );
    }

    if (
      method === 'GET' &&
      parts[1] === 'backup'
    ) {
      const db = await readDatabase();
      const content = Buffer.from(
        JSON.stringify(db, null, 2)
      );

      return new Response(content, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition':
            'attachment; filename="ijros-db-backup.json"',
          'Cache-Control': 'no-store'
        }
      });
    }
  }

  return json(
    { error: 'API route not found.' },
    404
  );
}

export default async (request, context) => {
  try {
    if (
      !isStoreConfigured() &&
      new URL(request.url).pathname !== '/api/health'
    ) {
      return json(
        {
          error:
            'GitHub storage is not configured. Add the GH_* environment variables in Netlify.'
        },
        503
      );
    }

    if (
      request.method !== 'GET' &&
      !assertSameOrigin(request)
    ) {
      return json(
        { error: 'Invalid request origin.' },
        403
      );
    }

    return await apiHandler(request, context);
  } catch (error) {
    console.error('[journal-api]', error);

    return json(
      {
        error:
          error.message || 'Unexpected server error.'
      },
      500
    );
  }
};
