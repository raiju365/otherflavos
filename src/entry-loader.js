import { prepareEntryFonts, prepareEntryAssets } from './entry-readiness.js';
import { createEntryCounter } from './entry-counter.js';
import { createEntryNumerals } from './entry-numerals.js';
import { entryWaveFrames } from './entry-reveal.js';

export function initEntryLoader({ signal }) {
  const root=document.documentElement, stage=document.querySelector('#entry-loader');
  if(!stage||root.dataset.entry!=='loading')return {start:()=>Promise.resolve()};
  const lifetime=new AbortController(), ownSignal=lifetime.signal;
  const page=document.querySelector('.portfolio'), number=stage.querySelector('#entry-number');
  const meter=stage.querySelector('#entry-progress'), surface=stage.querySelector('.entry-surface');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'), desktop=matchMedia('(min-width: 801px)');
  const counter=createEntryCounter(number,{render:createEntryNumerals(number)}), animations=new Set();
  let finished=false,started=false,ready=false,keyboard=false;
  let settle=reduced.matches||typeof stage.animate!=='function';
  let revealContent=()=>Promise.resolve(),settleContent=()=>{};
  const on=(target,type,listener)=>target.addEventListener(type,listener,{signal:ownSignal});
  page.inert=true;stage.focus({preventScroll:true});stage.dataset.wired='true';
  counter.pause(document.hidden);if(settle)counter.snap();
  function progress(value){if(finished)return;meter.setAttribute('aria-valuenow',String(value));counter.target(Math.min(99,value));}
  function animate(element,frames,options){
    if(!element||typeof element.animate!=='function')return null;
    const animation=element.animate(frames,{fill:'both',...options});
    animations.add(animation);animation.finished.catch(()=>{});
    if(document.hidden)animation.pause();return animation;
  }
  const complete=motions=>Promise.allSettled(motions.filter(Boolean).map(animation=>animation.finished));
  function cancelAnimations(){animations.forEach(animation=>animation.cancel());animations.clear();}
  function finish(reason='ready'){
    if(finished)return;finished=true;counter.destroy();cancelAnimations();
    if(reason!=='ready')settleContent();
    const focused=stage.contains(document.activeElement);
    signal.removeEventListener('abort',abort);lifetime.abort();page.inert=false;stage.hidden=true;
    if(window.__portfolioEntry)window.__portfolioEntry.release(reason);
    else {root.dataset.entry='ready';document.dispatchEvent(new Event('portfolio:entryready'));}
    if(focused){if(keyboard)document.querySelector('#tabs [aria-selected=true]')?.focus({preventScroll:true});else document.activeElement?.blur();}
    stage.remove();
  }
  function settleMotion(){settle=true;counter.snap();cancelAnimations();if(ready)finish('settled');}
  on(document,'keydown',event=>{if(event.ctrlKey||event.metaKey)return;keyboard=true;if(event.key==='Tab'){event.preventDefault();stage.focus({preventScroll:true});}});
  on(document,'visibilitychange',()=>{
    counter.pause(document.hidden);
    animations.forEach(animation=>{if(['finished','idle'].includes(animation.playState))return;if(document.hidden)animation.pause();else animation.play();});
  });
  on(window,'resize',settleMotion);
  on(reduced,'change',()=>{if(reduced.matches)settleMotion();});
  on(document,'portfolio:entryfallback',()=>finish('deadline'));
  on(window,'pageshow',event=>{if(event.persisted)finish('restore');});
  const abort=()=>finish('abort');signal.addEventListener('abort',abort,{once:true});if(signal.aborted)finish('abort');

  async function reveal(){
    const tempo=desktop.matches?1:.8,glide='cubic-bezier(.22,1,.36,1)';
    // Keep the exact reels/metrics that just completed 100; no text replacement.
    stage.dataset.phase='reveal';
    const motions=[animate(stage.querySelector('.entry-counter'),[
      {opacity:1,transform:'translate3d(0,0,0)',filter:'blur(0px)'},
      {offset:.28,opacity:1,transform:'translate3d(0,-8px,0)',filter:'blur(0px)'},
      {opacity:0,transform:'translate3d(0,-76px,0)',filter:'blur(7px)'}
    ],{duration:720*tempo,easing:'cubic-bezier(.65,0,.25,1)'})];
    // Native interpolation moves one curved field, without slices or a ticker.
    motions.push(animate(surface,entryWaveFrames(),{
      duration:1280*tempo,delay:100*tempo,easing:'cubic-bezier(.76,0,.24,1)'
    }));
    // Existing owner prepares inner media before the outer wrapper moves.
    const content=revealContent();
    motions.push(animate(document.querySelector('.workspace > .panels'),[
      {opacity:0,transform:'perspective(1400px) translateY(42px) rotateX(5deg)'},
      {offset:.32,opacity:1,transform:'perspective(1400px) translateY(24px) rotateX(2deg)'},
      {opacity:1,transform:'perspective(1400px) translateY(0) rotateX(0)'}
    ],{duration:1450*tempo,delay:240*tempo,easing:glide}));
    // The studio owns the oval crop; the shorter layout slot must not clip it.
    motions.push(animate(document.querySelector('.figure-wrap'),[
      {opacity:0,transform:'translateY(38px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:1200*tempo,delay:450*tempo,easing:glide}));
    motions.push(animate(document.querySelector('#name'),[
      {opacity:0,transform:'translateY(32px) skewY(3deg)',clipPath:'inset(0 0 100%)'},
      {opacity:1,transform:'translateY(0) skewY(0deg)',clipPath:'inset(0 0 0%)'}
    ],{duration:1000*tempo,delay:430*tempo,easing:glide}));
    ['#handle','#profile-role','#tabs'].forEach((selector,index)=>motions.push(animate(document.querySelector(selector),[
      {opacity:0,transform:`translateY(${index===2?-16:18}px)`},{opacity:1,transform:'translateY(0)'}
    ],{duration:850*tempo,delay:(500+index*75)*tempo,easing:glide})));
    await Promise.all([complete(motions),content]);
  }
  return {async start(options={}){
    if(started||finished)return;started=true;
    revealContent=options.revealContent||revealContent;settleContent=options.settleContent||settleContent;
    try {
      stage.dataset.phase='count';
      const report=await prepareEntryAssets({signal:ownSignal,fontsReady:prepareEntryFonts(ownSignal),figureReady:options.figureReady,onProgress:progress});
      if(finished)return;ready=true;root.dataset.entryFallbacks=String(report.fallbackCount);
      counter.target(100);stage.querySelector('#entry-status').textContent='Ready';stage.querySelector('#entry-announcement').textContent='Portfolio ready.';
      if(settle||reduced.matches){finish('settled');return;}
      await counter.done;if(finished||settle)return;
      stage.dataset.phase='hold';
      await complete([animate(stage,[{opacity:1},{opacity:1}],{duration:220})]);
      if(finished||settle)return;await reveal();finish();
    }catch{finish('error');}
  }};
}
