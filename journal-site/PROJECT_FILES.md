# Project file manifest

## Root
- `.env.example`
- `.gitignore`
- `CHANGELOG.md`
- `README.md`
- `index.html`
- `netlify.toml`
- `package.json`
- `vite.config.js`

## Netlify Functions
- `netlify/functions/api.mjs`
- `netlify/functions/paper-page.mjs`
- `netlify/functions/robots.mjs`
- `netlify/functions/sitemap.mjs`
- `netlify/functions/lib/certificates.mjs`
- `netlify/functions/lib/core.mjs`
- `netlify/functions/lib/email.mjs`
- `netlify/functions/lib/payments.mjs`
- `netlify/functions/lib/security.mjs`
- `netlify/functions/lib/store.mjs`

## React application
- `src/App.jsx`
- `src/api.js`
- `src/config.js`
- `src/main.jsx`
- `src/styles.css`
- `src/components/Layout.jsx`
- `src/components/Meta.jsx`
- `src/pages/Admin.jsx`
- `src/pages/Blogs.jsx`
- `src/pages/Home.jsx`
- `src/pages/InfoPages.jsx`
- `src/pages/PaperDetail.jsx`
- `src/pages/Papers.jsx`
- `src/pages/Pay.jsx`
- `src/pages/Submit.jsx`
- `src/pages/Track.jsx`
- `src/pages/Verify.jsx`

## Public assets
- `public/_headers`
- `public/favicon.svg`
- `public/brand/.gitkeep`
- `public/fonts/.gitkeep`

## Scripts
- `scripts/download-fonts.mjs`
- `scripts/migrate-json.mjs`

## Tests
- `test/core.test.mjs`
- `test/email.test.mjs`
- `test/payments.test.mjs`
- `test/security.test.mjs`

## Upload fix integrated

The full project archive includes the upload/submit fixes in `src/pages/Submit.jsx`, `src/api.js`, and `netlify/functions/api.mjs`, plus updated `.env.example` and `README.md`.
