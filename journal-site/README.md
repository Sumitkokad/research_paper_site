# ijros Journal Platform — React + Netlify

A React 18 + Vite publishing website for the **International Journal of Research and Open Science (ijros)**. The interface is built with React Router; server-only workflows run as Netlify Functions. Paper records and PDF files are stored in the private GitHub repository configured by the journal.

This project is a journal workflow platform, not a DOI registration agency, indexing service, payment gateway, peer-review service or legal compliance certification. Publish only verified journal details and operate the editorial workflow in accordance with your actual policies.

## Features

### Author submissions
- Manuscript submission as PDF, with a server-side `%PDF-` signature check and a 4 MB default size limit (kept below Netlify Functions’ effective binary request limit).
- Up to five authors, each with name, affiliation and optional ORCID.
- Paper reference, private email tracking access, honeypot and per-IP submission throttling.
- Private tracking page for submitted, under-review, revision-requested, revision-submitted, accepted, payment-submitted, publishing and published states.
- A secure recovery request if the author loses their tracking token.
- Revision uploads are stored as a new version under the same paper reference.

### Manual UPI payment
- No Razorpay or other paid gateway is used. The journal configures one UPI VPA and bank-verified beneficiary name.
- After acceptance, the platform issues a time-limited payment link and creates a QR payload for the fixed journal account, configured amount and paper-specific transaction reference.
- The author enters the 12-digit UTR. An editor checks the UTR against the actual credit/statement before confirming it.
- A payment receipt PDF is generated after confirmation.
- A payment reference is **not** proof of receipt; the app deliberately does not auto-confirm transfers.

**Important UPI name rule:** the name shown by a UPI application is determined by the payment system/bank verification and may differ from the payee label embedded in a QR. Do not put a misleading journal name in `UPI_PAYEE_NAME`. For a professional journal-branded checkout, use a bank/current account or merchant VPA registered to the journal's legitimate name. The website can show your journal branding, but it cannot force the UPI app to hide the verified beneficiary identity.

### Publication and certificates
- Clicking **Confirm & publish** after manual payment verification starts idempotent publication.
- One certificate PDF is generated per listed author (up to five), each with a unique certificate ID and a QR code linking to `/verify/<certificateId>`.
- Certificate PDFs include the journal name, author name, manuscript title, paper reference, certificate reference, publication date and optional archive details, logo and editor signature.
- Long unbroken words are wrapped; long article titles are fitted to the certificate layout. Names are embedded using Noto Serif when available; script coverage depends on the glyphs contained in that font. Use a font with coverage for every script used by your authors and test a sample certificate before launch.
- A public verification page confirms the certificate against the private GitHub-backed publication record.
- Publication email includes all generated individual certificates. A separate PDF payment receipt is attached to the payment-confirmation email.
- If a PDF or email step fails, the paper record keeps the failure details; the editor can retry publication or resend the last failed email from the admin dashboard.

A certificate verifies that this platform contains a published record for the named author and paper. It is not independent accreditation of the research or an assurance of indexing.

### Public reader site
- Home page, published paper archive, article detail pages, blogs, about/editorial board, author guidelines, fees, contact, editorial policies, terms and privacy notice.
- Archive search, subject/year filters, newest/oldest sort, result count and pagination.
- Article landing page with abstract, authors/affiliations, PDF download, copy citation, BibTeX, RIS and share link.
- Google Scholar citation metadata and `ScholarlyArticle` JSON-LD for published article routes. Search engines independently decide whether and when to crawl or index pages.
- Automatic archive assignment by publication year/month. Editors can change volume/issue in the admin metadata panel.
- Sitemap and robots.txt endpoints.

### Editorial admin
- Signed HMAC admin session in an HTTP-only, SameSite cookie with a 12-hour expiry.
- Dashboard counts, search and status filters, manuscript download, paper history and email log.
- Mark under review, accept, request revision, reject, confirm/reject UPI reference, retry publication, edit article metadata and unpublish with a required reason.
- Set DOI, ISSN, volume and issue only when verified by the journal.
- Export a private `db.json` backup and retry the latest failed mail.

## Technology

- React 18, Vite 5, React Router 6 and plain JavaScript.
- Netlify Functions (Node 20 runtime) for private API actions.
- GitHub Contents API for the private `db.json` and `submissions/`, `certificates/` and `receipts/` PDFs.
- `pdf-lib`, `@pdf-lib/fontkit` and `qrcode` for certificates, receipts and QR codes.
- Nodemailer for SMTP email.
- No Supabase, external database, paid payment gateway or separate backend service.

## 1. Prerequisites

