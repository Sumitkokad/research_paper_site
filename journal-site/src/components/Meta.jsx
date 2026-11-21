import { useEffect } from 'react';
import { journal } from '../config';

export default function Meta({ title, description, canonical, image, paper }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${journal.shortName}` : `${journal.shortName} — ${journal.name}`;
    document.title = fullTitle;
    const set = (selector, attr, value) => {
      let tag = document.head.querySelector(selector);
      if (!value) { tag?.remove(); return; }
      if (!tag) { tag = document.createElement('meta'); document.head.appendChild(tag); }
      tag.setAttribute(attr, value);
    };
    set('meta[name="description"]', 'name', 'description');
    set('meta[name="description"]', 'content', description || journal.description);
    set('meta[property="og:title"]', 'property', 'og:title');
    set('meta[property="og:title"]', 'content', fullTitle);
    set('meta[property="og:description"]', 'property', 'og:description');
    set('meta[property="og:description"]', 'content', description || journal.description);
    set('meta[property="og:url"]', 'property', 'og:url');
    set('meta[property="og:url"]', 'content', canonical || window.location.href);
    set('meta[property="og:image"]', 'property', 'og:image');
    set('meta[property="og:image"]', 'content', image || '');
    let canonicalTag = document.head.querySelector('link[rel="canonical"]');
    if (!canonicalTag) { canonicalTag = document.createElement('link'); canonicalTag.rel = 'canonical'; document.head.appendChild(canonicalTag); }
    canonicalTag.href = canonical || window.location.href;

    document.head.querySelectorAll('[data-paper-meta="true"]').forEach((tag) => tag.remove());
    if (paper) {
      const add = (name, content) => {
        if (!content) return;
        const tag = document.createElement('meta');
        tag.name = name;
        tag.content = content;
        tag.dataset.paperMeta = 'true';
        document.head.appendChild(tag);
      };
      add('citation_title', paper.title);
      (paper.authors || []).forEach((author) => add('citation_author', author.name));
      add('citation_publication_date', paper.publishedAt ? new Date(paper.publishedAt).toISOString().slice(0, 10) : '');
      add('citation_pdf_url', `${journal.siteUrl}${paper.pdfUrl}`);
      add('citation_issn', paper.issn || journal.issn);
      add('citation_volume', paper.volume);
      add('citation_issue', paper.issue);
      if (paper.doi) add('citation_doi', paper.doi);
    }
    return () => document.head.querySelectorAll('[data-paper-meta="true"]').forEach((tag) => tag.remove());
  }, [title, description, canonical, image, paper]);
  return null;
}
