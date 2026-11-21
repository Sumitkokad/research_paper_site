import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, ShieldCheck, Smartphone } from 'lucide-react';
import { api, post } from '../api';
import Meta from '../components/Meta';
import { Loading, Notice } from '../components/Layout';

const inr = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount || 0);
export default function Pay() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [payment, setPayment] = useState(null);
  const [qr, setQr] = useState('');
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!token) { setError('A valid payment token from the acceptance email is required.'); setLoading(false); return; }
    api(`/pay/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`).then(async (data) => { setPayment(data); setQr(await QRCode.toDataURL(data.uri, { width: 320, margin: 2, errorCorrectionLevel: 'M' })); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [id, token]);
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true);
    try { const result = await post('/payment', { paperId: id, token, utr: utr.trim(), note }); setSuccess(result.message); setPayment((current) => ({ ...current, submitted: true })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function copyVpa() { try { await navigator.clipboard.writeText(payment.vpa); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setError('Could not copy the UPI ID.'); } }
  return <>
    <Meta title="Publication payment" description="Submit UPI payment details for an accepted manuscript."/>
    <section className="payment-page"><div className="container payment-container"><Link to="/track" className="back-link"><ArrowLeft size={15}/> Back to author services</Link>
      {loading ? <Loading label="Checking secure payment link"/> : error && !payment ? <div className="payment-error"><Notice type="error">{error}</Notice><p>Ask the editorial office to issue a fresh payment link.</p><Link className="button button-light" to="/contact">Contact journal <ArrowRight size={15}/></Link></div> : payment ? <div className="payment-grid"><div className="payment-copy"><div className="eyebrow">Accepted manuscript · Payment step</div><h1>Complete your<br/><em>publication fee.</em></h1><p className="payment-intro">Your manuscript has an acceptance decision. This step records your UPI payment for manual verification by the editorial office.</p><div className="payment-summary"><div><span>Paper ID</span><strong>{payment.paperId}</strong></div><div><span>Manuscript</span><strong>{payment.title}</strong></div><div><span>Amount due</span><strong className="amount-text">{inr(payment.amount)}</strong></div></div><div className="payment-security"><ShieldCheck size={18}/><p>Payment is not confirmed automatically. Your paper will be published only after an administrator checks the UTR against the received transaction.</p></div></div>
        <div className="payment-card"><div className="payment-card-head"><span className="payment-step">01</span><div><h2>Scan to pay with UPI</h2><p>Open any UPI app and scan this paper-specific QR code.</p></div></div><div className="qr-frame">{qr ? <img src={qr} alt="UPI payment QR code"/> : <div className="qr-placeholder"/>}</div><div className="payee-info"><span>Verified beneficiary in your UPI app</span><strong>{payment.payeeName}</strong><div><span className="upi-id">{payment.vpa}</span><button type="button" className="copy-button" onClick={copyVpa} aria-label="Copy UPI ID"><Copy size={14}/>{copied ? 'Copied' : 'Copy'}</button></div></div><a className="button button-primary button-full" href={payment.uri}><Smartphone size={16}/> Open UPI app</a><div className="payment-warning"><strong>Important:</strong> Before authorising payment, confirm that your UPI app shows the correct beneficiary name and the amount {inr(payment.amount)}. Do not pay if the verified name is unexpected. UPI apps may show the bank-verified account name instead of the name embedded in a QR.</div>
          {success ? <Notice type="success"><CheckCircle2 size={16}/> {success}</Notice> : <form className="utr-form" onSubmit={submit}><div className="payment-card-head second"><span className="payment-step">02</span><div><h2>Submit transaction reference</h2><p>After completing the transfer, enter the 12-digit UTR shown by your UPI app.</p></div></div>{error && <Notice type="error">{error}</Notice>}<label className="field"><span>12-digit UTR / reference <b>*</b></span><input value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" autoComplete="off" pattern="[0-9]{12}" minLength={12} maxLength={12} placeholder="e.g. 123456789012" required/><small>{utr.length}/12 digits</small></label><label className="field"><span>Optional note</span><input value={note} onChange={(e) => setNote(e.target.value.slice(0, 180))} maxLength={180} placeholder="Any note for the accounts team"/></label><button className="button button-gold button-full" type="submit" disabled={busy || utr.length !== 12}>{busy ? 'Submitting UTR…' : 'Submit payment reference'} <ArrowRight size={16}/></button></form>}
        </div></div> : null}
    </div></section>
  </>;
}
