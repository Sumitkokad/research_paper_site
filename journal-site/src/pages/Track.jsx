import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileText, Search } from 'lucide-react';
import { formatDate, post, statusLabel } from '../api';
import Meta from '../components/Meta';
import { Notice, PageIntro } from '../components/Layout';

const progressSteps = [
  { status: 'submitted', label: 'Submitted' },
  { status: 'under_review', label: 'Editorial review' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'payment_submitted', label: 'Payment submitted' },
  { status: 'publishing', label: 'Publishing' },
  { status: 'published', label: 'Published' }
];

const progressRank = {
  submitted: 0,
  under_review: 1,
  revision_requested: 1,
  revision_submitted: 1,
  accepted: 2,
  payment_submitted: 3,
  publishing: 4,
  published: 5
};

export default function Track() {
  const [params, setParams] = useSearchParams();
  const [paperId, setPaperId] = useState(params.get('paperId') || '');
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function lookup(id = paperId) {
    const normalizedId = String(id || '').trim().toUpperCase();
    if (!normalizedId) {
      setError('Enter your Paper ID to check its status.');
      setRecord(null);
      return;
    }

    setError('');
    setRecord(null);
    setBusy(true);
    try {
      // This endpoint returns public status information only. No author token is required.
      const data = await post('/track', { paperId: normalizedId });
      setRecord(data);
      setPaperId(normalizedId);
      // Remove legacy token query parameters from old email links.
      setParams({ paperId: normalizedId }, { replace: true });
    } catch (err) {
      setRecord(null);
      setError(err.message || 'Unable to find this submission. Check the Paper ID and try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initialId = params.get('paperId');
    if (initialId) lookup(initialId);
    // Run only for the initial link on page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRank = record ? (progressRank[record.status] ?? -1) : -1;

  return <>
    <Meta
      title="Track your manuscript"
      description="Check the editorial progress of a journal submission using its Paper ID."
    />
    <PageIntro
      eyebrow="Author services"
      title={<>Track your paper, <em>by reference.</em></>}
      description="Enter the Paper ID from your submission confirmation email. A tracking token is not required for a basic status check."
    />

    <section className="section section-white">
      <div className="container track-layout">
        <div className="track-main">
          <form
            className="track-login"
            onSubmit={(event) => {
              event.preventDefault();
              lookup();
            }}
          >
            <div className="track-lock"><Search size={19} /></div>
            <div>
              <h2>Find your submission</h2>
              <p>Use the Paper ID provided after successful submission.</p>
            </div>
            <label className="field">
              <span>Paper ID</span>
              <input
                value={paperId}
                onChange={(event) => setPaperId(event.target.value)}
                required
                autoComplete="off"
                placeholder="IJSCI-2026-…"
              />
            </label>
            {error && <Notice type="error">{error}</Notice>}
            <button className="button button-primary button-full" disabled={busy}>
              {busy ? 'Checking status…' : 'Track manuscript'} <ArrowRight size={16} />
            </button>
          </form>

          {record && <div className="track-result">
            <div className="track-result-head">
              <div>
                <div className="eyebrow">Submission status</div>
                <h2>{record.title}</h2>
                <span className="muted-small">{record.paperId}</span>
              </div>
              <span className={`status-pill status-${record.status}`}>
                {statusLabel(record.status)}
              </span>
            </div>

            {record.status === 'rejected' && (
              <Notice type="warning">The editorial decision for this submission is Declined. Contact the editorial office for any clarification.</Notice>
            )}
            {record.status === 'unpublished' && (
              <Notice type="warning">This paper is currently unpublished. Contact the editorial office for further information.</Notice>
            )}
            {record.status === 'revision_requested' && (
              <Notice type="warning">
                A revision has been requested. For security, revised manuscript uploads are not available through Paper ID-only tracking. Please use the secure instructions sent by the editorial office or contact the journal.
              </Notice>
            )}

            {currentRank >= 0 && <div className="progress-steps">
              {progressSteps.map((step, index) => {
                const active = currentRank >= index;
                const current = record.status === step.status;
                return <div className={`progress-step ${active ? 'complete' : ''} ${current ? 'current' : ''}`} key={step.status}>
                  <span className="progress-dot">{active ? <CheckCircle2 size={15} /> : index + 1}</span>
                  <span>{step.label}</span>
                </div>;
              })}
            </div>}

            <div className="timeline">
              <div className="timeline-item">
                <span className="timeline-pin"><FileText size={13} /></span>
                <div><strong>Manuscript received</strong><small>{formatDate(record.submittedAt)}</small></div>
              </div>
              {record.publishedAt && <div className="timeline-item">
                <span className="timeline-pin"><CheckCircle2 size={13} /></span>
                <div><strong>Publication date</strong><small>{formatDate(record.publishedAt)}</small></div>
              </div>}
            </div>

            {record.certificates?.length > 0 && <div className="certificate-list">
              <h3>Author certificates</h3>
              {record.certificates.map((certificate) => <a
                key={certificate.certificateId}
                href={certificate.url}
                className="certificate-download"
              >
                <span>
                  <CheckCircle2 size={16} />
                  <span><strong>{certificate.authorName}</strong><small>{certificate.certificateId}</small></span>
                </span>
                <span>Download PDF <ArrowRight size={15} /></span>
              </a>)}
            </div>}

            <p className="muted-small" style={{ marginTop: 20 }}>
              This page displays basic submission status only. Editorial comments and manuscript upload actions are kept private and require author verification.
            </p>
          </div>}
        </div>

        <aside className="track-aside">
          <div className="aside-panel aside-panel-dark">
            <div className="eyebrow eyebrow-light">Status guide</div>
            <h3>What each stage means.</h3>
            <ul className="status-guide">
              <li><b>Submitted</b><span>Your manuscript has been received.</span></li>
              <li><b>Under review</b><span>Editorial screening is in progress.</span></li>
              <li><b>Revision requested</b><span>The editor requires an updated manuscript.</span></li>
              <li><b>Accepted</b><span>An editorial decision has been made. Payment is not yet verified.</span></li>
              <li><b>Payment submitted</b><span>Your UTR is awaiting manual verification.</span></li>
              <li><b>Published</b><span>The article and author certificates are available.</span></li>
            </ul>
          </div>
          <Link to="/contact" className="text-link">Need help? Contact the journal <ArrowRight size={15} /></Link>
        </aside>
      </div>
    </section>
  </>;
}
