import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BadgeCheck, Download, ShieldCheck, XCircle } from 'lucide-react';
import { api, formatDate } from '../api';
import Meta from '../components/Meta';
import { Loading, Notice } from '../components/Layout';

export default function Verify() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api(`/verify/${encodeURIComponent(id)}`)
      .then((data) => setResult(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <Meta title="Certificate verification" description="Verify an IJROS author certificate by its certificate ID." />
      
      <section className="verify-page">
        <div className="container verify-container">
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Journal home
          </Link>
          
          <div className="verify-card">
            {loading ? (
              <Loading label="Verifying certificate record" />
            ) : result?.valid ? (
              <>
                <div className="verify-symbol"><BadgeCheck size={36} /></div>
                <div className="eyebrow">Public verification record</div>
                <h1>Certificate <em>verified.</em></h1>
                <Notice type="success">
                  <ShieldCheck size={18} /> A matching certificate record exists in the journal archive.
                </Notice>
                
                <div className="verify-fields">
                  <div>
                    <span>Certificate ID</span>
                    <strong>{result.certificateId}</strong>
                  </div>
                  <div>
                    <span>Certificate issued to</span>
                    <strong>{result.authorName}</strong>
                  </div>
                  <div>
                    <span>Paper ID</span>
                    <strong>{result.paperId}</strong>
                  </div>
                  <div>
                    <span>Research paper</span>
                    <strong>{result.paperTitle}</strong>
                  </div>
                  <div>
                    <span>Publication date</span>
                    <strong>{formatDate(result.publishedAt)}</strong>
                  </div>
                  {result.volume && (
                    <div>
                      <span>Archive</span>
                      <strong>{result.volume} {result.issue}</strong>
                    </div>
                  )}
                  {result.doi && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span>DOI</span>
                      <strong>{result.doi}</strong>
                    </div>
                  )}
                </div>
                
                <a href={result.downloadUrl} className="button button-primary button-full" target="_blank" rel="noreferrer">
                  <Download size={18} /> Download verified certificate
                </a>
                
                <Link to={`/papers/${result.paperId}`} className="text-link" style={{ marginTop: '16px' }}>
                  View published paper <ArrowUpRight size={16} />
                </Link>
              </>
            ) : (
              <>
                <div className="verify-symbol invalid"><XCircle size={36} /></div>
                <div className="eyebrow">Public verification record</div>
                <h1>Record <em>not found.</em></h1>
                <Notice type="error">
                  {error || 'No matching published certificate was found.'}
                </Notice>
                <p className="verify-help">
                  Check the certificate ID and try again. A certificate is verifiable only after the corresponding paper is published.
                </p>
                <Link to="/contact" className="button button-light">Contact editorial office</Link>
              </>
            )}
          </div>
          
          <p className="verify-foot">
            This page confirms whether a certificate ID exists in the journal’s published records. It does not independently certify the academic quality of the underlying research.
          </p>
        </div>
      </section>
    </>
  );
}