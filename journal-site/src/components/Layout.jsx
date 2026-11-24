import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { journal } from '../config';

const links = [
  ['Papers', '/papers'], 
  ['About', '/about'], 
  ['Author guidelines', '/guidelines'], 
  ['Fees', '/fees'], 
  ['Blogs', '/blogs']
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Link to="/" className="brand" onClick={() => setOpen(false)} aria-label={`${journal.shortName} home`}>
          <span className="brand-text">
            <strong>{journal.shortName.toUpperCase()}</strong>
            <small>International Journal</small>
          </span>
        </Link>
        
        <button className="mobile-menu" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}>
          {open ? <X size={24}/> : <Menu size={24}/>}
        </button>
        
        <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map(([label, to]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>
              {label}
            </NavLink>
          ))}
          <NavLink to="/track" onClick={() => setOpen(false)}>Track paper</NavLink>
          <Link className="nav-submit" to="/submit" onClick={() => setOpen(false)}>
            Submit paper <ArrowUpRight size={15}/>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <h3>{journal.name}</h3>
          <p>{journal.description}</p>
          {journal.issn && <p style={{ marginTop: '12px', color: '#ccfbf1', fontWeight: '600' }}>ISSN: {journal.issn}</p>}
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/papers">Published papers</Link>
          <Link to="/about">About the journal</Link>
          <Link to="/blogs">Research blog</Link>
        </div>
        <div>
          <h4>For Authors</h4>
          <Link to="/submit">Submit manuscript</Link>
          <Link to="/track">Track submission</Link>
          <Link to="/guidelines">Author guidelines</Link>
          <Link to="/fees">Publication fees</Link>
        </div>
        <div>
          <h4>Policies</h4>
          <Link to="/policies">Editorial policies</Link>
          <Link to="/terms">Terms of use</Link>
          <Link to="/privacy">Privacy notice</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} {journal.shortName.toUpperCase()}. All rights reserved.</span>
        <span>Open Access · DOI Registered · QR-Verified Certificates</span>
      </div>
    </footer>
  );
}

export function Shell({ children }) {
  return <><Header /><main>{children}</main><Footer /></>;
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
  return <div className="loading-state"><span className="spinner" aria-hidden="true"/><span>{label}…</span></div>;
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