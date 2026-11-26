import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Mail, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { journal, articleTypes, subjects } from '../config';
import Meta from '../components/Meta';
import { Notice } from '../components/Layout';

/* ============================================================
   ABOUT
   ============================================================ */
export function About() {
  const hasBoard = Array.isArray(journal.editorialBoard) && journal.editorialBoard.length > 0;
  return (
    <>
      <Meta title="About the journal" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">About {journal.shortName}</div>
          <h1>Research with <em>purpose and clarity.</em></h1>
          <p>{journal.description}</p>
        </div>
      </section>

      <section className="section section-cream">
        <div className="container info-layout">
          <article className="prose">
            <div className="info-block">
              <h2>Mission</h2>
              <p>
                {journal.name} exists to make rigorous, original research openly
                accessible. We publish work that advances understanding across
                science, technology, engineering and interdisciplinary fields,
                with an emphasis on clarity, reproducibility and real-world
                relevance.
              </p>
            </div>

            <div className="info-block">
              <h2>Scope</h2>
              <p>Manuscripts are considered in the following broad subject areas:</p>
              <ul>
                {subjects.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>

            <div className="info-block">
              <h2>Peer review model</h2>
              <p>
                All submissions undergo editorial screening followed by
                double-blind peer review by independent experts. Reviewers
                assess originality, methodological rigour, clarity of
                presentation and contribution to the field.
              </p>
            </div>

            <div className="info-block">
              <h2>Open access</h2>
              <p>
                Published articles are freely available under a
                {' '}{journal.openAccessLicense} licence. Readers may download,
                share and adapt the work with attribution. Authors retain
                copyright in their work.
              </p>
            </div>

            <div className="info-block">
              <h2>Publication and identifiers</h2>
              <p>
                Each accepted article is assigned a permanent landing page
                within {journal.shortName}. The article DOI is registered
                through {journal.doiProvider} upon formal publication. Author
                certificates are issued per author and carry a unique,
                publicly verifiable certificate ID.
              </p>
            </div>

            <div className="info-block">
              <h2>Editorial independence</h2>
              <p>
                Editorial decisions are made independently of commercial or
                institutional interests. Where a publication fee applies, it is
                assessed after acceptance and has no influence on the editorial
                outcome. All editorial actions are recorded in a timestamped
                timeline for accountability.
              </p>
            </div>

            <div className="info-block">
              <h2>Editorial board</h2>
              {hasBoard ? (
                <p>
                  Full editorial board profiles are available on the
                  {' '}<Link to="/editorial-board">editorial board page</Link>.
                </p>
              ) : (
                <Notice type="info">
                  Editorial board profiles are being verified. The journal will
                  list each member’s role and affiliation once confirmed. See
                  the <Link to="/editorial-board">editorial board page</Link>.
                </Notice>
              )}
            </div>

            <div className="inline-cta">
              <Link to="/editorial-board" className="button button-light">
                Editorial board <ArrowUpRight size={15} />
              </Link>
              <Link to="/contact" className="button button-primary">
                Contact editorial office <ArrowUpRight size={15} />
              </Link>
            </div>
          </article>

          <aside className="info-aside">
            <div className="aside-panel aside-panel-dark">
              <div className="eyebrow eyebrow-light">Journal principles</div>
              <h3>Clear information at every step.</h3>
              <ul className="check-list">
                <li>Accurate article and author metadata.</li>
                <li>Private author access for tracking.</li>
                <li>Manual UTR verification before publication.</li>
                <li>One unique certificate per author.</li>
                <li>Public QR verification record.</li>
              </ul>
            </div>
            <div className="aside-panel">
              <div className="eyebrow">Identifiers</div>
              <h3>Registered the right way</h3>
              <ul className="check-list">
                <li>{journal.issn || 'ISSN verifying'}</li>
                <li>{journal.doiProvider} DOI on publication</li>
                <li>{journal.openAccessLicense} open licence</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   GUIDELINES
   ============================================================ */
export function Guidelines() {
  return (
    <>
      <Meta title="Author guidelines" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Author centre</div>
          <h1>Prepare a strong <em>submission.</em></h1>
          <p>
            Use this checklist before uploading your manuscript. Submission does
            not guarantee acceptance or publication.
          </p>
        </div>
      </section>

      <section className="section section-cream">
        <div className="container info-layout">
          <article className="prose">
            <div className="info-block">
              <h2>1. Manuscript preparation</h2>
              <p>
                Submit one complete, readable PDF. The manuscript must include
                the article title, author details, abstract, keywords, main text,
                references and any required tables or figures. Save the file
                using the official {journal.shortName} manuscript template.
              </p>
            </div>

            <div className="info-block">
              <h2>2. Author and affiliation details</h2>
              <p>
                List authors in the intended publication order. Provide each
                author’s full name and institutional affiliation. ORCID iDs are
                optional and should be included only when they belong to the
                named author. The system supports up to five authors per
                submission.
              </p>
            </div>

            <div className="info-block">
              <h2>3. Originality and ethics</h2>
              <ul>
                <li>Work must be original and appropriately cited.</li>
                <li>All listed authors must approve the submission.</li>
                <li>Disclose conflicts of interest, funding and permissions.</li>
                <li>Do not submit confidential material you cannot share.</li>
                <li>Do not submit the same manuscript to another journal.</li>
              </ul>
            </div>

            <div className="info-block">
              <h2>4. Editorial screening and revision</h2>
              <p>
                The editorial office may screen for scope, completeness and file
                readability. The editor may request revision, decline the
                submission or accept it. A revision request is not an
                acceptance. Upload revised PDFs through your private tracking
                link; the paper reference stays the same.
              </p>
            </div>

            <div className="info-block">
              <h2>5. Publication and certificates</h2>
              <p>
                After acceptance, follow the payment instructions sent by email.
                Payment is manual — submit your UTR and wait for verification.
                After payment confirmation and final publication checks, the
                article is added to the public archive and one individual
                certificate PDF is generated per author.
              </p>
            </div>

            <div className="info-block">
              <h2>6. Identifiers and indexing</h2>
              <p>
                The article DOI is registered through {journal.doiProvider} only
                after formal publication. Internal paper IDs and certificate IDs
                are not DOIs. The journal does not promise inclusion in Google
                Scholar or any other indexing service.
              </p>
            </div>

            <div className="info-block">
              <h2>7. Initial processing target</h2>
              <p>
                Our current target for an initial editorial update is
                {' '}{journal.decisionTarget}. This is an operational target, not
                a guarantee of acceptance or publication within that period.
              </p>
            </div>

            <div className="inline-cta">
              <Link to="/submit" className="button button-primary">
                Start submission <ArrowUpRight size={15} />
              </Link>
              <a href="/IJROS-Template.docx" download className="button button-light">
                Download template
              </a>
            </div>
          </article>

          <aside className="info-aside">
            <div className="aside-panel aside-panel-dark">
              <div className="eyebrow eyebrow-light">Submission checklist</div>
              <h3>Before you upload</h3>
              <ul className="check-list">
                <li>Complete, readable PDF.</li>
                <li>All authors and affiliations confirmed.</li>
                <li>Abstract and keywords finalised.</li>
                <li>Permissions and ethics statements ready.</li>
                <li>Corresponding author email accessible.</li>
              </ul>
            </div>
            <div className="aside-panel">
              <div className="eyebrow">Article types</div>
              <h3>Accepted types</h3>
              <ul className="check-list">
                {articleTypes.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   FEES
   ============================================================ */
export function Fees() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    api('/config').then(setConfig).catch(() => setConfig({ payment: { ready: false } }));
  }, []);

  return (
    <>
      <Meta title="Publication fees" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Transparent charges</div>
          <h1>Fees and <em>payments.</em></h1>
          <p>
            No payment is collected at initial submission. Payment is requested
            only after an acceptance decision and is subject to manual
            verification.
          </p>
        </div>
      </section>

      <section className="section section-cream">
        <div className="container fee-layout">
          <div className="fee-card">
            <div className="eyebrow">Publication fee</div>
            <h2>
              {config?.payment?.ready
                ? `₹${Number(config.payment.amount).toLocaleString('en-IN')}`
                : 'Shown on acceptance'}
            </h2>
            <p>
              {config?.payment?.ready
                ? 'The configured fee is displayed on the secure paper-specific payment page.'
                : 'The editorial office has not configured a public fee amount yet. The current amount will be stated in the acceptance email and payment page once configured.'}
            </p>
            <div className="fee-divider" />
            <ul className="check-list">
              <li>Payment is requested only after acceptance.</li>
              <li>UPI QR contains a paper-specific transaction reference.</li>
              <li>Authors submit a 12-digit UTR for manual verification.</li>
              <li>A receipt PDF is generated after the payment is confirmed.</li>
              <li>Publication and certificates follow confirmation and final checks.</li>
            </ul>
          </div>

          <div className="prose">
            <div className="info-block">
              <h2>How to pay safely</h2>
              <p>
                Use the secure payment link included in the official acceptance
                email. Before completing a transfer, read the beneficiary name
                shown by your UPI application and compare the displayed amount
                with the journal’s invoice. Do not pay if the beneficiary
                identity or amount is unexpected.
              </p>
              <p>
                The payment details displayed in the UPI app are verified by the
                bank/payment ecosystem. The name written into a QR code cannot
                override the verified beneficiary name. We do not use a payment
                gateway in this version; the editorial office checks each
                submitted UTR manually.
              </p>
            </div>

            <div className="info-block">
              <h2>What the fee covers</h2>
              <ul>
                <li>Article production and typesetting.</li>
                <li>DOI registration through {journal.doiProvider}.</li>
                <li>Permanent hosting of the article landing page.</li>
                <li>One QR-verifiable author certificate per author.</li>
                <li>Payment receipt PDF for the corresponding author.</li>
              </ul>
            </div>

            <div className="info-block">
              <h2>Refunds and disputes</h2>
              <p>
                Any payment dispute, duplicate payment or refund request should
                be sent to the editorial contact with the paper ID, UTR and
                transaction date. Refund eligibility is assessed under the
                published terms and applicable law. Never submit bank passwords,
                PINs or OTPs to anyone.
              </p>
            </div>

            <Notice type="info">
              A payment does not buy acceptance, peer review, indexing or a DOI.
              Editorial decisions are independent of payment.
            </Notice>

            <Link to="/contact" className="text-link">
              Ask a fee question <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   CONTACT
   ============================================================ */
export function Contact() {
  return (
    <>
      <Meta title="Contact the journal" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Get in touch</div>
          <h1>Contact the <em>editorial office.</em></h1>
          <p>
            For submission questions, payment verification, metadata corrections
            or certificate support, contact the journal using its published
            editorial address.
          </p>
        </div>
      </section>

      <section className="section section-cream">
        <div className="container contact-grid">
          <div className="contact-card">
            <div className="contact-icon"><Mail size={22} /></div>
            <div className="eyebrow">Editorial correspondence</div>
            <h2>We’re here to help.</h2>
            <p>
              Use the official journal inbox for all correspondence. Include
              your paper ID when contacting the editorial office about an
              existing submission.
            </p>
            <a className="contact-email" href={`mailto:${journal.contactEmail}`}>
              {journal.contactEmail} <ArrowUpRight size={15} />
            </a>
            
          </div>

          <div className="prose">
            <div className="info-block">
              <h2>What to include</h2>
              <ul>
                <li><strong>Submission enquiry</strong> — manuscript title, corresponding author and submission date.</li>
                <li><strong>Payment enquiry</strong> — paper ID, submitted UTR and transaction date. Never email your UPI PIN, OTP or banking password.</li>
                <li><strong>Certificate correction</strong> — certificate ID, the exact name spelling requested and supporting context.</li>
                <li><strong>Privacy or deletion request</strong> — identify the data concerned and explain the request.</li>
              </ul>
            </div>
            <div className="inline-cta">
              <Link to="/track" className="button button-light">
                Track a paper <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   POLICIES
   ============================================================ */
export function Policies() {
  return (
    <>
      <Meta title="Editorial and publication policies" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Journal policies</div>
          <h1>Trust is built <em>into the process.</em></h1>
          <p>
            Policies for editorial screening, decisions, payment handling,
            publication records and certificate verification.
          </p>
        </div>
      </section>
      <section className="section section-cream">
        <div className="container prose narrow-prose">
          <div className="info-block">
            <h2>Editorial decisions</h2>
            <p>
              Submissions may be screened for scope, completeness, formatting and
              integrity concerns. The editorial office may request revisions,
              decline a submission or accept it. Payment does not determine an
              editorial decision.
            </p>
          </div>
          <div className="info-block">
            <h2>Research integrity</h2>
            <p>
              Authors are responsible for originality, appropriate citation,
              permissions, research ethics, authorship approval and disclosure
              of competing interests. Suspected plagiarism, falsification,
              duplicate submission or authorship disputes may lead to
              clarification, correction, rejection or withdrawal.
            </p>
          </div>
          <div className="info-block">
            <h2>Corrections and withdrawal</h2>
            <p>
              Published metadata may be corrected by the editor where
              appropriate. Unpublishing a record requires an internal reason and
              creates a timeline event. Where a paper is withdrawn, its public
              landing page may be restricted while the administrative record is
              retained.
            </p>
          </div>
          <div className="info-block">
            <h2>Payment handling</h2>
            <p>
              Payment is manual in this release. The site displays a UPI QR with
              a paper reference. Authors submit a UTR; an administrator compares
              it with the actual received transaction before confirming payment.
              A submitted UTR alone is not proof of payment.
            </p>
          </div>
          <div className="info-block">
            <h2>Certificates</h2>
            <p>
              Certificates are generated only after publication is completed.
              Each author is issued a separate certificate ID and PDF. The
              public verification page checks the ID against the journal’s
              published records. A certificate confirms a record in this system;
              it does not independently certify the scientific quality of a
              paper.
            </p>
          </div>
          <div className="info-block">
            <h2>Identifiers and indexing</h2>
            <p>
              Internal paper IDs and certificate IDs are not DOIs. The journal
              displays an ISSN only if the assigned number has been entered by
              the administrator after verification. Article DOIs are registered
              through {journal.doiProvider} on formal publication. No third-party
              indexing or accreditation status is claimed by default.
            </p>
          </div>
          <div className="info-block">
            <h2>Complaints</h2>
            <p>
              Direct publication, payment, editorial or certificate complaints to
              the journal contact address. Provide the relevant paper or
              certificate ID and supporting evidence, without including
              passwords, PINs or OTPs.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   TERMS
   ============================================================ */
export function Terms() {
  return (
    <>
      <Meta title="Terms of use" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Legal information</div>
          <h1>Terms of <em>use.</em></h1>
          <p>
            Terms for accessing this journal website and submitting research
            through its digital workflow.
          </p>
        </div>
      </section>
      <section className="section section-cream">
        <div className="container prose narrow-prose">
          <div className="info-block">
            <h2>Use of the platform</h2>
            <p>
              Use the website only for lawful research and publishing-related
              purposes. Do not attempt to access another author’s tracking
              record, interfere with the system, upload malicious files or
              impersonate an author or editor.
            </p>
          </div>
          <div className="info-block">
            <h2>Author responsibility</h2>
            <p>
              Authors are responsible for the accuracy of submitted information,
              author consent, permissions and the rights to upload the
              manuscript. Submitting a paper does not create a promise of
              acceptance, publication, indexing or a DOI.
            </p>
          </div>
          <div className="info-block">
            <h2>Editorial discretion</h2>
            <p>
              The editorial office may request clarification or revision, reject
              a submission, correct metadata or unpublish a record with a
              recorded reason. An initial response target is not a guarantee of
              publication timing.
            </p>
          </div>
          <div className="info-block">
            <h2>Payments</h2>
            <p>
              Where a fee applies, it is shown on the official acceptance and
              payment pages. Payments remain subject to manual verification.
              Authors should confirm the verified beneficiary name and amount in
              their UPI app before authorising a transfer.
            </p>
          </div>
          <div className="info-block">
            <h2>Website availability</h2>
            <p>
              The journal uses GitHub for historical backups and a
              cloud-hosted backend for records. Temporary service interruptions,
              external API limits or email-delivery failures may delay status
              updates. Authors should retain their paper ID and use the access
              recovery flow where needed.
            </p>
          </div>
          <div className="info-block">
            <h2>Changes</h2>
            <p>
              These terms may be updated as the platform and journal policies
              evolve. The latest version will be published on this page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   PRIVACY
   ============================================================ */
export function Privacy() {
  return (
    <>
      <Meta title="Privacy notice" />
      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Privacy & data</div>
          <h1>Your information, <em>handled with care.</em></h1>
          <p>
            This notice explains what the journal platform stores, why it is
            used, where it is hosted and how to make a data request.
          </p>
        </div>
      </section>
      <section className="section section-cream">
        <div className="container prose narrow-prose">
          <div className="privacy-callout">
            <ShieldCheck size={20} />
            <p>
              This is an operational privacy notice template, not a legal
              certification. Confirm the final wording, retention periods and
              contact details for your journal before accepting submissions.
            </p>
          </div>
          <div className="info-block">
            <h2>Information collected</h2>
            <p>
              The platform may collect manuscript titles, abstracts, keywords,
              subject categories, article type, author and co-author names,
              affiliations, optional ORCID identifiers, corresponding-author
              email, uploaded PDF files, submission versions, editorial comments,
              status history, payment UTRs, payment amounts and certificate
              records. Basic security logs such as request timestamps and
              rate-limit counters may also be stored.
            </p>
          </div>
          <div className="info-block">
            <h2>Why information is used</h2>
            <p>
              Information is used to receive and screen submissions, communicate
              editorial decisions, request revisions, manage accepted-paper
              payments, publish article metadata, generate author certificates,
              prevent abuse, maintain an audit trail and respond to support or
              legal requests.
            </p>
          </div>
          <div className="info-block">
            <h2>Storage and service providers</h2>
            <p>
              Manuscript files and journal records are stored in the journal’s
              cloud backend and document storage. The public site is hosted on
              Netlify. Email notifications are sent using the SMTP provider
              configured by the journal. These providers process data according
              to their own terms and privacy documentation.
            </p>
          </div>
          <div className="info-block">
            <h2>Public information</h2>
            <p>
              For papers marked published, the journal may publicly display the
              title, abstract, author names, affiliations, article type, subject,
              publication date, archive details and any verified DOI or ISSN
              entered by the editor. Corresponding-author email, tracking
              tokens, UTRs, editorial comments and private administrative notes
              are not included in the public article record.
            </p>
          </div>
          <div className="info-block">
            <h2>Retention and deletion requests</h2>
            <p>
              Submission files, payment receipts, publication metadata and
              decision histories may be retained for operational, accounting,
              dispute-resolution and publication-integrity reasons. Authors may
              request access, correction or deletion by writing to the journal
              contact address and identifying the relevant paper ID.
            </p>
          </div>
          <div className="info-block">
            <h2>Security</h2>
            <p>
              Administrator access uses a signed, HTTP-only session cookie.
              Author tracking uses a private token. Payment and administrator
              secrets are held in server-side environment variables and should
              never be placed in public frontend code. No online system can
              guarantee absolute security; report suspected unauthorised access
              promptly.
            </p>
          </div>
          <div className="info-block">
            <h2>Contact</h2>
            <p>
              For privacy questions or data requests, contact
              {' '}<a href={`mailto:${journal.contactEmail}`}>{journal.contactEmail}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}