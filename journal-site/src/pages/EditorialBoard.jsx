import { Link } from 'react-router-dom';
import { ArrowRight, Mail, ShieldCheck, UserCog } from 'lucide-react';
import { journal } from '../config';
import Meta from '../components/Meta';

const tiers = [
  { key: 'eic', label: 'Editor-in-Chief', className: 'board-eic' },
  { key: 'associate', label: 'Associate Editors', className: '' },
  { key: 'member', label: 'Editorial Board Members', className: '' },
];

export default function EditorialBoard() {
  const board = Array.isArray(journal.editorialBoard) ? journal.editorialBoard : [];

  return (
    <>
      <Meta
        title="Editorial board"
        description={`Meet the editorial team of ${journal.name}.`}
      />

      <section className="info-hero">
        <div className="container">
          <div className="eyebrow">Editorial team</div>
          <h1>The people behind <em>{journal.shortName}</em>.</h1>
          <p>
            Our editorial board brings together researchers and practitioners
            from across the sciences. Members oversee peer review, uphold
            editorial independence and ensure that every published article
            meets the journal’s standards for rigour and integrity.
          </p>
        </div>
      </section>

      <section className="section section-cream">
        <div className="container">
          {board.length === 0 ? (
            <div className="board-notice">
              <strong>Editorial board profiles are being verified.</strong><br />
              This page will list confirmed members, their roles and
              affiliations. The journal does not publish unverified names.
              For editorial correspondence in the meantime, contact the
              editorial office directly.
            </div>
          ) : (
            tiers.map((tier) => {
              const members = board.filter((m) => (m.tier || 'member') === tier.key);
              if (!members.length) return null;
              return (
                <div className="board-section" key={tier.key}>
                  <div className="board-section-head">
                    <h2>{tier.label}</h2>
                    <span className="count">{members.length}</span>
                  </div>
                  <div className="board-grid">
                    {members.map((member, index) => (
                      <article
                        className={`board-member ${tier.className}`}
                        key={`${member.name}-${index}`}
                      >
                        <strong>{member.name}</strong>
                        <span className="role">{member.role || tier.label}</span>
                        {member.affiliation && (
                          <span className="affiliation">{member.affiliation}</span>
                        )}
                        {member.bio && <p className="bio">{member.bio}</p>}
                      </article>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          <div style={{ marginTop: 40, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/policies" className="button button-light">
              <ShieldCheck size={16} /> Editorial policies
            </Link>
            <Link to="/contact" className="button button-primary">
              <Mail size={16} /> Contact the editorial office
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-surface">
        <div className="container">
          <div className="info-layout">
            <article className="prose">
              <div className="info-block">
                <h2>Editorial independence</h2>
                <p>
                  All editorial decisions are made independently of commercial
                  or institutional interests. A publication fee, where applicable,
                  is assessed after acceptance and does not influence the
                  decision to accept or reject a manuscript.
                </p>
              </div>
              <div className="info-block">
                <h2>Peer review model</h2>
                <p>
                  {journal.shortName} uses a double-blind peer review model.
                  Reviewer and author identities are not disclosed to each other
                  during the review process. Reviewers are selected for subject
                  expertise and absence of conflicts of interest.
                </p>
              </div>
              <div className="info-block">
                <h2>Reviewers</h2>
                <p>
                  Reviewers are invited on a per-manuscript basis from a pool of
                  qualified researchers. Reviewer identities are not published
                  publicly unless a reviewer chooses to disclose their
                  involvement.
                </p>
              </div>
            </article>

            <aside className="info-aside">
              <div className="aside-panel aside-panel-dark">
                <div className="eyebrow eyebrow-light">Join the board</div>
                <h3>Contribute as a reviewer or editor</h3>
                <p style={{ fontSize: 13.5, color: '#c9d6cc', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Researchers interested in joining the editorial team can send
                  a CV and brief statement of expertise to the editorial office.
                </p>
                <a href={`mailto:${journal.contactEmail}`} className="button button-outline-light button-small">
                  <UserCog size={14} /> Express interest
                </a>
              </div>
              <Link to="/guidelines" className="text-link">
                Author guidelines <ArrowRight size={15} />
              </Link>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}