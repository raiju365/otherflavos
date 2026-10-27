const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function mediaPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^\/(?!\/)/.test(value)) return value;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function renderProjectShowcase(projects) {
  if(!projects.length)return '<p class="project-empty">Projects will appear here.</p>';
  const first=projects[0];
  const cards=Array.from({length:5},(_,slot)=>`<div class="loop-card" data-loop-slot="${slot}" aria-hidden="true"><button type="button" class="loop-card-button" tabindex="-1"><img class="loop-card-image" alt="" draggable="false" decoding="async"></button></div>`).join('');
  const fallback=projects.map((project,index)=>`<li><button type="button" data-project="${index}"><img src="${escape(mediaPath(project.image)||'')}" alt="${escape(project.alt)}" loading="lazy" width="1440" height="900"><span>${escape(project.name)}</span><small>${escape(project.type)}</small></button></li>`).join('');
  return `<div class="loop-gallery" data-enhanced="false">
    <div class="loop-viewport" role="region" aria-roledescription="carousel" aria-label="Project gallery" aria-describedby="loop-instructions" tabindex="0" hidden>
      <canvas class="loop-canvas" aria-hidden="true" hidden></canvas>
      <div class="loop-track">${cards}</div>
    </div>
    <div class="loop-caption" hidden>
      <div class="loop-current"><p class="loop-kind">${escape(first.type)}</p><h3 class="loop-title">${escape(first.name)}</h3><p class="loop-status">${first.status==='placeholder'?'Placeholder preview':''}</p></div>
      <button type="button" class="loop-open" data-project="0" aria-label="View ${escape(first.name)} project"><span>Explore project</span><span class="loop-open-arrow" aria-hidden="true">↗</span></button>
    </div>
    <div class="loop-controls sr-only" hidden>
      <p id="loop-instructions">Scroll, drag, or use arrow keys to explore projects. Press Enter to open the current project.</p>
      <span class="sr-only loop-announcement" aria-live="polite" aria-atomic="true"></span>
    </div>
    <ul class="loop-fallback">${fallback}</ul>
  </div>`;
}
