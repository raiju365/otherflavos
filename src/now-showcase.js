import {mediaPath} from './project-showcase.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderNowShowcase(project) {
  if(!project)return '<p class="now-empty">Projects will appear here.</p>';
  const placeholder=project.status==='placeholder';
  return `<article class="now-featured" aria-labelledby="now-project-title">
    <header class="featured-caption now-heading">
      <div><p class="now-kind">${escape(project.type)}</p><h3 id="now-project-title">${escape(project.name)}</h3></div>
    </header>
    <div class="now-composition">
      <button type="button" class="featured-preview now-preview" data-project="0" aria-label="View ${escape(project.name)} project">
        <img src="${escape(mediaPath(project.image)||'')}" alt="${escape(project.alt)}" width="1440" height="900" decoding="async">
      </button>
      <div class="now-details">
        ${placeholder?'<p class="now-status">Placeholder preview</p>':project.description?`<p class="now-summary">${escape(project.description)}</p>`:''}
        <button type="button" class="now-open" data-project="0" aria-label="View ${escape(project.name)} project"><span>View project</span><span class="now-open-arrow" aria-hidden="true">↗</span></button>
      </div>
    </div>
  </article>`;
}
