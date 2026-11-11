import {mediaPath} from './project-showcase.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const previewStatus = project => project.status === 'placeholder' ? 'Placeholder preview' : '';

export function renderNowShowcase(input) {
  const projects = Array.isArray(input) ? input : input ? [input] : [];
  if (!projects.length) return '<p class="now-empty">Projects will appear here.</p>';
  const first = projects[0];

  return `<article class="now-featured" aria-label="Project preview">
    <div class="now-composition">
      <button type="button" class="featured-preview now-preview" data-project="0" aria-label="View ${escape(first.name)} project" aria-describedby="now-preview-description">
        <span class="now-image-stack" data-preview-content>${projects.map((project, index) => `
          <span class="now-slide" data-now-slide="${index}"${index ? ' hidden' : ''}>
            <img src="${escape(mediaPath(project.image) || '')}" alt="${escape(project.alt)}" width="1440" height="900" decoding="async"${index ? ' loading="lazy"' : ''}>
          </span>`).join('')}</span>
      </button>
      <div class="now-caption">
        <p class="now-kind">${escape(first.type)}</p>
        <div class="now-title-stack">${projects.map((project, index) =>
          `<h3 class="now-title" data-now-title="${index}"${index ? ' hidden' : ''}>${escape(project.name)}</h3>`).join('')}</div>
        <button type="button" class="now-open" data-project="0" aria-label="View ${escape(first.name)} project">
          <span>View project</span><span class="now-open-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
      ${projects.length > 1 ? `<div class="now-browse" role="group" aria-label="Browse project previews">
        <button type="button" data-now-step="-1" aria-label="Previous project"><span aria-hidden="true">←</span></button>
        <button type="button" data-now-step="1" aria-label="Next project"><span aria-hidden="true">→</span></button>
      </div>` : ''}
    </div>
    <p class="sr-only" id="now-preview-description">${previewStatus(first)}</p>
    <p class="sr-only now-announcement" aria-live="polite" aria-atomic="true"></p>
  </article>`;
}

// Selection owns inner slides; section navigation keeps the outer media frame.
export function initNowShowcase({root,projects,signal}) {
  if(!root||!projects.length||signal.aborted)return;
  const controls=[...root.querySelectorAll('[data-now-step]')];
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
  function select(index, direction = index > active ? 1 : -1) {
    if(!projects[index]||index===active)return;
    const visible=slides.map((slide,i)=>({slide,i,pose:!slide.hidden?getComputedStyle(slide):null})).filter(item=>item.pose).map(({slide,i,pose})=>({slide,i,pose:{clipPath:pose.clipPath,transform:pose.transform,opacity:pose.opacity}}));
    cancel();active=index;const current=++revision;
    const project=projects[index];
    openers.forEach(opener=>{opener.dataset.project=String(index);opener.setAttribute('aria-label',`View ${project.name} project`);});
    root.querySelector('.now-kind').textContent=project.type;
    root.querySelector('#now-preview-description').textContent=previewStatus(project);
    root.querySelector('.now-announcement').textContent=`${project.name}, ${index + 1} of ${projects.length}`;
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
      run(titles[index],[{opacity:0,transform:`translateY(${direction*12}px)`},{opacity:1,transform:'translateY(0)'}],420);
      media.finished.then(()=>{if(current===revision)settle();},()=>{});
    } catch {settle();}
  }
  function browse(step) {
    select((active + step + projects.length) % projects.length, step);
  }
  controls.forEach(control => {
    on(control, 'click', () => browse(Number(control.dataset.nowStep)));
    on(control, 'keydown', event => {
      const steps = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (Object.hasOwn(steps, event.key)) {
        event.preventDefault();
        browse(steps[event.key]);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        select(event.key === 'Home' ? 0 : projects.length - 1);
      }
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
