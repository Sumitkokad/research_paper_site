import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Globe2,
  Lock,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
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
      .then((data) => {
        if (alive) setPapers(Array.isArray(data?.papers) ? data.papers : []);
      })
      .catch(() => {
        if (alive) setPapers([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const featured = useMemo(() => papers.slice(0, 3), [papers]);
  const currentIssue = useMemo(() => {
    const first = papers[0];
    if (!first) return null;
    return {
      volume: first.volume || 'Volume 1',
      issue: first.issue || 'Issue 1',
      publishedAt: first.publishedAt,
      papers: papers.slice(0, 4),
    };
  }, [papers]);

  function handleSearch(e) {
    e.preventDefault();
    const query = e.target.elements.search.value;
    navigate(`/papers?q=${encodeURIComponent(query)}`);
  }

  return (
    <>
      <Meta
        title="Peer-reviewed open research"
        description={`${journal.name} — ${journal.description}`}
      />

      {/* 1. Journal identity hero */}
      <section className="hero-journal">
        <div className="container hero-inner">
          <div>
            <div className="journal-kicker">
              <BookOpen size={14} /> {journal.shortName} · {journal.tagline}
            </div>
            <h1>
              Rigorous research,
              <br />
              <em>openly shared.</em>
            </h1>
            <p className="hero-lead">
              {journal.name} publishes peer-reviewed, DOI-registered scholarship
              across science, technology and engineering. Every article is
              open access, permanently archived, and accompanied by
              QR-verifiable author certificates.
            </p>
            <div className="hero-actions">
              <Link to="/submit" className="button button-primary">
                Submit a manuscript <ArrowRight size={16} />
              </Link>
              <Link to="/papers" className="button button-light">
                Browse the archive
              </Link>
            </div>
          </div>

          <aside className="journal-card" aria-label="Journal facts">
            <div className="jc-label">Journal identity</div>
            <h2>Publication facts</h2>
            <dl>
              <dt>ISSN</dt>
              <dd><span className="jc-issn">{journal.issn || 'Verifying'}</span></dd>
              <dt>Model</dt>
              <dd>Peer-reviewed · Open Access</dd>
              <dt>Identifiers</dt>
              <dd>DOI registered upon publication</dd>
              <dt>Decision target</dt>
              <dd>{journal.decisionTarget}</dd>
              <dt>Certificates</dt>
              <dd>QR-verifiable, one per author</dd>
            </dl>
          </aside>
        </div>
      </section>

      {/* 2. Trust bar */}
      <div className="trust-bar">
        <div className="container trust-grid">
          <div className="trust-item"><ShieldCheck size={16} /> Double-blind peer review</div>
          <div className="trust-item"><Globe2 size={16} /> Open access · CC BY 4.0</div>
          <div className="trust-item"><FileText size={16} /> Figshare DOI on publication</div>
          <div className="trust-item"><Lock size={16} /> Private author tracking</div>
        </div>
      </div>

      {/* 3. Current issue */}
      <section className="section section-surface">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Current issue</span>
            <h2>Latest volume</h2>
            <p>
              Each issue is a permanent, citable record. All articles carry a
              DOI and a stable landing page.
            </p>
          </div>

          {loading ? (
            <Loading label="Loading current issue" />
          ) : currentIssue ? (
            <div className="current-issue">
              <div className="current-issue-cover">
                <div className="cover-main">
                  <div className="issue-label">Current issue</div>
                  <h3>{currentIssue.volume}</h3>
                  <div className="issue-date">
                    {currentIssue.issue}
                    {currentIssue.publishedAt && (
                      <>
                        {' · '}
                        {new Date(currentIssue.publishedAt).toLocaleDateString('en-IN', {
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </>
                    )}
                  </div>
                </div>
                <Link to="/papers" className="button button-outline-light button-small">
                  All issues <ArrowRight size={14} />
                </Link>
              </div>
              <div className="current-issue-body">
                <h4>In this issue</h4>
                <ul className="issue-article-list">
                  {currentIssue.papers.map((paper) => (
                    <li key={paper.id}>
                      <Link to={`/papers/${paper.id}`}>{paper.title}</Link>
                      <small>
                        {(paper.authors || []).map((a) => a.name).join(', ')}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <EmptyState
              title="The first issue is being prepared"
              description="Published articles will appear here once the editorial process is complete."
              action={
                <Link to="/submit" className="button button-primary">
                  Submit a manuscript
                </Link>
              }
            />
          )}
        </div>
      </section>

      {/* 4. Recent articles */}
      <section className="section section-cream">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Recently published</span>
            <h2>From the archive</h2>
            <p>
              A selection of recent articles. Visit the full archive to browse
              by subject, year, volume and issue.
            </p>
          </div>

          {loading ? (
            <Loading label="Loading published papers" />
          ) : featured.length ? (
            <div className="paper-list-home" style={{ margin: 0 }}>
              {featured.map((paper) => (
                <article className="paper-item-home" key={paper.id}>
                  <h3>
                    <Link to={`/papers/${paper.id}`}>{paper.title}</Link>
                  </h3>
                  <div className="paper-meta-home">
                    <span>
                      {(paper.authors || []).map((a) => a.name).join(', ') || 'Unknown author'}
                    </span>
                    <span>{paper.volume} {paper.issue}</span>
                    {paper.doi ? (
                      <span>
                        DOI{' '}
                        <a
                          href={`https://doi.org/${paper.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--green)', fontWeight: 600 }}
                        >
                          {paper.doi}
                        </a>
                      </span>
                    ) : (
                      <span>DOI pending</span>
                    )}
                  </div>
                </article>
              ))}
              <div style={{ marginTop: '26px' }}>
                <Link to="/papers" className="text-link">
                  View the full archive <ArrowRight size={15} />
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

      {/* 5. Manuscript template */}
      <section className="section section-surface template-section">
        <div className="container template-layout">
          <div className="template-copy">
            <div className="template-icon-circle">
              <FileText size={28} />
            </div>
            <span className="eyebrow">For authors</span>
            <h2>Official manuscript template</h2>
            <p>
              All submissions should follow the {journal.shortName} manuscript
              template. The template sets the correct margins, heading
              hierarchy, reference style and metadata block.
            </p>
            <ul className="check-list" style={{ marginBottom: '24px' }}>
              <li>A4 page size with 2.5 cm margins.</li>
              <li>Times New Roman 11.5 pt body text.</li>
              <li>Structured abstract and keywords.</li>
              <li>Pre-formatted reference and caption styles.</li>
            </ul>
            <div className="template-actions">
              <a href="/IJROS-Template.docx" download className="button button-primary">
                <Download size={16} /> Download Word template
              </a>
              <Link to="/guidelines" className="button button-light">
                Read author guidelines
              </Link>
            </div>
          </div>

          <div className="template-preview-wrapper">
            <div className="mock-paper" aria-hidden="true">
              <div className="mock-header">
                <strong>{journal.shortName}</strong>
                <small>Open Access</small>
              </div>
              <h1>Sample Research Article Title</h1>
              <p className="mock-authors">First Author¹, Second Author²</p>
              <div className="mock-abstract">
                <strong>Abstract</strong>
                <p>
                  A concise summary of the research question, methods, key
                  findings and implications, written for a broad scholarly
                  audience.
                </p>
              </div>
              <div className="mock-body">
                <strong>1. Introduction</strong>
                <p>
                  Background, motivation and the specific gap addressed by the
                  study.
                </p>
                <strong>2. Methods</strong>
                <p>
                  Study design, data sources, analytical approach and
                  reproducibility notes.
                </p>
              </div>
            </div>
            <div className="mock-badge">
              <FileText size={14} /> Official template
            </div>
          </div>
        </div>
      </section>

      {/* 6. Process */}
      <section className="section section-cream">
        <div className="container">
          <div className="section-heading" style={{ textAlign: 'center' }}>
            <span className="eyebrow">Editorial workflow</span>
            <h2>A transparent path to publication</h2>
            <p style={{ margin: '0 auto' }}>
              Every stage is recorded. Authors can follow progress using a
              private tracking token.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-icon"><FileText size={20} /></div>
              <h3>01 · Submit</h3>
              <p>
                Upload your manuscript and author metadata. Receive a private
                paper reference and tracking token instantly.
              </p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><ShieldCheck size={20} /></div>
              <h3>02 · Review</h3>
              <p>
                Editorial screening, peer review and revision requests are
                logged in your private author dashboard.
              </p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><Globe2 size={20} /></div>
              <h3>03 · Publish</h3>
              <p>
                On acceptance and payment verification, your article receives a
                DOI, a permanent landing page and QR-verifiable certificates.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 7. Why publish */}
      <section className="section section-green">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow eyebrow-light">Why publish with {journal.shortName}</span>
            <h2>A scholarly record built on trust</h2>
          </div>
          <div className="why-grid">
            <div className="why-item">
              <CheckCircle2 size={18} />
              <span><strong>Double-blind peer review</strong> — reviewers and authors remain anonymous throughout the process.</span>
            </div>
            <div className="why-item">
              <CheckCircle2 size={18} />
              <span><strong>Figshare DOI</strong> — every published article receives a registered DOI for permanent citation.</span>
            </div>
            <div className="why-item">
              <CheckCircle2 size={18} />
              <span><strong>Open access</strong> — articles are freely available under a CC BY 4.0 licence.</span>
            </div>
            <div className="why-item">
              <CheckCircle2 size={18} />
              <span><strong>Permanent archiving</strong> — landing pages remain stable and citable.</span>
            </div>
            <div className="why-item">
              <CheckCircle2 size={18} />
              <span><strong>QR-verifiable certificates</strong> — one unique certificate per author, publicly verifiable.</span>
            </div>
            <div className="why-item">
              <CheckCircle2 size={18} />
              <span><strong>Transparent process</strong> — every editorial action is recorded in a timestamped timeline.</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}