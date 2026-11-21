# Changelog

## 1.0.0 — Initial React journal platform

- Built a responsive React + Vite journal website with Netlify Functions; no separate paid backend or database is required.
- Added GitHub repository storage for paper metadata, manuscript versions, generated certificates and payment receipts.
- Added paper submission, author tracking, revision requests, payment-link expiry, UPI QR generation and manual UTR review.
- Added admin authentication with signed 12-hour HttpOnly cookies, rate limits, PDF validation, SHA-conflict retry handling and publication/email idempotency protections.
- Added per-author publication certificates with verification QR codes, public verification pages and PDF receipts.
- Added paper archive filters, citation exports, share/copy controls, Google Scholar metadata, sitemap, robots rules, blogs and policy/information pages.
- Added setup documentation, environment template, migration helper and focused tests.

## Deployment notes

- Real journal email sender, UPI beneficiary details, domain, branding assets, ISSN and DOI values must be configured and verified by the journal operator.
- DOI registration, peer review, indexing, payment settlement and legal compliance are not automated or represented as completed by this software.
