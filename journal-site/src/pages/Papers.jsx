import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { api, formatDate } from '../api';
import { subjects } from '../config';
import Meta from '../components/Meta';
import { EmptyState, Loading, PageIntro } from '../components/Layout';

const PAGE_SIZE = 8;
export default function Papers() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('all');
  const [year, setYear] = useState('all');
  const [volume, setVolume] = useState('all');
  const [issue, setIssue] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  useEffect(() => { api('/papers').then((data) => setPapers(data.papers || [])).catch(() => setPapers([])).finally(() => setLoading(false)); }, []);
  const years = useMemo(() => [...new Set(papers.map((paper) => new Date(paper.publishedAt).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a), [papers]);
  const volumes = useMemo(() => [...new Set(papers.map((paper) => paper.volume).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [papers]);
  const issues = useMemo(() => [...new Set(papers.map((paper) => paper.issue).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [papers]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const result = papers.filter((paper) => {
      const matchesSearch = !search || [paper.title, paper.abstract, ...paper.authors.map((a) => a.name)].join(' ').toLowerCase().includes(search);
      const matchesSubject = subject === 'all' || paper.category === subject;
      const matchesYear = year === 'all' || String(new Date(paper.publishedAt).getFullYear()) === year;
      const matchesVolume = volume === 'all' || paper.volume === volume;
      const matchesIssue = issue === 'all' || paper.issue === issue;
      return matchesSearch && matchesSubject && matchesYear && matchesVolume && matchesIssue;
    });
    result.sort((a, b) => sort === 'oldest' ? new Date(a.publishedAt) - new Date(b.publishedAt) : new Date(b.publishedAt) - new Date(a.publishedAt));
    return result;
  }, [papers, query, subject, year, volume, issue, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function changeFilter(setter, value) { setter(value); setPage(1); }
  return <>
    <Meta title="Published research archive" description="Browse published papers and article records in the ijrise archive."/>
    <PageIntro eyebrow="Research archive" title={<>Published work.<br/><em>Ideas in practice.</em></>} description="Browse published articles by subject and year. Each paper has its own landing page, abstract and PDF record."/>
    <section className="section section-white"><div className="container">
      <div className="archive-toolbar"><div className="search-field"><Search size={17}/><input aria-label="Search papers" placeholder="Search title, author or abstract" value={query} onChange={(e) => changeFilter(setQuery, e.target.value)}/></div><div className="filter-group"><label><SlidersHorizontal size={15}/> Subject<select value={subject} onChange={(e) => changeFilter(setSubject, e.target.value)}><option value="all">All subjects</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label><label>Year<select value={year} onChange={(e) => changeFilter(setYear, e.target.value)}><option value="all">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label><label>Volume<select value={volume} onChange={(e) => changeFilter(setVolume, e.target.value)}><option value="all">All volumes</option>{volumes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Issue<select value={issue} onChange={(e) => changeFilter(setIssue, e.target.value)}><option value="all">All issues</option>{issues.map((item) => <option key={item}>{item}</option>)}</select></label><label>Sort<select value={sort} onChange={(e) => changeFilter(setSort, e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div></div>
      <div className="result-line"><span>{loading ? 'Loading archive…' : `${filtered.length} ${filtered.length === 1 ? 'paper' : 'papers'} found`}</span><span>{filtered.length ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}` : 'No matching results'}</span></div>
      {loading ? <Loading label="Loading journal archive"/> : shown.length ? <div className="paper-list">{shown.map((paper) => <article className="paper-row" key={paper.id}><div className="paper-row-date"><strong>{new Date(paper.publishedAt).getUTCDate().toString().padStart(2, '0')}</strong><span>{new Date(paper.publishedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span></div><div className="paper-row-main"><div className="paper-meta"><span>{paper.category || 'Research'}</span><span>{paper.articleType || 'Article'}</span></div><h3><Link to={`/papers/${paper.id}`}>{paper.title}</Link></h3><p>{paper.authors.map((author) => author.name).join(' · ')}</p><div className="paper-row-sub">{[paper.volume, paper.issue, paper.doi ? `DOI: ${paper.doi}` : ''].filter(Boolean).join(' · ')}</div></div><Link to={`/papers/${paper.id}`} className="round-link" aria-label={`Open ${paper.title}`}><ArrowUpRight size={18}/></Link></article>)}</div> : <EmptyState title="No published papers yet" description="Once a manuscript has been approved, paid and published, it will appear in this archive."/>}
      {totalPages > 1 && <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div></section>
  </>;
}
