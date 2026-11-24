import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Clipboard, Download, Share2, ShieldCheck } from 'lucide-react';
import { api, formatDate } from '../api';
import Meta from '../components/Meta';
import { EmptyState, Loading, Notice } from '../components/Layout';
import { journal } from '../config';

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; 
  anchor.download = filename; 
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PaperDetail() {
  const { id } = useParams();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/paper/${encodeURIComponent(id)}`)
      .then((data) => setPaper(data.paper))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <section className="section section-surface"><div className="container"><Loading label="Loading article record" /></div></section>;
  if (error || !paper) return <section className="section section-surface"><div className="container"><EmptyState title="Paper not available" description={error || 'This paper may not be published or its record could not be found.'} action={<Link className="text-link" to="/papers">Back to the archive <ArrowLeft size={15} /></Link>} /></div></section>;

  const authors = Array.isArray(paper.authors) ? paper.authors : [];
  const authorNames = authors.map((a) => a.name).join(', ');
  
  const citation = `${authorNames} (${paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : ''}). ${paper.title}. ${journal.name}, ${paper.volume || ''}${paper.issue ? `(${paper.issue})` : ''}. ${paper.doi ? `https://doi.org/${paper.doi}` : ''}`.trim();
  
  const bibtex = `@article{${(paper.id || 'paper').toLowerCase().replace(/[^a-z0-9]/g, '')},
  title = {${paper.title}},
  author = {${authors.map((a) => a.name).join(' and ')}},
  journal = {${journal.name}},
  year = {${paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : ''}},
  volume = {${paper.volume || ''}},
  number = {${paper.issue || ''}}${paper.doi ? `,\n  doi = {${paper.doi}}` : ''}
}`;
  
  const ris = `TY  - JOUR
TI  - ${paper.title}
${authors.map((a) => `AU  - ${a.name}`).join('\n')}
JO  - ${journal.name}
PY  - ${paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : ''}
${paper.doi ? `DO  - ${paper.doi}\n` : ''}ER  - `;

  async function copyCitation() { 
    try { 
      await navigator.clipboard.writeText(citation); 
      setCopied(true); 
      setTimeout(() => setCopied(false), 2000); 
    } catch { 
      setError('Clipboard permission was not available.'); 
    } 
  }
  
  async function sharePaper() { 
    try { 
      if (navigator.share) await navigator.share({ title: paper.title, text: citation, url: window.location.href }); 
      else { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } 
    } catch { /* user cancelled */ } 
  }

  return (
    <>
      <Meta title={paper.title} description={paper.abstract} canonical={window.location.href} paper={paper} />
      
      {/* Article Hero */}
      <section className="article-hero">
        <div className="container">
          <Link to="/papers" className="back-link"><ArrowLeft size={16} /> Back to archive</Link>
          
          <div className="article-label">
            <span>{paper.category || 'Research'}</span>
            <span>{paper.articleType || 'Article'}</span>
          </div>
          
          <h1>{paper.title}</h1>
          
          <div className="article-authors">
            {authors.map((author, index) => (
              <span key={`${author.name}-${index}`}>
                {author.name}
                {author.affiliation && <small>{author.affiliation}</small>}
              </span>
            ))}
          </div>
          
          <div className="article-meta">
            <span><BookOpen size={16} /> Published: {formatDate(paper.publishedAt)}</span>
            {(paper.volume || paper.issue) && <span>{paper.volume} {paper.issue ? `, Issue ${paper.issue}` : ''}</span>}
            {paper.issn && <span>ISSN {paper.issn}</span>}
            {paper.doi && <span>DOI: <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">{paper.doi}</a></span>}
          </div>
        </div>
      </section>

      {/* Article Body & Sidebar */}
      <section className="section section-surface">
        <div className="container article-layout">
          
          <article className="article-body">
            <div className="article-section">
              <h2>Abstract</h2>
              <p className="abstract-text">{paper.abstract}</p>
              {paper.keywords?.length > 0 && (
                <div className="keyword-row">
                  <strong>Keywords:</strong>
                  {paper.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                </div>
              )}
            </div>

            <div className="article-section">
              <h2>Cite this article</h2>
              <div className="citation-box">
                <p>{citation}</p>
                <button className="button button-light" onClick={copyCitation}>
                  {copied ? <Check size={16} /> : <Clipboard size={16} />} 
                  {copied ? 'Copied to clipboard' : 'Copy citation'}
                </button>
              </div>
            </div>

            <div className="article-section">
              <h2>Export Citation</h2>
              <div className="export-row">
                <button onClick={() => downloadText(`${paper.id}.bib`, bibtex, 'application/x-bibtex')} className="export-link">
                  Download BibTeX <Download size={16} />
                </button>
                <button onClick={() => downloadText(`${paper.id}.ris`, ris, 'application/x-research-info-systems')} className="export-link">
                  Download RIS <Download size={16} />
                </button>
                <button onClick={sharePaper} className="export-link">
                  Share article <Share2 size={16} />
                </button>
              </div>
            </div>
            
            <Notice type="info" style={{ marginTop: '40px' }}>
              A DOI is displayed only when the editorial office has entered a registered DOI for this article. A paper ID is not a DOI.
            </Notice>
          </article>
          
          <aside className="article-aside">
            <div className="download-card">
              <div className="download-icon"><Download size={24} /></div>
              <h3>Full-Text PDF</h3>
              <p>Download the published version of this manuscript.</p>
              <a className="button button-primary button-full" href={paper.pdfUrl} target="_blank" rel="noreferrer">
                Download PDF <ArrowUpRight size={16} />
              </a>
              <div className="download-details">
                <div>
                  <span>Paper Reference</span>
                  <strong>{paper.id}</strong>
                </div>
                <div>
                  <span>Published</span>
                  <strong>{formatDate(paper.publishedAt)}</strong>
                </div>
              </div>
            </div>
            
            <div className="aside-note">
              <ShieldCheck className="aside-check" size={20} />
              <p>This is a published article record. You can verify author certificates via the QR code on the certificate or the public verification page.</p>
            </div>
          </aside>
          
        </div>
      </section>
    </>
  );
}