- Node.js 20 or later and npm.
- A GitHub repository with a default branch (for this setup: `Sumitkokad/research_papers`). Keep it **private** because it stores manuscript files, author contact information and payment references.
- A fine-grained GitHub personal access token restricted to that one repository, with **Contents: Read and write**. Do not use a broad classic token unless absolutely necessary.
- A Netlify account and a site/domain you control.
- An SMTP account and a verified sender alias on the journal's domain.
- A real UPI VPA and the corresponding beneficiary name verified in the bank/UPI app.

## 2. Install and run locally

```bash
npm install
cp .env.example .env
npm run fonts:setup
```

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and fill the server settings described below. Then run the frontend and Netlify Functions together using the Netlify CLI:

```bash
npx netlify-cli dev
```

The Netlify CLI downloads separately when invoked with `npx`; the project intentionally does not add the CLI as a production dependency. `npm run dev` starts only the Vite frontend and does not emulate the `/api/*` Netlify Functions.

To create a production frontend build:

```bash
npm run build
```

The output is written to `dist/`.

## 3. Environment variables

Set these in a local `.env` for Netlify CLI or in **Netlify → Site configuration → Environment variables** for deployment. Never expose server secrets through a `VITE_` variable.

### GitHub storage

| Variable | Purpose |
| --- | --- |
| `GH_OWNER` | `Sumitkokad` |
| `GH_REPO` | `research_papers` |
| `GH_BRANCH` | Existing default branch, normally `main` |
| `GH_TOKEN` | Fine-grained token restricted to this repository with Contents read/write |

The app creates `db.json` on the first write if it does not exist. A repository needs an initialized branch; create an initial README or other commit before connecting it. PDF paths are created as required:

```text
 db.json
 submissions/<paper-id>/v1.pdf
 submissions/<paper-id>/v2.pdf
 certificates/<certificate-id>.pdf
 receipts/<receipt-id>.pdf
```

### Admin login and session signing

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Admin login email (not shown publicly) |
| `ADMIN_PASSWORD` | Long, unique admin password |
| `ADMIN_SESSION_SECRET` | Random secret used to sign the 12-hour cookie |

Generate a strong secret using Node:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Use a unique password; do not reuse an email password. Rotate both the admin password and signing secret if an administrator leaves or access may have been exposed. Rotating the session secret immediately invalidates existing admin sessions.

### Public journal identity

| Variable | Purpose |
| --- | --- |
| `JOURNAL_NAME` | Full journal name shown on the site, emails and certificates |
| `JOURNAL_SHORT_NAME` | Short journal brand, default `ijros` |
| `JOURNAL_SITE_URL` | Canonical HTTPS site URL, e.g. `https://journal.example.org` |
| `JOURNAL_CONTACT_EMAIL` | Public contact address |
| `JOURNAL_ISSN` | Leave blank until the journal's ISSN is verified |
| `JOURNAL_LAUNCH_YEAR` | First volume year used for automatic volume assignment |
| `EDITOR_NAME` / `EDITOR_TITLE` | Actual authorized signatory name and role; do not invent a signature |
| `JOURNAL_LOGO_PATH` | Optional image path, default `public/brand/logo.png` |
| `EDITOR_SIGNATURE_PATH` | Optional signature image path, default `public/brand/editor-signature.png` |

Vite-only public variables in `.env.example` (`VITE_SITE_URL`, `VITE_CONTACT_EMAIL`, `VITE_ISSN`) are used by the client. They are not secrets. Keep them consistent with the server-side values.

### SMTP sender identity (important for hiding your personal login address)

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | Usually 465 for implicit TLS or 587 for STARTTLS |
| `SMTP_SECURE` | `true` for TLS on port 465; `false` for STARTTLS on 587 |
| `SMTP_USER` | SMTP authentication account; may be your existing Gmail login |
| `SMTP_PASSWORD` | SMTP app password / provider SMTP credential |
| `MAIL_FROM_NAME` | Display label, e.g. `ijros Editorial Office` |
| `MAIL_FROM_ADDRESS` | **Required verified journal-domain sender address or alias** |
| `EDITORIAL_INBOX` | Monitored journal mailbox used for replies and admin notices |

The project intentionally refuses to send an email when `MAIL_FROM_ADDRESS` is missing, rather than silently using `SMTP_USER` and exposing the personal Gmail login as the sender. A display name alone does not hide an email address. Configure a custom-domain mailbox (best option), or verify a custom-domain send-as alias with your SMTP provider and use that address in `MAIL_FROM_ADDRESS`. Some providers may rewrite sender details or add an authenticated-account header; test message headers with a second email account before launch. If your Gmail SMTP setup cannot send from the verified alias, use a domain mailbox/provider instead. Do not assume `sumitkokad@gmail.com` will be hidden merely because the display label says “ijros Editorial Office”.

