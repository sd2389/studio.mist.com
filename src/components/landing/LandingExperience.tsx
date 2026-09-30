'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Component, type ReactNode, useCallback, useRef, useState } from 'react';
import { useInView, useReducedMotion, useScroll, useMotionValueEvent } from 'framer-motion';
import { LandingHeader } from './LandingHeader';

const Ring = dynamic(() => import('./LandingRing').then((m) => m.LandingRing), { ssr: false });
class PreviewBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function LandingExperience() {
  const section = useRef<HTMLElement>(null);
  const active = useInView(section, { margin: '100px' });
  const reducedMotion = useReducedMotion() === true;
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState(0);
  const onError = useCallback(() => setReady(false), []);
  const onReady = useCallback(() => setReady(true), []);
  useMotionValueEvent(scrollYProgress, 'change', (p) => setStage(p < 0.25 ? 0 : p < 0.65 ? 1 : 2));

  return (
    <section ref={section} className={`mist-experience ${reducedMotion ? 'mist-reduced' : ''}`} aria-label='From CAD to finished jewelry'>
      <div className='mist-hero'>
        <LandingHeader />
        <div className='mist-hero-heading'>
          <p className='mist-eyebrow'>A jewelry studio. In your browser.</p>
          <h1>From CAD to<br className='sm:hidden' /> <span>captivating.</span></h1>
        </div>
        <div className='mist-ring-stage' role='img' aria-label='A platinum solitaire ring moving from wireframe to an exploded setting and finished diamond render as you scroll'>
          <Image src='/images/devjewels-ice-ring.png' alt='' fill priority sizes='100vw' className={`mist-ring-poster ${ready ? 'mist-poster-hidden' : ''}`} />
          <PreviewBoundary onError={onError}><Ring progress={scrollYProgress} active={active} reducedMotion={reducedMotion} onReady={onReady} /></PreviewBoundary>
        </div>
        <div className='mist-hero-bottom'>
          <div><p>Your jewelry. In its best light.</p><span>Choose a finish, shape the light, make it yours.</span></div>
          <Link href='/viewer/mist-solitaire' className='mist-button'>Open the studio <ArrowUpRight size={18} /></Link>
        </div>
        <div className='mist-scroll-cue' aria-hidden='true'><ArrowDown size={14} /><span>{reducedMotion ? 'Designed for every detail' : 'Scroll to see it take shape'}</span><span className='mist-stage-name'>{['01 / The design', '02 / The details', '03 / The finish'][reducedMotion ? 2 : stage]}</span></div>
      </div>
    </section>
  );
}
