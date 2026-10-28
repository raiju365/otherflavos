import {mediaPath} from './project-showcase.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const number=value=>String(value+1).padStart(2,'0');

export function renderNowShowcase(input) {
  const projects=Array.isArray(input)?input:input?[input]:[];
  if(!projects.length)return '<p class="now-empty">Projects will appear here.</p>';
  const first=projects[0];
  return `<article class="now-featured" aria-label="Project preview">
    <header class="now-heading">
      <div class="now-topline"><p class="now-kind">${escape(first.type)}</p><p class="now-count" aria-hidden="true"><span data-now-count>01</span><span class="now-count-divider">/</span>${String(projects.length).padStart(2,'0')}</p></div>
      <div class="now-title-stack">${projects.map((p,i)=>`<h3 class="now-title" data-now-title="${i}"${i?' hidden':''}>${escape(p.name)}</h3>`).join('')}</div>
    </header>
    <div class="now-composition">
      <button type="button" class="featured-preview now-preview" data-project="0" aria-label="View ${escape(first.name)} project">
        <span class="now-image-stack" data-preview-content>${projects.map((p,i)=>`<span class="now-slide" data-now-slide="${i}"${i?' hidden':''}><img src="${escape(mediaPath(p.image)||'')}" alt="${escape(p.alt)}" width="1440" height="900" decoding="async"${i?' loading="lazy"':''}></span>`).join('')}</span>
      </button>
      <div class="now-sidebar">
        <ol class="now-index" aria-label="Choose a project to preview">${projects.map((p,i)=>`<li><button type="button" class="now-choice" data-now-select="${i}" aria-pressed="${!i}" aria-controls="now-preview-description"><span class="now-choice-number" aria-hidden="true">${number(i)}</span><span class="now-choice-copy"><span class="now-choice-name">${escape(p.name)}</span><span class="now-choice-kind">${escape(p.type)}</span></span><span class="now-choice-mark" aria-hidden="true">↗</span></button></li>`).join('')}</ol>
        <div class="now-details">
          <p class="now-status" id="now-preview-description">${escape(first.status==='placeholder'?'Placeholder preview':first.description||'')}</p>
          <button type="button" class="now-open" data-project="0" aria-label="View ${escape(first.name)} project"><span>View project</span><span class="now-open-arrow" aria-hidden="true">↗</span></button>
        </div>
      </div>
    </div>
    <p class="sr-only now-announcement" aria-live="polite" aria-atomic="true"></p>
  </article>`;
}

// Selection owns inner slides; section navigation keeps the outer media frame.
export function initNowShowcase({root,projects,signal}) {
  if(!root||!projects.length||signal.aborted)return;
  const choices=[...root.querySelectorAll('[data-now-select]')];
  const slides=[...root.querySelectorAll('[data-now-slide]')];
  const titles=[...root.querySelectorAll('[data-now-title]')];
  const openers=[...root.querySelectorAll('[data-project]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const forced=matchMedia('(forced-colors: active)');
  const effects=new Set();
  let active=0,revision=0;
  const on=(el,type,fn)=>el.addEventListener(type,fn,{signal});
  const cancel=()=>{effects.forEach(effect=>effect.cancel());effects.clear();};
  const settle=()=>{revision++;cancel();slides.forEach((slide,i)=>{slide.hidden=i!==active;slide.setAttribute('aria-hidden',String(i!==active));});titles.forEach((title,i)=>{title.hidden=i!==active;});};
  function select(index) {
    if(!projects[index]||index===active)return;
    const direction=index>active?1:-1;
    const visible=slides.map((slide,i)=>({slide,i,pose:!slide.hidden?getComputedStyle(slide):null})).filter(item=>item.pose).map(({slide,i,pose})=>({slide,i,pose:{clipPath:pose.clipPath,transform:pose.transform,opacity:pose.opacity}}));
    cancel();active=index;const current=++revision;
    const project=projects[index];
    choices.forEach((choice,i)=>choice.setAttribute('aria-pressed',String(i===index)));
    openers.forEach(opener=>{opener.dataset.project=String(index);opener.setAttribute('aria-label',`View ${project.name} project`);});
    root.querySelector('.now-kind').textContent=project.type;
    root.querySelector('[data-now-count]').textContent=number(index);
    root.querySelector('.now-status').textContent=project.status==='placeholder'?'Placeholder preview':project.description||'';
    root.querySelector('.now-announcement').textContent=`${project.name}, ${number(index)} of ${projects.length}`;
    titles.forEach((title,i)=>{title.hidden=i!==index;});
    slides.forEach((slide,i)=>slide.setAttribute('aria-hidden',String(i!==index)));
    const canAnimate=!reduced.matches&&!forced.matches&&!document.hidden&&!root.closest('[hidden]')&&typeof slides[index].animate==='function'&&document.documentElement.dataset.entry!=='loading';
    if(!canAnimate){settle();return;}
    slides.forEach((slide,i)=>{slide.hidden=i!==index&&!visible.some(item=>item.i===i);slide.style.zIndex=i===index?'2':'1';});
    const run=(element,frames,duration)=>{
      const effect=element.animate(frames,{duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
      effects.add(effect);effect.finished.catch(()=>{});return effect;
    };
    try {
      visible.filter(item=>item.i!==index).forEach(({slide,pose})=>run(slide,[pose,{...pose,opacity:0}],230));
      const from=visible.find(item=>item.i===index)?.pose||{clipPath:direction>0?'inset(0 0 0 100%)':'inset(0 100% 0 0)',transform:`translateX(${direction*5}%)`,opacity:1};
      const media=run(slides[index],[from,{clipPath:'inset(0 0 0 0)',transform:'translateX(0)',opacity:1}],560);
      run(titles[index],[{opacity:0,transform:`translateY(${direction*20}px)`},{opacity:1,transform:'translateY(0)'}],420);
      media.finished.then(()=>{if(current===revision)settle();},()=>{});
    } catch {settle();}
  }
  choices.forEach((choice,index)=>{
    on(choice,'click',()=>select(index));
    on(choice,'keydown',event=>{
      const keys={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1};
      const next=event.key==='Home'?0:event.key==='End'?choices.length-1:event.key in keys?(index+keys[event.key]+choices.length)%choices.length:null;
      if(next===null)return;event.preventDefault();choices[next].focus({preventScroll:true});select(next);
    });
  });
  [reduced,forced].forEach(query=>on(query,'change',settle));
  on(document,'portfolio:sectionstart',settle);
  on(document,'visibilitychange',settle);
  on(window,'resize',settle);
  on(window,'pagehide',settle);
  on(window,'pageshow',settle);
  signal.addEventListener('abort',settle,{once:true});
  settle();
}
