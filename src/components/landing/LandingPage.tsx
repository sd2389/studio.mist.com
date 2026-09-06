import { ArrowUpRight, Box, Diamond, ImageIcon, MonitorSmartphone, Sun, Video } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { LandingExperience } from './LandingExperience';
import './landing.css';

const workflow = [
  ['01', 'Bring your design.', 'Upload a GLB, GLTF, OBJ, STL, or Rhino 3DM model. Keep the creative work you already did.'],
  ['02', 'Make it yours.', 'Choose metals and gemstones independently. Set the finish, lighting, and camera angle.'],
  ['03', 'Show every detail.', 'Create images and turntables, or share an interactive view of your published design.'],
];

export function LandingPage() {
  return (
    <div className='mist-home'>
      <a className='mist-skip' href='#workflow'>Skip to the workflow</a>
      <main>
        <LandingExperience />
        <section id='workflow' className='mist-section mist-workflow'>
          <div className='mist-section-heading'><p className='mist-eyebrow'>The workflow</p><h2>One design.<br /><span>Every possibility.</span></h2><Link className='mist-text-link' href='/upload-model'>Bring your own model <ArrowUpRight size={17} /></Link></div>
          <div className='mist-steps'>{workflow.map(([number, title, copy]) => <article key={number}><span className='mist-step-number'>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </section>
        <section id='materials' className='mist-section mist-materials'>
          <div className='mist-material-canvas' aria-hidden='true'><div className='mist-material-disc mist-gold' /><div className='mist-material-disc mist-platinum' /><div className='mist-cut-gem'><Diamond strokeWidth={0.65} /></div><div className='mist-material-disc mist-rose' /><span>Metal · Gemstone · Finish</span></div>
          <div className='mist-material-copy'><p className='mist-eyebrow'>Precious by design</p><h2>Every facet.<br /><span>Every finish.</span></h2><p>Yellow gold, platinum, rose gold. Diamonds, sapphires, emeralds. Find the combination that belongs to your design.</p><div className='mist-inline-tags'><span>Separate metal & gem controls</span><span>Polished to brushed finishes</span></div><Link className='mist-text-link' href='/stones'>Explore gemstones <ArrowUpRight size={17} /></Link></div>
        </section>
        <section className='mist-light-section'>
          <Image src='/images/devjewels-ice-ring.png' alt='A diamond ring under soft studio lighting' fill sizes='100vw' className='mist-light-image' />
          <div className='mist-light-shade' />
          <div className='mist-light-copy'><p className='mist-eyebrow'>Direct the reflection</p><h2>Find your light.</h2><p>Soft studio. Warm highlights. Dramatic contrast.<br />Start with a preset, then refine the scene.</p><Link className='mist-text-link' href='/viewer/mist-solitaire'>Explore the studio <ArrowUpRight size={17} /></Link></div>
          <div className='mist-light-labels'><span><Sun size={16} />Studio</span><span>Warm</span><span>Dramatic</span></div>
        </section>
        <section className='mist-section mist-output'>
          <div><p className='mist-eyebrow'>From one model</p><h2>Ready for<br /><span>the next screen.</span></h2><p>Build the view once. Bring it to your catalog, your next conversation, or your customer’s phone.</p><Link href='/viewer/mist-solitaire' className='mist-button mist-button-outline'>Try the sample <ArrowUpRight size={18} /></Link></div>
          <div className='mist-output-list'>{[[ImageIcon,'Still images','Frame the details in a clean product shot.'],[Video,'360° turntables','Show the shape from every angle.'],[MonitorSmartphone,'Interactive views','Let people explore the design themselves.']].map(([Icon,title,copy]) => { const OutputIcon = Icon as typeof Box; return <article key={String(title)}><OutputIcon size={25} strokeWidth={1.3} /><div><h3>{String(title)}</h3><p>{String(copy)}</p></div><ArrowUpRight size={16} /></article>; })}</div>
        </section>
        <section className='mist-section mist-closing'><p className='mist-eyebrow'>MIST Studio</p><h2>Your next piece<br /><span>starts here.</span></h2><p>Open a sample, or bring your own design.</p><Link href='/viewer/mist-solitaire' className='mist-button'>Open the studio <ArrowUpRight size={18} /></Link><Link href='/upload-model' className='mist-text-link'>Upload a model <ArrowUpRight size={16} /></Link></section>
      </main>
      <footer className='mist-footer'><Link href='/' aria-label='MIST Studio home'>MIST <span>STUDIO</span></Link><nav aria-label='Footer'>{[['/gallery','Gallery'],['/pricing','Pricing'],['/contact','Contact'],['/privacy','Privacy'],['/terms','Terms']].map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</nav><span>Made for the details.</span></footer>
    </div>
  );
}