### UPI payment settings

| Variable | Purpose |
| --- | --- |
| `UPI_VPA` | Real UPI ID receiving the funds |
| `UPI_PAYEE_NAME` | Exact beneficiary name the bank/UPI account verifies |
| `PUBLICATION_FEE_INR` | Positive amount in INR |
| `UPI_NOTE` | Short payment note included in QR payload |

Keep the same VPA for the journal, while the payment QR includes the configured amount and a reference based on the paper ID. Never enter an arbitrary journal name to disguise an individual's bank account. Before accepting live payments, scan and test the QR with a small amount, check the exact beneficiary and refund the test transfer if appropriate. The journal admin must check the actual credit/statement before pressing **Confirm & publish**.

### Other settings

- `MAX_PDF_MB`: effective max is capped at 4 MB to stay below Netlify Functions’ approximately 4.5 MB effective binary request limit.
- `PAY_TOKEN_TTL_HOURS`: payment-link lifetime (default 168 hours / 7 days; max 336).
- `TRACK_TOKEN_TTL_DAYS`: author tracking token lifetime (default 365 days; max 730).
- `SITE_REVALIDATE_SECONDS`: published metadata cache revalidation (default 300 seconds, bounded to 30–3600 seconds).

## 4. Deploy to Netlify free tier

1. Push this project to a GitHub repository (it can be separate from `research_papers`).
2. In Netlify, import the website repository and select the production branch.
3. Netlify reads `netlify.toml`; the build command is `npm run build`, publish directory is `dist`, and functions directory is `netlify/functions`.
4. Set Node.js to 20 (already configured in `netlify.toml`).
5. Add every required server environment variable from `.env.example` in Netlify. Add `VITE_*` values before building because Vite embeds them in the browser bundle.
6. Ensure `JOURNAL_SITE_URL` is the final HTTPS custom domain and the DNS/HTTPS setup is complete.
7. Trigger a fresh deploy after environment variables change. Function secrets are read server-side; do not place them in frontend code.
8. Test `/api/health`, admin login, email delivery, submission, UPI QR, UTR review, certificate generation and public verification before opening submissions.

The website uses Netlify Functions and a GitHub repository, avoiding a separate paid database/backend. Netlify free-tier quotas, GitHub API limits, SMTP restrictions and repository size still apply. This single-JSON storage model is intended for a small journal workflow. It is not a high-concurrency relational database; monitor repository growth and API errors as usage grows.

## 5. Fonts, logo and signature

### Unicode certificate font

Run:

```bash
npm run fonts:setup
```

This downloads Noto Serif font files to `public/fonts/`. Commit the downloaded files so they are included in the Netlify Function bundle. The project does not strip non-Latin characters. If a non-Latin name is used without an embedded font, certificate generation deliberately fails and the admin dashboard shows a retryable publication error. The included Noto Serif files cover selected scripts, not every Unicode writing system; validate all scripts used by your authors and configure appropriate fonts before publishing.

### Logo and editor signature

Place approved PNG or JPG assets at:

```text
public/brand/logo.png
public/brand/editor-signature.png
```

The logo and signature are optional. Use only a logo and signature that the journal is authorized to display. Their paths can be changed with `JOURNAL_LOGO_PATH` and `EDITOR_SIGNATURE_PATH`.

## 6. DOI, ISSN and indexing — do not fabricate identifiers

- The project generates an internal paper reference (`ijros-...`) and certificate ID. Neither is a DOI.
- A DOI field is blank until an editor enters a genuine DOI that has been registered through an authorized registration agency. For Crossref DOI assignment, the journal must obtain the relevant membership/prefix and register the DOI metadata. This project does **not** mint or register DOIs.
- Keep `JOURNAL_ISSN` blank until an authentic ISSN has been assigned and verified. The example certificate image is a visual reference, not independent proof that a number is currently valid or belongs to the journal.
- Google Scholar citation meta tags and ScholarlyArticle JSON-LD improve machine-readable metadata, but do not guarantee indexing. Do not add indexing logos, third-party badges, editorial-board names, review claims or accreditation claims unless they are real and documented.

## 7. Data model and privacy

The GitHub `db.json` stores a schema version, paper records, timeline history, hashed tracking/payment tokens, mail logs and rate-limit counters. Manuscript PDFs, certificates and receipts are separate binary files in the same repository. Public endpoints return only published article metadata; private submitter email, UTR, token hashes, editorial comments and admin data are not included in public paper records.

