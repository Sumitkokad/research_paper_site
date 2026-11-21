import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileUp, Plus, Trash2 } from 'lucide-react';
import { post } from '../api';
import { articleTypes, journal, subjects } from '../config';
import Meta from '../components/Meta';
import { Notice, PageIntro } from '../components/Layout';

const blankAuthor = () => ({ name: '', affiliation: '', orcid: '' });
const MAX_PDF_BYTES = 4 * 1024 * 1024;
export default function Submit() {
  const [authors, setAuthors] = useState([blankAuthor()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  function updateAuthor(index, field, value) { setAuthors((current) => current.map((author, i) => i === index ? { ...author, [field]: value } : author)); }
  function addAuthor() { if (authors.length < 5) setAuthors((current) => [...current, blankAuthor()]); }
  function removeAuthor(index) { setAuthors((current) => current.filter((_, i) => i !== index)); }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');

    const formElement = event.currentTarget;
    const fileInput = formElement.elements.namedItem('manuscript');
    const file = fileInput?.files?.[0];

    if (!file) {
      setError('Please choose your research paper PDF before submitting.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('The PDF is too large. Netlify uploads must be 4 MB or smaller.');
      return;
    }

    setBusy(true);
    try {
      const signature = await file.slice(0, 5).text();
      if (signature !== '%PDF-') {
        throw new Error('The selected file is not a valid PDF. Please export the manuscript as a PDF and try again.');
      }

      const form = new FormData(formElement);
      form.set('authors', JSON.stringify(authors));
      const response = await post('/submit', form);
      if (!response?.ok || !response?.paperId) {
        throw new Error(response?.error || 'The server did not confirm the manuscript submission. Please try again.');
      }
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'The manuscript could not be submitted. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <>
    <Meta title="Submit a manuscript" description="Submit your research manuscript to the IJSCI editorial office."/>
    <PageIntro eyebrow="Author centre" title={<>Submit your<br/><em>manuscript.</em></>} description="Share your research with the editorial office. The corresponding author receives a private paper reference and tracking token by email."/>
    <section className="section section-white"><div className="container form-page-grid">
      <div className="form-main">
        {result ? <div className="submission-success"><div className="success-check">✓</div><div className="eyebrow">Submission received</div><h2>Your paper is in the <em>editorial queue.</em></h2><p>{result.message}</p><div className="reference-box"><span>Paper reference</span><strong>{result.paperId}</strong></div><Notice type={result.emailSent ? 'success' : 'warning'}>{result.emailSent ? 'A tracking link and private token have been sent to the corresponding author email.' : 'Email delivery could not be confirmed. Save your paper ID and use “Claim tracking access” on the Track page to request a new token.'}</Notice><div className="form-actions"><Link className="button button-primary" to="/track">Track submission <ArrowRight size={16}/></Link><Link className="text-link" to="/">Return home</Link></div></div> : <form className="journal-form" onSubmit={submit}>
          {error && <Notice type="error">{error}</Notice>}
          <div className="form-section-title"><span>01</span><div><h2>Manuscript details</h2><p>Enter the information exactly as it should appear in the journal record.</p></div></div>
          <label className="field"><span>Full paper title <b>*</b></span><input name="title" required minLength="8" maxLength="260" placeholder="Enter the complete research title"/></label>
          <div className="field-two"><label className="field"><span>Subject / category <b>*</b></span><select name="category" required defaultValue=""><option value="" disabled>Select a subject</option>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label className="field"><span>Article type <b>*</b></span><select name="articleType" required defaultValue="Research Article">{articleTypes.map((type) => <option key={type}>{type}</option>)}</select></label></div>
          <label className="field"><span>Abstract <b>*</b></span><textarea name="abstract" required minLength="40" maxLength="5000" rows="6" placeholder="Provide a concise summary of the research question, methods, results and conclusion."/></label>
          <label className="field"><span>Keywords</span><input name="keywords" maxLength="500" placeholder="Comma-separated keywords"/><small>Up to 12 keywords.</small></label>

          <div className="form-section-title author-title"><span>02</span><div><h2>Author information</h2><p>Add up to five authors in the order they should appear on the paper and certificates.</p></div><span className="author-limit">{authors.length}/5</span></div>
          {authors.map((author, index) => <div className="author-block" key={index}><div className="author-block-head"><strong>{index === 0 ? 'Corresponding / first author' : `Co-author ${index + 1}`}</strong>{index > 0 && <button type="button" className="icon-button danger" onClick={() => removeAuthor(index)} aria-label={`Remove author ${index + 1}`}><Trash2 size={15}/></button>}</div><div className="field-two"><label className="field"><span>Author full name <b>*</b></span><input value={author.name} onChange={(e) => updateAuthor(index, 'name', e.target.value)} required maxLength="120" placeholder="As it should appear on the certificate"/></label><label className="field"><span>Affiliation <b>*</b></span><input value={author.affiliation} onChange={(e) => updateAuthor(index, 'affiliation', e.target.value)} required maxLength="180" placeholder="Institution / organisation"/></label></div><label className="field"><span>ORCID iD <small>(optional)</small></span><input value={author.orcid} onChange={(e) => updateAuthor(index, 'orcid', e.target.value)} maxLength="40" placeholder="0000-0000-0000-0000"/></label></div>)}
          {authors.length < 5 && <button type="button" className="add-author" onClick={addAuthor}><Plus size={16}/> Add another author</button>}
          <div className="form-section-title"><span>03</span><div><h2>Corresponding author &amp; file</h2><p>We will send the private tracking access to this email address.</p></div></div>
          <div className="field-two"><label className="field"><span>Corresponding author name <b>*</b></span><input name="submitterName" required maxLength="120" placeholder="Contact person"/></label><label className="field"><span>Corresponding author email <b>*</b></span><input name="submitterEmail" type="email" required maxLength="180" placeholder="name@example.com"/></label></div>
          <label className="field file-field"><span>Research paper PDF <b>*</b></span><input name="manuscript" type="file" accept="application/pdf,.pdf" required onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setError(''); }}/><small>PDF only · Maximum 4 MB. The file is checked before upload.</small><span className="file-hint" title={selectedFile?.name || 'Choose manuscript PDF'}><FileUp size={18}/>{selectedFile ? `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'Choose manuscript PDF'}</span></label>
          <label className="honeypot" aria-hidden="true">Leave this field empty<input name="website" tabIndex="-1" autoComplete="off"/></label>
          <label className="check-field"><input type="checkbox" required/><span>I confirm that all listed authors have approved this submission, the information is accurate, and the manuscript is not being submitted in violation of another publisher’s rights.</span></label>
          <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? 'Submitting manuscript…' : 'Submit manuscript'} <ArrowRight size={16}/></button>
          <p className="form-footnote">An initial editorial update is targeted within {journal.decisionTarget}. This is a service target, not an acceptance guarantee. No fee is collected at the submission stage.</p>
        </form>}
      </div>
      <aside className="form-aside"><div className="aside-sticky"><div className="aside-panel"><div className="eyebrow">Before you submit</div><h3>A few things to prepare.</h3><ul className="check-list"><li>Final manuscript saved as a readable PDF.</li><li>Names and affiliations checked with all authors.</li><li>Abstract and keywords match the manuscript.</li><li>Permissions and research ethics statements are ready.</li><li>Corresponding author email is accessible.</li></ul></div><div className="aside-panel aside-panel-dark"><div className="eyebrow eyebrow-light">What happens next?</div><ol className="number-list"><li><b>Editorial screening</b><span>Completeness and scope check.</span></li><li><b>Decision or revision</b><span>Updates sent by email.</span></li><li><b>Payment review</b><span>Manual UTR verification after acceptance.</span></li><li><b>Publication &amp; certificates</b><span>One unique downloadable certificate per author.</span></li></ol></div><Link className="text-link" to="/guidelines">Read full author guidelines <ArrowRight size={15}/></Link></div></aside>
    </div></section>
  </>;
}
