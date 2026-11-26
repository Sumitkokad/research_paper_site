import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

import { api, post } from '../api';
import Meta from '../components/Meta';
import { Loading, Notice } from '../components/Layout';

const inr = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount || 0);

export default function Pay() {
  const { id } = useParams();
  const [params] = useSearchParams();

  const token = params.get('token') || '';

  const [payment, setPayment] = useState(null);
  const [qr, setQr] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copyState, setCopyState] = useState('idle'); // idle | copied | failed

  // Load secure payment details and generate the UPI QR code.
  useEffect(() => {
    let cancelled = false;

    async function loadPayment() {
      setLoading(true);
      setError('');
      setPayment(null);
      setQr('');
      setQrFailed(false);

      if (!token) {
        setError('A valid payment token from the acceptance email is required.');
        setLoading(false);
        return;
      }

      try {
        const data = await api(
          `/pay/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
        );

        if (cancelled) return;

        setPayment(data);

        try {
          const qrData = await QRCode.toDataURL(data.uri, {
            width: 320,
            margin: 2,
            errorCorrectionLevel: 'M'
          });

          if (!cancelled) setQr(qrData);
        } catch {
          // The UPI ID and the "Open UPI app" link still work without the QR.
          if (!cancelled) setQrFailed(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to load payment details.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPayment();

    return () => {
      cancelled = true;
    };
  }, [id, token]);

  // Submit the 12-digit UTR.
  async function handlePaymentSubmit(event) {
    event.preventDefault();

    setError('');
    setSuccess('');

    const reference = utr.trim();

    if (!/^\d{12}$/.test(reference)) {
      setError('Enter the 12-digit UTR shown in your UPI app.');
      return;
    }

    setBusy(true);

    try {
      const result = await post('/payment', {
        paperId: id,
        token,
        utr: reference,
        note: note.trim()
      });

      setSuccess(
        result.message ||
          'Payment reference submitted. The editorial office will verify it against the received transaction.'
      );

      setPayment((current) => ({
        ...current,
        submitted: true
      }));

      setUtr('');
      setNote('');
    } catch (err) {
      setError(err.message || 'Unable to submit the payment reference.');
    } finally {
      setBusy(false);
    }
  }

  // Copy the UPI ID.
  async function copyVpa() {
    if (!payment?.vpa) return;

    try {
      await navigator.clipboard.writeText(payment.vpa);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }

    window.setTimeout(() => setCopyState('idle'), 1800);
  }

  const submitted = Boolean(success) || Boolean(payment?.submitted);

  return (
    <>
      <Meta
        title="Publication payment"
        description="Submit UPI payment details for an accepted manuscript."
      />

      <section className="pay-page">
        <div className="container pay-container">
          <Link to="/track" className="back-link">
            <ArrowLeft size={15} />
            Back to author services
          </Link>

          {loading ? (
            <Loading label="Checking secure payment link" />
          ) : error && !payment ? (
            <div className="pay-problem">
              <Notice type="error">{error}</Notice>
              <p>Ask the editorial office to issue a fresh payment link.</p>
              <Link className="button button-light" to="/contact">
                Contact journal <ArrowRight size={15} />
              </Link>
            </div>
          ) : payment ? (
            <>
              <header className="pay-header">
                <span className="eyebrow">Accepted manuscript</span>
                <h1>Pay the publication fee</h1>
                <p>
                  Pay by UPI, then enter the transaction reference. The
                  editorial office checks it manually before your paper is
                  published.
                </p>
              </header>

              <div className="pay-layout">
                {/* ---------- Summary ---------- */}
                <aside className="pay-summary" aria-label="Payment summary">
                  <h2>Payment summary</h2>

                  <dl className="pay-facts">
                    <div>
                      <dt>Paper ID</dt>
                      <dd className="pay-mono">{payment.paperId}</dd>
                    </div>
                    <div>
                      <dt>Manuscript</dt>
                      <dd>{payment.title}</dd>
                    </div>
                  </dl>

                  <div className="pay-amount">
                    <span>Amount due</span>
                    <strong>{inr(payment.amount)}</strong>
                  </div>

                  <div className="pay-assurance">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <p>
                      Payment is not confirmed automatically. Your paper is
                      published only after an administrator matches the UTR
                      to the received transaction.
                    </p>
                  </div>
                </aside>

                {/* ---------- Steps ---------- */}
                <div className="pay-steps">
                  <section className="pay-card" aria-labelledby="pay-step-1">
                    <header className="pay-card-head">
                      <span className="pay-step-no" aria-hidden="true">1</span>
                      <div>
                        <h2 id="pay-step-1">Pay with UPI</h2>
                        <p>Scan the code, or open your UPI app on this device.</p>
                      </div>
                    </header>

                    <div className="pay-method">
                      <div className="pay-qr">
                        {qr ? (
                          <img src={qr} alt="UPI payment QR code" />
                        ) : qrFailed ? (
                          <p className="pay-qr-fallback">
                            QR code unavailable. Use the UPI ID instead.
                          </p>
                        ) : (
                          <div className="pay-qr-skeleton" aria-hidden="true" />
                        )}
                      </div>

                      <div className="pay-payee">
                        <div className="pay-payee-row">
                          <span className="pay-label">Beneficiary</span>
                          <strong>{payment.payeeName}</strong>
                        </div>

                        <div className="pay-payee-row">
                          <span className="pay-label">UPI ID</span>
                          <div className="pay-vpa">
                            <code>{payment.vpa}</code>
                            <button
                              type="button"
                              className="pay-copy"
                              onClick={copyVpa}
                              aria-label="Copy UPI ID"
                            >
                              {copyState === 'copied' ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                              {copyState === 'copied'
                                ? 'Copied'
                                : copyState === 'failed'
                                  ? 'Copy failed'
                                  : 'Copy'}
                            </button>
                          </div>
                        </div>

                        {payment.uri && (
                          <a
                            className="button button-primary button-full"
                            href={payment.uri}
                          >
                            <Smartphone size={16} />
                            Open UPI app
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="pay-warning" role="note">
                      <strong>Check before you pay.</strong> Your UPI app should
                      show the beneficiary above and the amount{' '}
                      {inr(payment.amount)}. UPI apps may show the
                      bank-verified account name instead of the name in the QR.
                      Do not pay if the name is unexpected.
                    </div>
                  </section>

                  <section className="pay-card" aria-labelledby="pay-step-2">
                    <header className="pay-card-head">
                      <span className="pay-step-no" aria-hidden="true">2</span>
                      <div>
                        <h2 id="pay-step-2">Enter the transaction reference</h2>
                        <p>
                          After paying, copy the 12-digit UTR from your UPI app.
                        </p>
                      </div>
                    </header>

                    {submitted ? (
                      <div className="pay-success" role="status">
                        <CheckCircle2 size={20} aria-hidden="true" />
                        <p>
                          {success ||
                            'A payment reference has already been submitted. The editorial office will verify it.'}
                        </p>
                      </div>
                    ) : (
                      <form className="pay-form" onSubmit={handlePaymentSubmit}>
                        {error && <Notice type="error">{error}</Notice>}

                        <label className="field">
                          <span>
                            UTR / transaction reference <b>*</b>
                          </span>

                          <input
                            className="pay-utr"
                            value={utr}
                            onChange={(e) =>
                              setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))
                            }
                            inputMode="numeric"
                            autoComplete="off"
                            pattern="[0-9]{12}"
                            minLength={12}
                            maxLength={12}
                            placeholder="123456789012"
                            required
                          />

                          <small className="pay-counter">{utr.length}/12 digits</small>
                        </label>

                        <label className="field">
                          <span>Note for the accounts team (optional)</span>
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value.slice(0, 180))}
                            maxLength={180}
                            placeholder="Anything we should know about this payment"
                          />
                        </label>

                        <button
                          className="button button-gold button-full"
                          type="submit"
                          disabled={busy || utr.length !== 12}
                        >
                          {busy ? 'Submitting…' : 'Submit payment reference'}
                          <ArrowRight size={16} />
                        </button>
                      </form>
                    )}
                  </section>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}