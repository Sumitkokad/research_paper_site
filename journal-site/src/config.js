export const journal = {
  name: 'International Journal of Sciences and Innovation Engineering',
  shortName: 'IJSCI',
  tagline: 'A digital home for research and innovation',
  description: 'An independent journal platform for scholarly work across science, technology and engineering.',
  siteUrl: import.meta.env.VITE_SITE_URL || window.location.origin,
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL || 'editorial@your-journal-domain.example',
  issn: import.meta.env.VITE_ISSN || '',
  decisionTarget: '1–2 business days',
  editorialBoard: [],
  blogs: [
    { slug: 'prepare-your-research-paper', title: 'Preparing a research paper for journal submission', category: 'Author resources', date: '2026-11-01', read: '6 min read', excerpt: 'A practical checklist for a clear manuscript, structured abstract, references and supporting files.', body: ['Start with a precise research question and a title that reflects the actual scope of your work.', 'Use a consistent structure: abstract, keywords, introduction, methodology, results, discussion, conclusion and references where appropriate.', 'Check that tables, figures, citations and author affiliations are accurate. Remove identifying details from a blinded manuscript when the journal requests it.', 'Before submitting, confirm that all authors have approved the manuscript and that permissions, funding statements and conflict disclosures are complete.'] },
    { slug: 'understanding-editorial-review', title: 'What happens after you submit a manuscript?', category: 'Editorial process', date: '2026-10-18', read: '5 min read', excerpt: 'Understand the stages between submission, editorial screening, revision and a final decision.', body: ['A submission is first checked for file integrity, scope, completeness and basic publication requirements.', 'The editor may request a revision, decline the submission or move it to the next stage. A request for revision is not an acceptance.', 'An acceptance decision and publication are separate from payment confirmation. The journal records each stage in the author tracking timeline.', 'Authors should respond to editorial comments point by point and upload a clean revised PDF using the secure tracking link.'] },
    { slug: 'citation-metadata-basics', title: 'Why accurate citation metadata matters', category: 'Research visibility', date: '2026-09-30', read: '4 min read', excerpt: 'Correct titles, author names, affiliations and publication dates improve citation accuracy.', body: ['Article titles and author names should match the final manuscript exactly.', 'List each author separately and keep affiliations distinct from author names. Add ORCID identifiers only when they belong to the named author.', 'A journal should display a DOI only after it has been registered with an authorized DOI registration agency. A local article number is not a DOI.', 'Search visibility is not guaranteed by adding metadata; indexing services make their own inclusion and crawling decisions.'] }
  ]
};

export const articleTypes = ['Research Article', 'Review Article', 'Case Study', 'Short Communication', 'Technical Note'];
export const subjects = ['Computer Science', 'Engineering', 'Applied Sciences', 'Mathematics', 'Life Sciences', 'Physical Sciences', 'Interdisciplinary'];
