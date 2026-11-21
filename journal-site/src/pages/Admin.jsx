import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleAlert, CircleCheck, FileText, LogOut, Mail, RefreshCw, Save, Search, ShieldCheck, X } from 'lucide-react';
import { api, formatDate, post, statusLabel } from '../api';
import Meta from '../components/Meta';
import { Loading, Notice } from '../components/Layout';

const filterOptions = ['all', 'submitted', 'under_review', 'revision_requested', 'revision_submitted', 'accepted', 'payment_submitted', 'publishing', 'published', 'rejected', 'unpublished'];

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState('');
  const [drafts, setDrafts] = useState({});
  const [busyAction, setBusyAction] = useState('');

  async function refresh() {
    setError(''); setLoading(true);
    try { const result = await api('/admin/dashboard'); setData(result); setAuthenticated(true); }
    catch (err) { if (/sign in|401|Unauthorized/i.test(err.message)) setAuthenticated(false); else setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  async function doLogin(event) {
    event.preventDefault(); setError(''); setLoginBusy(true);
    try { await post('/admin/login', login); setAuthenticated(true); setLogin({ email: '', password: '' }); await refresh(); }
    catch (err) { setError(err.message); }
    finally { setLoginBusy(false); }
  }
  async function logout() { await post('/admin/logout', {}); setAuthenticated(false); setData(null); }
  const papers = useMemo(() => (data?.papers || []).filter((paper) => {
    const matchesStatus = statusFilter === 'all' || paper.status === statusFilter;
    const haystack = [paper.id, paper.title, paper.submitterName, paper.submitterEmail, ...(paper.authors || []).map((a) => a.name)].join(' ').toLowerCase();
    return matchesStatus && haystack.includes(query.toLowerCase());
  }), [data, query, statusFilter]);
  function draft(id, field, value) { setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [field]: value } })); }
  async function action(paper, actionName, extra = {}) {
    const key = `${paper.id}:${actionName}`; setBusyAction(key); setError(''); setNotice('');
    try { const result = await post('/admin/action', { paperId: paper.id, action: actionName, ...extra }); setNotice(result.emailSent === false ? 'Action saved, but email delivery failed. Review the mail log and SMTP settings.' : result.error || (actionName === 'confirm_payment' ? `Published. ${result.certificates || 0} author certificate(s) generated.` : 'Changes saved.')); await refresh(); }
    catch (err) { setError(err.message); if (/Payment confirmed/.test(err.message)) await refresh(); }
    finally { setBusyAction(''); }
  }
  function getDraft(paper, key, fallback = '') { return drafts[paper.id]?.[key] ?? fallback; }

  return <>
    <Meta title="Editorial administration" description="Restricted editorial management dashboard."/>
    <section className="admin-page"><div className="container admin-container"><div className="admin-heading"><div><div className="eyebrow">Restricted area</div><h1>Editorial <em>workspace.</em></h1><p>Review submissions, record decisions, verify UPI references and publish certificates.</p></div>{authenticated && <div className="admin-head-actions"><a href="/api/admin/backup" className="button button-light"><ArrowDownToLine size={15}/> Export db.json</a><button className="button button-quiet" onClick={logout}><LogOut size={15}/> Sign out</button></div>}</div>
      {error && <Notice type="error">{error}</Notice>}{notice && <Notice type="success">{notice}</Notice>}
      {!authenticated ? <div className="admin-login-card"><div className="admin-login-symbol"><ShieldCheck size={25}/></div><div className="eyebrow">Editorial office only</div><h2>Sign in to manage<br/><em>journal records.</em></h2><p>Use the administrator credentials configured in your Netlify environment variables.</p><form className="journal-form" onSubmit={doLogin}><label className="field"><span>Admin email</span><input type="email" autoComplete="username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} required/></label><label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} required/></label><button className="button button-primary button-full" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in securely'} <ArrowUpRight size={16}/></button></form><small>Session expires automatically after 12 hours. The session cookie is HTTP-only and same-site.</small></div> : loading ? <Loading label="Loading editorial dashboard"/> : data ? <>
        <div className="admin-status-grid">{[['All submissions', data.papers.length, 'all'], ...filterOptions.filter((key) => key !== 'all').map((key) => [statusLabel(key), data.counts?.[key] || 0, key])].map(([label, count, key]) => <button key={key} className={`admin-stat ${statusFilter === key ? 'selected' : ''}`} onClick={() => setStatusFilter(key)}><span>{label}</span><strong>{count}</strong></button>)}</div>
        <div className="admin-config-row"><div><CircleCheck size={16}/> GitHub storage {data.storageConfigured ? 'connected' : 'not configured'}</div><div><CircleAlert size={16}/> UPI {data.paymentConfig?.ready ? `configured · ₹${data.paymentConfig.amount}` : 'not configured'}</div><button onClick={refresh} className="icon-button" aria-label="Refresh dashboard"><RefreshCw size={16}/></button></div>
        <section className="payment-review-section"><div className="section-mini-heading"><div><div className="eyebrow">Accounts review</div><h2>Pending UPI references</h2></div><span className="pending-count">{data.papers.filter((paper) => paper.status === 'payment_submitted').length} pending</span></div>
          {data.papers.filter((paper) => paper.status === 'payment_submitted').length ? <div className="payment-review-list">{data.papers.filter((paper) => paper.status === 'payment_submitted').map((paper) => <div className="payment-review-row" key={paper.id}><div><strong>{paper.title}</strong><span>{paper.id} · {paper.submitterName} · {paper.submitterEmail}</span></div><div className="utr-code"><small>UTR</small><strong>{paper.payment?.utr || '—'}</strong></div><div className="utr-code"><small>Amount</small><strong>₹{paper.payment?.amount ?? '—'}</strong></div><div className="utr-code"><small>Submitted</small><strong>{formatDate(paper.payment?.submittedAt)}</strong></div><div className="payment-actions"><button className="button button-primary button-small" disabled={busyAction === `${paper.id}:confirm_payment`} onClick={() => action(paper, 'confirm_payment')}><Check size={14}/> Confirm &amp; publish</button><button className="button button-danger button-small" onClick={() => action(paper, 'reject_payment', { reason: getDraft(paper, 'reason') || 'The payment reference could not be verified.' })}><X size={14}/> Reject</button><input className="mini-input" value={getDraft(paper, 'reason')} onChange={(e) => draft(paper.id, 'reason', e.target.value)} placeholder="Reason if rejecting"/></div></div>)}</div> : <div className="admin-empty">No payment references are waiting for review.</div>}
        </section>
        <div className="admin-list-toolbar"><div><div className="eyebrow">Editorial queue</div><h2>Manuscript records</h2></div><div className="admin-filters"><div className="search-field"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search papers or authors"/></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{filterOptions.map((key) => <option key={key} value={key}>{key === 'all' ? 'All statuses' : statusLabel(key)}</option>)}</select></div></div>
        <div className="admin-paper-list">{papers.map((paper) => <article className={`admin-paper ${expanded === paper.id ? 'expanded' : ''}`} key={paper.id}><button className="admin-paper-summary" onClick={() => setExpanded(expanded === paper.id ? '' : paper.id)}><div><div className="paper-meta"><span>{paper.category || 'No subject'}</span><span>{paper.articleType || 'Article'}</span></div><h3>{paper.title}</h3><p>{(paper.authors || []).map((author) => author.name).join(' · ')}</p><small>{paper.id} · Submitted {formatDate(paper.submittedAt)}</small></div><div className="admin-paper-status"><span className={`status-pill status-${paper.status}`}>{statusLabel(paper.status)}</span><ChevronDown size={18}/></div></button>
          {expanded === paper.id && <div className="admin-paper-detail"><div className="admin-detail-grid"><div><span>Corresponding author</span><strong>{paper.submitterName}</strong><small>{paper.submitterEmail}</small></div><div><span>Authors ({paper.authors?.length || 0})</span><strong>{paper.authors?.map((a) => a.name).join(', ')}</strong></div><div><span>Manuscript version</span><strong>v{paper.version || 1}</strong></div><div><span>Payment status</span><strong>{paper.paymentStatus || 'Not due'}</strong></div></div>
            <div className="admin-file-link"><a className="button button-light button-small" href={`/api/admin/file/${encodeURIComponent(paper.id)}`}><FileText size={14}/> Download current manuscript PDF</a></div>
            {paper.abstract && <div className="admin-abstract"><strong>Abstract</strong><p>{paper.abstract}</p></div>}
            {paper.payment && <div className="admin-payment-detail"><span>UTR: <strong>{paper.payment.utr || '—'}</strong></span><span>Amount: <strong>₹{paper.payment.amount ?? '—'}</strong></span><span>Submitted: <strong>{formatDate(paper.payment.submittedAt)}</strong></span>{paper.payment.confirmedAt && <span>Confirmed: <strong>{formatDate(paper.payment.confirmedAt)}</strong></span>}</div>}
            {paper.publishError && <Notice type="error">Publication error: {paper.publishError}</Notice>}
            {paper.emailFailure && <Notice type="warning">Latest email failure: {paper.emailFailure}</Notice>}
            <div className="admin-actions-grid">
              {['submitted', 'under_review', 'revision_submitted'].includes(paper.status) && <><div className="admin-action-block"><strong>Editorial decision</strong>{paper.status !== 'under_review' && <button className="button button-light button-small" onClick={() => action(paper, 'start_review')}>Mark under review</button>}<button className="button button-primary button-small" onClick={() => action(paper, 'accept')}>Accept &amp; send payment link</button><textarea value={getDraft(paper, 'comments')} onChange={(e) => draft(paper.id, 'comments', e.target.value)} placeholder="Revision comments for author"/><button className="button button-light button-small" onClick={() => action(paper, 'request_revision', { comments: getDraft(paper, 'comments') })}>Request revision</button><textarea value={getDraft(paper, 'reason')} onChange={(e) => draft(paper.id, 'reason', e.target.value)} placeholder="Optional decision note"/><button className="button button-danger button-small" onClick={() => action(paper, 'reject', { reason: getDraft(paper, 'reason') })}>Reject submission</button></div></>}
              {paper.status === 'publishing' && <div className="admin-action-block"><strong>Publication needs retry</strong><p>Payment was confirmed, but certificate creation did not finish.</p><button className="button button-primary button-small" onClick={() => action(paper, 'confirm_payment')}>Retry certificate generation</button></div>}
              {paper.status === 'published' && <div className="admin-action-block"><strong>Published record</strong><p>{paper.certificates?.length || 0} author certificate(s) · {paper.volume} {paper.issue}</p><button className="button button-danger button-small" onClick={() => action(paper, 'unpublish', { reason: getDraft(paper, 'reason') || 'Withdrawn by editorial office.' })}>Unpublish with reason</button><textarea value={getDraft(paper, 'reason')} onChange={(e) => draft(paper.id, 'reason', e.target.value)} placeholder="Required reason for withdrawal"/></div>}
              <div className="admin-action-block"><strong>Metadata</strong><label className="mini-field">Title<input value={getDraft(paper, 'title', paper.title || '')} onChange={(e) => draft(paper.id, 'title', e.target.value)}/></label><label className="mini-field">Abstract<textarea value={getDraft(paper, 'abstract', paper.abstract || '')} onChange={(e) => draft(paper.id, 'abstract', e.target.value)} /></label><label className="mini-field">Subject<input value={getDraft(paper, 'category', paper.category || '')} onChange={(e) => draft(paper.id, 'category', e.target.value)}/></label><label className="mini-field">Article type<input value={getDraft(paper, 'articleType', paper.articleType || '')} onChange={(e) => draft(paper.id, 'articleType', e.target.value)}/></label><label className="mini-field">ISSN<input value={getDraft(paper, 'issn', paper.issn || '')} onChange={(e) => draft(paper.id, 'issn', e.target.value)} placeholder="Only enter a verified ISSN"/></label><label className="mini-field">DOI<input value={getDraft(paper, 'doi', paper.doi || '')} onChange={(e) => draft(paper.id, 'doi', e.target.value)} placeholder="Only enter a registered DOI"/></label><div className="field-two"><label className="mini-field">Volume<input value={getDraft(paper, 'volume', paper.volume || '')} onChange={(e) => draft(paper.id, 'volume', e.target.value)}/></label><label className="mini-field">Issue<input value={getDraft(paper, 'issue', paper.issue || '')} onChange={(e) => draft(paper.id, 'issue', e.target.value)}/></label></div><button className="button button-light button-small" onClick={() => action(paper, 'edit_metadata', { title: getDraft(paper, 'title', paper.title || ''), abstract: getDraft(paper, 'abstract', paper.abstract || ''), category: getDraft(paper, 'category', paper.category || ''), articleType: getDraft(paper, 'articleType', paper.articleType || ''), issn: getDraft(paper, 'issn', paper.issn || ''), doi: getDraft(paper, 'doi', paper.doi || ''), volume: getDraft(paper, 'volume', paper.volume || ''), issue: getDraft(paper, 'issue', paper.issue || '') })}><Save size={14}/> Save metadata</button></div>
              <div className="admin-action-block"><strong>Email delivery</strong><div className="mail-buttons"><button onClick={() => action(paper, 'resend_email', { type: paper.status === 'published' ? 'publication' : paper.status === 'accepted' ? 'accepted' : 'claimed' })} className="button button-light button-small"><Mail size={14}/> Resend status email</button>{(paper.mailLog || []).some((log) => log.status === 'failed') && <button onClick={() => action(paper, 'resend_email', { type: 'last_failed' })} className="button button-quiet button-small"><RefreshCw size={13}/> Retry last failed</button>}</div>{(paper.mailLog || []).slice(-4).reverse().map((log, index) => <small className={`mail-log ${log.status}`} key={`${log.at}-${index}`}>{log.type}: {log.status} · {formatDate(log.at)}</small>)}</div>
            </div>
            <div className="admin-history"><strong>Paper timeline</strong>{(paper.history || []).slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><span>{formatDate(entry.at, { hour: '2-digit', minute: '2-digit' })}</span><p>{entry.message}</p></div>)}</div>
          </div>}
        </article>)}{papers.length === 0 && <div className="admin-empty">No records match your search.</div>}</div>
      </> : null}
    </div></section>
  </>;
}
