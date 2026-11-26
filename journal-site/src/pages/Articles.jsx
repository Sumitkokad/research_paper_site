import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Globe2,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { journal, articleTypes, subjects } from '../config';
import Meta from '../components/Meta';

const typeDescriptions = {
  'Research Article': 'Full-length reports of original, methodologically sound research. Typically 6,000–10,000 words.',
  'Review Article': 'Critical synthesis of a field with a clear contribution to understanding. 5,000–9,000 words.',
  'Case Study': 'In-depth examination of a specific project, deployment or setting with generalisable lessons.',
  'Short Communication': 'Concise, high-impact findings or preliminary results. Up to 3,000 words.',
  'Technical Note': 'Focused description of a method, tool, dataset or process. Up to 3,500 words.',
};

export default function Articles() {
  return (
    <>
      <Meta
        title="Call for articles"
        description={`Submit original research to ${journal.name}. Peer-reviewed, open access, ${journal.doiProvider} DOI on publication.`}
      />

      <section className="articles-hero">
        <div className="container">
          <div className="eyebrow">Call for articles</div>
          <h1>Submit your research to <em>{journal.shortName}</em>.</h1>
          <p>
            {journal.name} welcomes original, methodologically sound manuscripts
            across science, technology, engineering and interdisciplinary fields.
            Every accepted article receives a {journal.doiProvider} DOI, a
            permanent landing page and a QR-verifiable author certificate.
          </p>
          <div className="hero-actions">
            <Link to="/submit" className="button button-primary">
              <Send size={16} /> Start a submission
            </Link>
            <Link to="/guidelines" className="button button-light">
              Read author guidelines
            </Link>
          </div>
        </div>
      </section>

      <div className="trust-bar">
        <div className="container trust-grid">
          <div className="trust-item"><ShieldCheck size={16} /> Double-blind peer review</div>
          <div className="trust-item"><Globe2 size={16} /> Open access · {journal.openAccessLicense}</div>
          <div className="trust-item"><FileText size={16} /> {journal.doiProvider} DOI</div>
          <div className="trust-item"><BookOpen size={16} /> Permanent archive</div>
        </div>
      </div>

      <section className="section section-cream">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Accepted article types</span>
            <h2>What we publish</h2>
            <p>
              Manuscripts are assessed for originality, methodological rigour,
              clarity and relevance to the journal’s scope.
            </p>
          </div>
          <div className="article-types-grid">
            {articleTypes.map((type) => (
              <article className="article-type-card" key={type}>
                <h3>{type}</h3>
                <p>{typeDescriptions[type]}</p>
                <small>Open for submission</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-surface">
        <div className="container">
          <div className="info-layout">
            <article className="prose">
              <div className="info-block">
                <h2>Subject scope</h2>
                <p>
                  We publish work spanning fundamental and applied research.
                  Manuscripts should clearly identify the discipline and the
                  specific problem addressed.
                </p>
                <ul className="scope-list">
                  {subjects.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>

              <div className="info-block">
                <h2>Before you submit</h2>
                <ul>
                  <li>Prepare a single, complete PDF using the official manuscript template.</li>
                  <li>Confirm all listed authors have approved the submission.</li>
                  <li>Ensure the manuscript is not under consideration elsewhere.</li>
                  <li>Include a structured abstract of at least 40 characters (maximum 5,000).</li>
                  <li>Add between 1 and 5 authors, each with a valid affiliation.</li>
                </ul>
              </div>

              <div className="info-block">
                <h2>Editorial workflow</h2>
                <p>
                  Every submission passes through the same transparent workflow.
                  Authors can follow each stage using a private tracking link.
                </p>
                <div className="info-two-col">
                  <div className="info-mini-card">
                    <strong>01 · Submit</strong>
                    <span>Upload your manuscript and author metadata. Receive a private paper reference instantly.</span>
                  </div>
                  <div className="info-mini-card">
                    <strong>02 · Editorial screening</strong>
                    <span>Completeness, scope and formatting checks are performed by the editorial office.</span>
                  </div>
                  <div className="info-mini-card">
                    <strong>03 · Peer review</strong>
                    <span>Double-blind review by independent reviewers. Revisions are requested where needed.</span>
                  </div>
                  <div className="info-mini-card">
                    <strong>04 · Publication</strong>
                    <span>On acceptance and payment verification, your article receives a {journal.doiProvider} DOI and landing page.</span>
                  </div>
                </div>
              </div>
            </article>

            <aside className="info-aside">
              <div className="aside-panel aside-panel-dark">
                <div className="eyebrow eyebrow-light">Key facts</div>
                <h3>At a glance</h3>
                <ul className="check-list">
                  <li>Target initial decision: {journal.decisionTarget}</li>
                  <li>{journal.openAccessLicense} open-access licence</li>
                  <li>{journal.doiProvider} DOI on publication</li>
                  <li>One QR-verifiable certificate per author</li>
                  <li>No fee at submission</li>
                </ul>
              </div>
              <div className="aside-panel">
                <h3>Ready to submit?</h3>
                <p style={{ fontSize: 13.5, color: 'var(--ink-light)', margin: '0 0 16px' }}>
                  Start your submission now. You’ll receive a private paper
                  reference and tracking token by email.
                </p>
                <Link to="/submit" className="button button-primary button-full">
                  Submit manuscript <ArrowRight size={16} />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section section-cream">
        <div className="container">
          <div className="cfp-cta">
            <div>
              <h3>Have a manuscript ready?</h3>
              <p>Submit today and track every editorial decision from your author dashboard.</p>
            </div>
            <Link to="/submit" className="button button-primary">
              <CheckCircle2 size={16} /> Submit your article
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}