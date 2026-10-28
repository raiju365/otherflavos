import './style.css';
import './layout.css';
import './about.css';
import './theme-picker.css';
import './navigation.css';
import './pointer-guides.css';
import './project-showcase.css';
import './entry-loader.css';
import './project-surface.css';
import './studio-theme.css';
import './now-showcase.css';
import './mobile-viewport.css';
import { profile, projects } from './data.js';
import { initFigure } from './figure.js';
import { initThemePicker } from './theme-picker.js';
import { initSectionNavigation } from './section-navigation.js';
import { initPointerGuides } from './pointer-guides.js';
import { renderProjectShowcase } from './project-showcase.js';
import { renderNowShowcase, initNowShowcase } from './now-showcase.js';
import { initEntryLoader } from './entry-loader.js';
import { initProjectSurfaces } from './project-surface.js';
import { initProjectGallery } from './project-gallery.js';
import { createProjectDetailMotion } from './project-detail-motion.js';
import { initRailAtmosphere } from './rail-atmosphere.js';

const abort=new AbortController(),{signal}=abort;
const on=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>{try{const parsed=new URL(value);return /^https?:$/.test(parsed.protocol)?parsed.href:null;}catch{return null;}};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');

const workspace=document.querySelector('.workspace');

let figureCleanup=()=>{};
let entry=initEntryLoader({signal});

document.querySelector('#name').textContent=profile.name;
document.querySelector('#handle').textContent=profile.handle;
document.querySelector('#profile-role').textContent=profile.role;
document.title=`${profile.name} — web developer`;
document.querySelector('#current-copy').textContent=profile.currently;
document.querySelector('.currently-row').hidden=!profile.currently?.trim()||profile.currently.trim().startsWith('[');
const email=typeof profile.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)?profile.email:null;
const statement=document.querySelector('#about-statement');
statement.textContent=profile.aboutStatement||'';
statement.hidden=!statement.textContent.trim();
const bio=profile.about.filter(p=>p?.trim());
const aboutCopy=document.querySelector('#about-copy');
aboutCopy.innerHTML=bio.map(p=>`<p>${escape(p)}</p>`).join('')+(email?`<p><a class="email-link" href="mailto:${escape(email)}">${escape(email)}</a></p>`:'');
aboutCopy.hidden=!aboutCopy.childElementCount;
document.querySelector('#about-draft').hidden=!profile.aboutIsDraft||!bio.length;
document.querySelector('.about-narrative').hidden=aboutCopy.hidden;
const aboutEditorial=document.querySelector('.about-editorial');
aboutEditorial.hidden=statement.hidden&&aboutCopy.hidden;
aboutEditorial.classList.toggle('has-no-statement',statement.hidden);
document.querySelector('#socials').innerHTML=profile.socials.map(s=>`<div class="social-item"><dt>${escape(s.label)}</dt><dd>${url(s.url)?`<a class="social-link" href="${escape(url(s.url))}" target="_blank" rel="noopener noreferrer"><span>${escape(s.handle)}</span><span class="social-arrow" aria-hidden="true">↗</span></a>`:`<span class="missing-contact">${escape(s.handle)}<small>belum diisi</small></span>`}</dd></div>`).join('');
document.querySelector('#project-list').innerHTML=renderProjectShowcase(projects);
if(projects.every(p=>p.status!=='placeholder'))document.querySelector('.project-note').hidden=true;
document.querySelector('#featured-work').innerHTML=renderNowShowcase(projects);
initNowShowcase({root:document.querySelector('#featured-work'),projects,signal});

const navigation=initSectionNavigation(signal);
const resetProjectSurfaces=initProjectSurfaces(signal);
const projectGallery=initProjectGallery({signal,projects,onOpen:openProject});
const railAtmosphere=initRailAtmosphere(signal);

initThemePicker(signal);
const hidePointerGuides=initPointerGuides(signal);

const dialog=document.querySelector('#project-detail');let origin=null,previousOverflow='',previousWorkspaceOverflow='';
const detailMotion=createProjectDetailMotion({dialog,reduced,signal});
function openProject(index){
  const p=projects[index];if(!p)return;
  origin=document.activeElement;previousOverflow=document.body.style.overflow;previousWorkspaceOverflow=workspace.style.overflow;
  document.querySelector('#project-title').textContent=p.name;
  document.querySelector('.detail-eyebrow').textContent=p.status==='placeholder'?'project notes / placeholder':'project notes';
  document.querySelector('.detail-description').textContent=p.description;
  const image=document.querySelector('.detail-image');image.src=p.image;image.alt=p.alt;
  document.querySelector('.detail-meta').innerHTML=`<div><h3>my role</h3><p>${escape(p.role)}</p></div><div><h3>built with</h3><p>${p.technologies.map(escape).join(' / ')}</p></div><div class="decision"><h3>behind the decisions</h3><p>${escape(p.decision)}</p></div>`;
  document.querySelector('.detail-links').innerHTML=[['live demo',p.liveUrl],['source code',p.sourceUrl]].map(([label,href])=>url(href)?`<a href="${escape(url(href))}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:`<span>${label} — belum tersedia</span>`).join('');
  hidePointerGuides();
  resetProjectSurfaces();
  railAtmosphere.setDialogOpen(true);
  projectGallery.setDialogOpen(true);
  dialog.showModal();dialog.scrollTop=0;document.body.style.overflow='hidden';workspace.style.overflow='hidden';document.querySelector('.detail-close').focus();
  detailMotion.open();
}
function closeProject(){detailMotion.close();}
document.querySelectorAll('[data-project]').forEach(button=>on(button,'click',()=>openProject(Number(button.dataset.project))));
on(document.querySelector('.detail-close'),'click',closeProject);
on(dialog,'cancel',event=>{event.preventDefault();closeProject();});
on(dialog,'click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeProject();}});
on(dialog,'close',()=>{projectGallery.setDialogOpen(false);railAtmosphere.setDialogOpen(false);document.body.style.overflow=previousOverflow;workspace.style.overflow=previousWorkspaceOverflow;origin?.focus({preventScroll:true});});
const figureReady=initFigure(document.querySelector('#figure'),signal).then(cleanup=>{figureCleanup=cleanup;},()=>({fallback:true}));
entry.start({figureReady,revealContent:()=>navigation.revealInitial(),settleContent:()=>navigation.settleInitial()}).finally(()=>{entry=null;});
if(import.meta.hot)import.meta.hot.dispose(()=>{abort.abort();figureCleanup();if(dialog.open)dialog.close();document.body.style.overflow=previousOverflow;workspace.style.overflow=previousWorkspaceOverflow;});
