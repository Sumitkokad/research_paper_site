import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, FileCheck2, Globe2, ShieldCheck, Sparkles } from 'lucide-react';
import { api, formatDate } from '../api';
import { journal } from '../config';
import Meta from '../components/Meta';
import { Loading, EmptyState } from '../components/Layout';

export default function Home() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api('/papers').then((data) => setPapers(data.papers || [])).catch(() => setPapers([])).finally(() => setLoading(false)); }, []);
  const featured = papers.slice(0, 3);
  return <>
    <Meta title="Advancing science through open research" description={journal.description}/>
    <section className="hero">
      <div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/>
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="eyebrow eyebrow-light"><span className="eyebrow-dot"/> {journal.shortName} · Scholarly publishing</div>
          <h1>Ideas that move<br/><em>research forward.</em></h1>
          <p>Discover research, share your findings and follow a clear editorial journey — from manuscript submission to a verifiable publication record.</p>
          <div className="hero-actions"><Link to="/submit" className="button button-gold">Submit your research <ArrowUpRight size={17}/></Link><Link to="/papers" className="button button-outline-light">Explore papers <ArrowRight size={16}/></Link></div>
          <div className="hero-note"><ShieldCheck size={16}/> Transparent decisions · Manual payment verification · QR-verifiable certificates</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="book-card"><div className="book-top"><span>{journal.shortName}</span><span>VOL. 01</span></div><div className="book-lines"><i/><i/><i/></div><div className="book-title">A journal<br/>of discovery</div><div className="book-seal"><Sparkles size={25}/></div><div className="book-foot">SCIENCE · INNOVATION · ENGINEERING</div></div>
          <div className="floating-note note-top"><span className="note-icon"><FileCheck2 size={16}/></span><span><strong>Verified record</strong><small>QR certificate validation</small></span></div>
          <div className="floating-note note-bottom"><span className="note-icon note-olive"><BookOpen size={16}/></span><span><strong>Research archive</strong><small>Published articles</small></span></div>
        </div>
      </div>
      <div className="container hero-bottom"><span>International Journal of Research and Innovation in Science and Engineering</span><span className="hero-bottom-line"/><span>{journal.issn ? `ISSN ${journal.issn}` : 'ISSN displayed when confirmed'}</span></div>
    </section>

    <section className="section section-white"><div className="container">
      <div className="section-heading"><div><div className="eyebrow">A considered process</div><h2>Built around credible<br/><em>research publishing.</em></h2></div><p>Clear submission steps, traceable decisions and a public record for every paper that reaches publication.</p></div>
      <div className="feature-grid">
        <article className="feature-card"><div className="feature-icon"><FileCheck2/></div><div className="feature-number">01 / SUBMIT</div><h3>Simple manuscript intake</h3><p>Submit a PDF, add up to five authors and provide the metadata needed to identify your work correctly.</p><Link to="/submit">Submission details <ArrowUpRight size={14}/></Link></article>
        <article className="feature-card feature-accent"><div className="feature-icon"><ShieldCheck/></div><div className="feature-number">02 / REVIEW</div><h3>Visible editorial stages</h3><p>Follow your paper through screening, revision, decision and manual payment verification with a private tracking token.</p><Link to="/track">Track a manuscript <ArrowUpRight size={14}/></Link></article>
        <article className="feature-card"><div className="feature-icon"><Globe2/></div><div className="feature-number">03 / VERIFY</div><h3>Certificates with proof</h3><p>Each author receives an individual PDF certificate with a unique ID and a QR code linked to a public verification page.</p><Link to="/policies">Read the process <ArrowUpRight size={14}/></Link></article>
      </div>
    </div></section>

    <section className="section section-paper"><div className="container"><div className="section-heading compact"><div><div className="eyebrow">Latest additions</div><h2>From the <em>journal archive.</em></h2></div><Link className="text-link" to="/papers">View all papers <ArrowRight size={15}/></Link></div>
      {loading ? <Loading label="Loading published papers"/> : featured.length ? <div className="paper-grid">{featured.map((paper) => <article className="paper-card" key={paper.id}><div className="paper-card-top"><span className="paper-category">{paper.category || 'Research'}</span><span>{formatDate(paper.publishedAt)}</span></div><h3><Link to={`/papers/${paper.id}`}>{paper.title}</Link></h3><p className="paper-authors">{paper.authors.map((a) => a.name).join(', ')}</p><div className="paper-card-foot"><span>{paper.volume} {paper.issue}</span><Link to={`/papers/${paper.id}`} aria-label={`Read ${paper.title}`}><ArrowUpRight size={17}/></Link></div></article>)}</div> : <EmptyState title="The archive is being prepared" description="Published research will appear here after editorial approval and publication." action={<Link className="text-link" to="/submit">Submit a manuscript <ArrowRight size={15}/></Link>}/>}
    </div></section>

    <section className="section section-navy"><div className="container split-cta"><div><div className="eyebrow eyebrow-light">For researchers and authors</div><h2>Your research deserves<br/><em>a clear record.</em></h2><p>Start a submission or check the status of a manuscript already in the editorial workflow.</p></div><div className="cta-actions"><Link to="/submit" className="button button-gold">Start a submission <ArrowUpRight size={17}/></Link><Link to="/track" className="button button-outline-light">Track a paper <ArrowRight size={16}/></Link></div></div></section>
  </>;
}
