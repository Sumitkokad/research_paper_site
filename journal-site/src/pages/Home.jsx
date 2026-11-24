import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FileCheck2, Globe2, Search, ShieldCheck, Download, FileText } from 'lucide-react';
import { api } from '../api';
import { journal } from '../config';
import Meta from '../components/Meta';
import { Loading, EmptyState } from '../components/Layout';

export default function Home() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api('/papers')
      .then((data) => { if (alive) setPapers(Array.isArray(data?.papers) ? data.papers : []); })
      .catch(() => { if (alive) setPapers([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const featured = papers.slice(0, 3);

  function handleSearch(e) {
    e.preventDefault();
    const query = e.target.elements.search.value;
    navigate(`/papers?q=${encodeURIComponent(query)}`);
  }

  return (
    <>
      <Meta title="Find and read open research" description={journal.description} />

      {/* 1. Hero: Search First */}
      <section className="hero-search">
        <div className="container">
          <h1>Find and read open research</h1>
          <p>Explore peer-reviewed articles, DOI records, and author certificates.</p>
          
          <form className="search-box" onSubmit={handleSearch}>
            <input name="search" type="text" placeholder="Search title, author, keyword, or DOI" required />
            <button type="submit" className="button button-primary">
              <Search size={18} /> Search
            </button>
          </form>
          
          <div className="search-tags">
            <span className="tag">Computer science</span>
            <span className="tag">Engineering</span>
            <span className="tag">Management</span>
            <span className="tag">Applied Sciences</span>
          </div>
        </div>
      </section>

      {/* 2. Trust Bar */}
      <div className="trust-bar">
        <div className="container trust-grid">
          <div className="trust-item"><strong>ISSN:</strong> {journal.issn || 'Verifying'}</div>
          <div className="trust-item"><strong>DOI:</strong> Registered upon publication</div>
          <div className="trust-item"><strong>Certificates:</strong> QR-Verifiable</div>
        </div>
      </div>

      {/* 3. Recent Articles */}
      <section className="section section-surface">
        <div className="container">
          <div className="section-heading" style={{ textAlign: 'center' }}>
            <span className="eyebrow">Latest Publications</span>
            <h2>Recent articles from the archive</h2>
            <p style={{ margin: '0 auto' }}>Each record includes a full-text PDF, citation metadata, and a persistent DOI.</p>
          </div>

          {loading ? (
            <Loading label="Loading published papers" />
          ) : featured.length ? (
            <div className="paper-list-home">
              {featured.map((paper) => (
                <article className="paper-item-home" key={paper.id}>
                  <h3>
                    <Link to={`/papers/${paper.id}`}>{paper.title}</Link>
                  </h3>
                  <div className="paper-meta-home">
                    <span>{Array.isArray(paper.authors) ? paper.authors.map(a => a.name).join(', ') : 'Unknown Author'}</span>
                    <span>{paper.volume} {paper.issue}</span>
                    {paper.doi ? (
                      <span>
                        DOI <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>{paper.doi}</a>
                      </span>
                    ) : (
                      <span>DOI pending</span>
                    )}
                  </div>
                </article>
              ))}
              <div style={{ marginTop: '32px', textAlign: 'center' }}>
                <Link to="/papers" className="button button-light">
                  View all articles <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState 
              title="The archive is being prepared" 
              description="Published research will appear here after editorial approval and publication." 
              action={<Link className="button button-primary" to="/submit">Submit a manuscript</Link>} 
            />
          )}
        </div>
      </section>

      {/* 4. Manuscript Template Section */}
      <section className="section template-section">
        <div className="container template-layout">
          
          <div className="template-copy">
            {/* The requested Circular Logo & Heading */}
            <div className="template-icon-circle">
              <FileText size={32} />
            </div>
            <span className="eyebrow">For Authors</span>
            <h2>Article Template</h2>
            <p>
              To ensure a smooth editorial process, all submissions must follow the official {journal.shortName.toUpperCase()} manuscript template. 
              The template includes the correct margins, font sizes, heading structures, and reference formats.
            </p>
            <ul className="check-list" style={{ marginBottom: '32px' }}>
              <li>Standard A4 format with 2.5cm margins.</li>
              <li>Times New Roman, 11.5pt font size.</li>
              <li>Properly structured Abstract and Keywords.</li>
              <li>Pre-formatted reference styling.</li>
            </ul>
            <div className="template-actions">
              {/* The Link for the Demo Article Template */}
              <a href="/IJROS-Template.docx" download className="button button-primary">
                <Download size={18} /> Download Word Template
              </a>
              <Link to="/guidelines" className="button button-light">
                Read Author Guidelines
              </Link>
            </div>
          </div>

          {/* Mock Paper Preview */}
          <div className="template-preview-wrapper">
            <div className="mock-paper">
              <div className="mock-header">
                <strong>{journal.shortName.toUpperCase()}</strong>
                <small>Open Access</small>
              </div>
              <h1>Sample Title of Your Research Paper</h1>
              <p className="mock-authors">First Author¹, Second Author²</p>
              <div className="mock-abstract">
                <strong>Abstract</strong>
                <p>The demand for safety and sustainable transportation brings innovation in vehicle technology. Bicycling is one of the oldest and fittest ways of transportation...</p>
              </div>
              <div className="mock-body">
                <strong>1. Introduction</strong>
                <p>The fundamental objective of multicultural education is to help students consider their diversity of ethnicity...</p>
                <strong>2. Literature Review</strong>
                <p>The existing studies in school choice document that parents take into account numerous factors...</p>
              </div>
            </div>
            <div className="mock-badge">
              <FileText size={16} /> Official Template
            </div>
          </div>

        </div>
      </section>

      {/* 5. Process */}
      <section className="section section-surface">
        <div className="container">
          <div className="section-heading" style={{ textAlign: 'center' }}>
            <span className="eyebrow">Editorial Workflow</span>
            <h2>A transparent path to publication</h2>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-icon"><FileCheck2 /></div>
              <h3>01. Submit</h3>
              <p>Upload your manuscript and metadata. Receive a private tracking token instantly.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><ShieldCheck /></div>
              <h3>02. Review</h3>
              <p>Track editorial screening, revisions, and the final decision via your private dashboard.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><Globe2 /></div>
              <h3>03. Publish</h3>
              <p>Upon acceptance, receive a DOI, a payment receipt, and QR-verifiable author certificates.</p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}