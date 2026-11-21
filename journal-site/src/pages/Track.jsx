import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, FileUp, LockKeyhole, RefreshCw } from 'lucide-react';
import { api, formatDate, post, statusLabel } from '../api';
import Meta from '../components/Meta';
import { Notice, PageIntro } from '../components/Layout';

const steps = ['submitted', 'under_review', 'revision_requested', 'revision_submitted', 'accepted', 'payment_submitted', 'publishing', 'published'];
export default function Track() {
  const [params, setParams] = useSearchParams();
  const [paperId, setPaperId] = useState(params.get('paperId') || '');
  const [token, setToken] = useState(params.get('token') || '');
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [revisionBusy, setRevisionBusy] = useState(false);

  async function lookup(id = paperId, access = token) {
    setError(''); setMessage(''); setBusy(true);
    try {
      const data = await post('/track', { paperId: id.trim(), token: access.trim() });
      setRecord(data);
      setPaperId(id.trim()); setToken(access.trim());
      setParams({ paperId: id.trim(), token: access.trim() }, { replace: true });
    } catch (err) { setRecord(null); setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { const id = params.get('paperId'); const access = params.get('token'); if (id && access) lookup(id, access); /* initial email link only */ }, []);
  async function claim(event) {
    event.preventDefault();
    setClaimError('');
    setClaimMessage('');
    setClaimBusy(true);
    try {
      const result = await post('/claim', {
        email: event.currentTarget.elements.email.value.trim()
      });
      setClaimMessage(result.message || 'If this email is associated with a submission, new tracking details will be sent.');
    } catch (err) {
      setClaimError(err.message || 'Unable to request tracking access. Please try again.');
    } finally {
      setClaimBusy(false);
    }
  }
  async function uploadRevision(event) {
    event.preventDefault(); if (!file) return setError('Choose a revised PDF first.');
    const form = new FormData(); form.set('paperId', paperId); form.set('token', token); form.set('manuscript', file);
    setRevisionBusy(true); setError(''); setMessage('');
    try { const result = await post('/revision', form); setMessage(result.message); setFile(null); await lookup(); }
    catch (err) { setError(err.message); }
    finally { setRevisionBusy(false); }
  }
  const statusIndex = record ? steps.indexOf(record.status) : -1;
  return <>
    <Meta title="Track your manuscript" description="Securely follow the editorial status of a journal submission."/>
    <PageIntro eyebrow="Author services" title={<>Your paper, <em>in view.</em></>} description="Enter the paper reference and private access token from your submission email. The token is your author access credential."/>
    <section className="section section-white"><div className="container track-layout">
      <div className="track-main"><form className="track-login" onSubmit={(e) => { e.preventDefault(); lookup(); }}><div className="track-lock"><LockKeyhole size={19}/></div><div><h2>Private submission access</h2><p>Only the corresponding author should use this link and token.</p></div><label className="field"><span>Paper ID</span><input value={paperId} onChange={(e) => setPaperId(e.target.value)} required placeholder="ijrise-2026-…"/></label><label className="field"><span>Private tracking token</span><input value={token} onChange={(e) => setToken(e.target.value)} required type="password" autoComplete="off" placeholder="Paste the token from your email"/></label>{error && <Notice type="error">{error}</Notice>}{message && <Notice type="success">{message}</Notice>}<button className="button button-primary button-full" disabled={busy}>{busy ? 'Checking access…' : 'View paper status'} <ArrowRight size={16}/></button></form>
      {record && <div className="track-result"><div className="track-result-head"><div><div className="eyebrow">Submission timeline</div><h2>{record.title}</h2><span className="muted-small">{record.paperId}</span></div><span className={`status-pill status-${record.status}`}>{statusLabel(record.status)}</span></div>
        <div className="progress-steps">{steps.filter((step) => !['revision_requested', 'revision_submitted'].includes(step)).map((step, index) => { const rank = steps.indexOf(step); const active = statusIndex >= rank || record.status === step; return <div className={`progress-step ${active ? 'complete' : ''} ${record.status === step ? 'current' : ''}`} key={step}><span className="progress-dot">{active ? <CheckCircle2 size={15}/> : index + 1}</span><span>{statusLabel(step)}</span></div>; })}</div>
        {record.revisionComments && <div className="revision-comment"><strong>Editor’s revision comments</strong><p>{record.revisionComments}</p></div>}
        {record.status === 'revision_requested' && <form className="revision-upload" onSubmit={uploadRevision}><h3>Upload your revised manuscript</h3><p>Upload a new PDF version. Your paper reference will remain unchanged.</p><label className="field"><span>Revised PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required/></label><button className="button button-primary" disabled={revisionBusy}>{revisionBusy ? 'Uploading…' : 'Upload revision'} <FileUp size={16}/></button></form>}
        {record.certificates?.length > 0 && <div className="certificate-list"><h3>Your author certificates</h3>{record.certificates.map((cert) => <a key={cert.certificateId} href={cert.url} className="certificate-download"><span><CheckCircle2 size={16}/><span><strong>{cert.authorName}</strong><small>{cert.certificateId}</small></span></span><span>Download PDF <ArrowRight size={15}/></span></a>)}</div>}
        <div className="timeline">{[...(record.history || [])].reverse().map((item, index) => <div className="timeline-item" key={`${item.at}-${index}`}><span className="timeline-pin"><Clock3 size={13}/></span><div><strong>{item.message}</strong><small>{formatDate(item.at, { hour: '2-digit', minute: '2-digit' })}</small></div></div>)}</div>
      </div>}
      <form className="claim-box" onSubmit={claim}>
        <div className="claim-icon"><RefreshCw size={18}/></div>
        <div>
          <h3>Lost your tracking email?</h3>
          <p>Enter the corresponding-author email used during submission. We will email the Paper ID and a new private tracking token for each matching submission. For privacy, the page always shows the same response whether the email matches or not.</p>
        </div>
        <label className="field">
          <span>Corresponding author email <b>*</b></span>
          <input name="email" type="email" required maxLength={180} autoComplete="email" placeholder="The email used during submission"/>
        </label>
        {claimError && <Notice type="error">{claimError}</Notice>}
        {claimMessage && <Notice type="success">{claimMessage} Check the inbox and spam folder. If no email arrives, contact the editorial office.</Notice>}
        <button className="button button-light" disabled={claimBusy}>{claimBusy ? 'Requesting…' : 'Request new tracking access'}</button>
      </form>
      </div>
      <aside className="track-aside"><div className="aside-panel aside-panel-dark"><div className="eyebrow eyebrow-light">Status guide</div><h3>What each stage means.</h3><ul className="status-guide"><li><b>Submitted</b><span>Manuscript received by the system.</span></li><li><b>Under review</b><span>Editorial screening is in progress.</span></li><li><b>Revision requested</b><span>The editor needs an updated manuscript.</span></li><li><b>Accepted</b><span>An editorial decision has been made. Payment is not yet verified.</span></li><li><b>Payment submitted</b><span>UTR is awaiting manual bank-app / statement verification.</span></li><li><b>Published</b><span>Public article page and author certificates are available.</span></li></ul></div><Link to="/contact" className="text-link">Need help? Contact the journal <ArrowRight size={15}/></Link></aside>
    </div></section>
  </>;
}
