import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, ArrowUpRight, Mail } from 'lucide-react';
import { journal } from '../config';

const links = [
  ['Papers', '/papers'],
  ['Articles', '/articles'],
  ['Editorial board', '/editorial-board'],
  ['About', '/about'],
  ['Guidelines', '/guidelines'],
  ['Fees', '/fees'],
  ['Blogs', '/blogs'],
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="utility-bar">
        <div className="container">
          <div className="utility-left">
            <span>{journal.issn || 'ISSN verifying'}</span>
            <span className="dot" aria-hidden="true" />
            <span>Peer-reviewed · Open Access · {journal.doiProvider} DOI</span>
          </div>
          <div className="utility-right">
            <a href={`mailto:${journal.contactEmail}`}>
              <Mail size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {journal.contactEmail}
            </a>
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="container nav-wrap">
          <Link
            to="/"
            className="brand"
            onClick={() => setOpen(false)}
            aria-label={`${journal.shortName} home`}
          >
            <span className="brand-mark">IJ</span>
            <span className="brand-text">
              <strong>{journal.shortName}</strong>
              <small>International Journal</small>
            </span>
          </Link>

          <button
            className="mobile-menu"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>

          <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
            {links.map(([label, to]) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {label}
              </NavLink>
            ))}
            <NavLink to="/track" onClick={() => setOpen(false)}>Track</NavLink>
            <Link className="nav-submit" to="/submit" onClick={() => setOpen(false)}>
              Submit <ArrowUpRight size={14} />
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <h3>{journal.name}</h3>
          <p>{journal.description}</p>
          {journal.issn && <p className="footer-issn">{journal.issn}</p>}
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/papers">Published papers</Link>
          <Link to="/articles">Call for articles</Link>
          <Link to="/editorial-board">Editorial board</Link>
          <Link to="/blogs">Research blog</Link>
        </div>
        <div>
          <h4>For authors</h4>
          <Link to="/submit">Submit manuscript</Link>
          <Link to="/track">Track submission</Link>
          <Link to="/guidelines">Author guidelines</Link>
          <Link to="/fees">Publication fees</Link>
        </div>
        <div>
          <h4>Policies</h4>
          <Link to="/about">About the journal</Link>
          <Link to="/policies">Editorial policies</Link>
          <Link to="/privacy">Privacy notice</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} {journal.shortName}. All rights reserved.</span>
        <span>Peer-reviewed · Open Access · {journal.doiProvider} DOI · QR-verified certificates</span>
      </div>
    </footer>
  );
}

export function Shell({ children }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}

export function PageIntro({ eyebrow, title, description, children }) {
  return (
    <section className="page-intro">
      <div className="container">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
    </section>
  );
}

export function Notice({ type = 'info', children }) {
  return <div className={`notice notice-${type}`} role="status">{children}</div>;
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="loading-state">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">∅</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}