Keep the research repository private and grant the token access only to this repository. Do not commit `.env`, tokens, SMTP passwords, author exports or UTR data into the website source repository. Protect admin access and limit repository collaborators. Download and store admin backups securely; `db.json` backups contain personal and payment-reference information.

The `/privacy` page is a plain-language starter notice describing the platform's data use and a deletion/correction request process. It is not legal advice or a declaration of compliance with the DPDP Act. Before launch, review the actual purpose, lawful basis, retention periods, consent, grievance/contact arrangements, processor terms and deletion obligations with a qualified adviser.

## 8. Backup and key rotation

- Use **Admin → Export db.json** regularly and keep backups encrypted and access-controlled.
- The GitHub repository history provides an additional recovery trail, but it is not a substitute for an independent backup of important records and PDFs.
- Rotate the GitHub fine-grained token in GitHub and update `GH_TOKEN` in Netlify. Revoke the old token after the new deployment has been verified.
- Rotate `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` together after suspected exposure; changing the session secret signs out existing sessions.
- Rotate SMTP app passwords in the provider and update `SMTP_PASSWORD`.
- Never place a secret in a `VITE_` variable or in a public config file.

## 9. Migration from a previous JSON database

The included script normalizes a local legacy JSON export into the current `db.json` shape and writes a preview to `migration-output/db.json`:

```bash
npm run migrate:json -- ./legacy-db.json
```

After reviewing the generated file, set `GH_OWNER`, `GH_REPO`, `GH_BRANCH` and `GH_TOKEN` in `.env` (or the shell) and apply it:

```bash
npm run migrate:json -- ./legacy-db.json --apply
```

The script refuses to overwrite an existing non-empty GitHub `db.json` unless you explicitly add `--replace`. Before using `--replace`, export a backup and confirm that replacing all current records is what you intend:

```bash
npm run migrate:json -- ./legacy-db.json --apply --replace
```

**Important:** the script migrates JSON metadata only. It preserves old PDF file paths in the record but does not move/upload old PDF binaries. Copy each legacy PDF into the expected path in `research_papers` and verify that it exists before applying the new database. Old author tokens are not migrated as usable plaintext tokens; use the author claim flow to issue new tokens.

## 10. Tests and quality checks

```bash
npm test
npm run build
```

Tests cover UTR validation, signed token integrity/expiry, admin cookie integrity, UPI payload fields, certificate allocation idempotency, PDF certificate output, payment receipt output and email text escaping. Run the full test and build commands after installing dependencies; serverless integration also requires configured GitHub, SMTP and UPI test settings.

## 11. Launch checklist

- [ ] Confirm the journal's legal/operating identity, scope, peer-review process, editorial roles and publication ethics policy.
- [ ] Add only verified editor/board names and affiliations to `src/config.js` (`journal.editorialBoard`).
- [ ] Confirm actual ISSN status; leave ISSN blank if not assigned/verified.
- [ ] Decide whether the journal has Crossref membership / DOI registration access; leave DOI blank otherwise.
- [ ] Publish accurate fee, refund, withdrawal, corrections, complaint, privacy and retention rules.
- [ ] Configure a working domain mailbox/verified alias and test the full email headers; confirm the personal Gmail login is not exposed.
- [ ] Configure the correct UPI VPA and verified beneficiary name; scan and test the generated QR.
- [ ] Upload approved logo/signature and install Noto Serif fonts.
- [ ] Confirm the GitHub repository is private and the fine-grained token is limited to it.
- [ ] Change admin credentials and generate a long random session secret.
- [ ] Submit a test manuscript with multiple authors; test revision, acceptance, QR, UTR rejection/confirmation, receipts, certificates and QR verification.
- [ ] Test failed-email logging and resend from admin.
- [ ] Export a backup and verify it can be read.
- [ ] Remove placeholder domain/contact details and verify every public page before announcing submissions.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Journal landing page |
| `/papers` | Published paper archive |
| `/papers/:id` | Article detail / citation page |
| `/submit` | Manuscript submission |
| `/track` | Private author status and revision upload |
| `/pay/:id?token=...` | Private UPI payment page |
| `/verify/:id` | Public certificate verification |
| `/admin` | Editorial dashboard |
| `/about`, `/guidelines`, `/fees`, `/contact` | Journal / author information |
| `/policies`, `/terms`, `/privacy` | Policy pages |
| `/blogs`, `/blogs/:slug` | Blog resources |
| `/sitemap.xml`, `/robots.txt` | Search crawler endpoints |

## License and responsibility

Review all third-party package licenses before commercial or institutional deployment. You are responsible for journal operations, payment-account ownership, author consent, publication ethics, legal notices, sender verification and the accuracy of every public identifier and claim.
