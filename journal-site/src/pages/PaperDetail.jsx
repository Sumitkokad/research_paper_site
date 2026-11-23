import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Clipboard, Download, Share2 } from 'lucide-react';
import { api, formatDate } from '../api';
import Meta from '../components/Meta';
import { EmptyState, Loading, Notice } from '../components/Layout';

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export default function PaperDetail() {
  const { id } = useParams();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setLoading(true); api(`/paper/${encodeURIComponent(id)}`).then((data) => setPaper(data.paper)).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, [id]);
  const citation = paper ? `${paper.authors.map((a) => a.name).join(', ')} (${paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : ''}). ${paper.title}. ${paper.volume || ''}${paper.issue ? `, ${paper.issue}` : ''}. ${paper.doi ? `https://doi.org/${paper.doi}` : ''}`.trim() : '';
  const bibtex = paper ? `@article{${paper.id.toLowerCase().replace(/[^a-z0-9]/g, '')},\n  title = {${paper.title}},\n  author = {${paper.authors.map((a) => a.name).join(' and ')}},\n  journal = {International Journal of Research and Open Science},\n  year = {${paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : ''}},\n  volume = {${paper.volume || ''}},\n  number = {${paper.issue || ''}}${paper.doi ? `,\n  doi = {${paper.doi}}` : ''}\n}` : '';
  const ris = paper ? `TY  - JOUR\nTI  - ${paper.title}\n${paper.authors.map((a) => `AU  - ${a.name}`).join('\n')}\nJO  - International Journal of Research and Open Science\nPY  - ${paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : ''}\n${paper.doi ? `DO  - ${paper.doi}\n` : ''}ER  - ` : '';
  async function copyCitation() { try { await navigator.clipboard.writeText(citation); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError('Clipboard permission was not available.'); } }
  async function sharePaper() { try { if (navigator.share) await navigator.share({ title: paper.title, text: citation, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); setCopied(true); } } catch { /* user cancelled */ } }
  if (loading) return <section className="section section-white"><div className="container"><Loading label="Loading article record"/></div></section>;
  if (error || !paper) return <section className="section section-white"><div className="container"><EmptyState title="Paper not available" description={error || 'This paper may not be published or its record could not be found.'} action={<Link className="text-link" to="/papers">Back to the archive <ArrowLeft size={15}/></Link>}/></div></section>;
  return <>
    <Meta title={paper.title} description={paper.abstract} canonical={window.location.href} paper={paper}/>
    <section className="article-hero"><div className="container"><Link to="/papers" className="back-link"><ArrowLeft size={15}/> Back to archive</Link><div className="article-label"><span>{paper.category || 'Research'}</span><span>{paper.articleType || 'Article'}</span></div><h1>{paper.title}</h1><div className="article-authors">{paper.authors.map((author, index) => <span key={`${author.name}-${index}`}>{author.name}{author.affiliation ? <small>{author.affiliation}</small> : null}</span>)}</div><div className="article-meta"><span><BookOpen size={15}/> {formatDate(paper.publishedAt)}</span>{paper.volume && <span>{paper.volume} {paper.issue}</span>}{paper.issn && <span>ISSN {paper.issn}</span>}{paper.doi && <span>DOI <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">{paper.doi}</a></span>}</div></div></section>
    <section className="section section-white"><div className="container article-layout"><article className="article-body"><div className="eyebrow">Abstract</div><h2>Research overview</h2><p className="abstract-text">{paper.abstract}</p>{paper.keywords?.length > 0 && <div className="keyword-row"><strong>Keywords</strong>{paper.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}<div className="article-section"><div className="eyebrow">How to cite</div><h2>Recommended citation</h2><div className="citation-box"><p>{citation}</p><button className="button button-light" onClick={copyCitation}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Copied' : 'Copy citation'}</button></div></div><div className="article-section"><div className="eyebrow">Download formats</div><h2>Export citation</h2><div className="export-row"><button onClick={() => downloadText(`${paper.id}.bib`, bibtex, 'application/x-bibtex')} className="export-link">BibTeX <Download size={15}/></button><button onClick={() => downloadText(`${paper.id}.ris`, ris, 'application/x-research-info-systems')} className="export-link">RIS <Download size={15}/></button><button onClick={sharePaper} className="export-link">Share article <Share2 size={15}/></button></div></div><Notice type="info">A DOI is displayed only when the editorial office has entered a registered DOI for this article. A paper ID is not a DOI.</Notice></article>
      <aside className="article-aside"><div className="download-card"><div className="download-icon"><Download size={21}/></div><h3>Read the full paper</h3><p>Download the published manuscript as a PDF.</p><a className="button button-primary button-full" href={paper.pdfUrl}>Download PDF <ArrowUpRight size={16}/></a><div className="download-details"><span>Paper reference</span><strong>{paper.id}</strong><span>Published</span><strong>{formatDate(paper.publishedAt)}</strong></div></div><div className="aside-note"><ShieldCheckIcon/><p>Published article record. Verify author certificates from the certificate QR code or the verification page.</p></div></aside>
    </div></section>
  </>;
}
function ShieldCheckIcon() { return <span className="aside-check">✓</span>; }
