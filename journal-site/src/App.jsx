import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Layout';
import Home from './pages/Home';
import Papers from './pages/Papers';
import PaperDetail from './pages/PaperDetail';
import Submit from './pages/Submit';
import Track from './pages/Track';
import Pay from './pages/Pay';
import Verify from './pages/Verify';
import Admin from './pages/Admin';
import { About, Contact, Fees, Guidelines, Policies, Privacy, Terms } from './pages/InfoPages';
import { BlogDetail, Blogs } from './pages/Blogs';
import Meta from './components/Meta';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function NotFound() {
  return <><Meta title="Page not found"/><section className="section section-white"><div className="container not-found"><div className="eyebrow">404 · Not found</div><h1>This page is<br/><em>not in the archive.</em></h1><p>The page may have moved or the address may be incorrect.</p><Link className="button button-primary" to="/"><ArrowLeft size={16}/> Return to journal</Link></div></section></>;
}

export default function App() {
  return <BrowserRouter><Shell><Routes>
    <Route path="/" element={<Home/>}/>
    <Route path="/papers" element={<Papers/>}/>
    <Route path="/papers/:id" element={<PaperDetail/>}/>
    <Route path="/submit" element={<Submit/>}/>
    <Route path="/track" element={<Track/>}/>
    <Route path="/pay/:id" element={<Pay/>}/>
    <Route path="/verify/:id" element={<Verify/>}/>
    <Route path="/admin" element={<Admin/>}/>
    <Route path="/about" element={<About/>}/>
    <Route path="/guidelines" element={<Guidelines/>}/>
    <Route path="/fees" element={<Fees/>}/>
    <Route path="/contact" element={<Contact/>}/>
    <Route path="/policies" element={<Policies/>}/>
    <Route path="/terms" element={<Terms/>}/>
    <Route path="/privacy" element={<Privacy/>}/>
    <Route path="/blogs" element={<Blogs/>}/>
    <Route path="/blogs/:slug" element={<BlogDetail/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></Shell></BrowserRouter>;
}
