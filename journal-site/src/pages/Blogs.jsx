import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { journal } from '../config';
import Meta from '../components/Meta';
import { EmptyState, PageIntro } from '../components/Layout';
import { formatDate } from '../api';

export function Blogs() {
  return <><Meta title="Research and author resources"/><PageIntro eyebrow="Journal insights" title={<>Notes for the<br/><em>research community.</em></>} description="Editorial explainers and practical resources for authors preparing and sharing scholarly work."/><section className="section section-white"><div className="container blog-grid">{journal.blogs.map((post, index) => <article className={`blog-card ${index === 0 ? 'blog-featured' : ''}`} key={post.slug}><div className="blog-art"><span>{String(index + 1).padStart(2, '0')}</span><div className="blog-art-lines"><i/><i/><i/></div><strong>{post.category}</strong></div><div className="blog-content"><div className="blog-meta"><span>{post.category}</span><span><Clock3 size={13}/> {post.read}</span></div><h2><Link to={`/blogs/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><div className="blog-card-foot"><span>{formatDate(post.date)}</span><Link to={`/blogs/${post.slug}`}>Read article <ArrowUpRight size={15}/></Link></div></div></article>)}</div></section></>;
}

export function BlogDetail() {
  const { slug } = useParams();
  const post = journal.blogs.find((item) => item.slug === slug);
  if (!post) return <section className="section section-white"><div className="container"><EmptyState title="Article not found" description="This journal resource may have moved." action={<Link to="/blogs" className="text-link">Back to blogs <ArrowRight size={15}/></Link>}/></div></section>;
  return <><Meta title={post.title} description={post.excerpt}/><section className="blog-detail-hero"><div className="container"><Link to="/blogs" className="back-link"><ArrowLeft size={15}/> Back to journal insights</Link><div className="eyebrow">{post.category} · {post.read}</div><h1>{post.title}</h1><p>{post.excerpt}</p><span>{formatDate(post.date)}</span></div></section><section className="section section-white"><div className="container prose narrow-prose blog-prose">{post.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<div className="inline-cta"><Link to="/guidelines" className="button button-primary">Author guidelines <ArrowUpRight size={15}/></Link><Link to="/submit" className="text-link">Submit a manuscript <ArrowRight size={15}/></Link></div></div></section></>;
}
