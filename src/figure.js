import { portraitSource, portraitSize, portraitCrop, portraitTreatment, portraitAsciiGrid, portraitAsciiCells, portraitAsciiGlyph, portraitAsciiMask, portraitAsciiPulse } from './portrait-image.js';

// The user's real portrait, printed in readable ASCII marks. One capped owner
// crossfades characters in anchored cells; source sampling/atlases are cached.
export async function initFigure(canvas, signal) {
  if (!canvas || signal.aborted) return () => {};
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return ()=>{};
  const sample=document.createElement('canvas'), ink=sample.getContext('2d',{willReadFrequently:true});
  const atlas=document.createElement('canvas'), glyphs=atlas.getContext('2d');
  if(!ink||!glyphs)return ()=>{};
  const image=new Image();image.decoding='async';image.src=portraitSource;
  await image.decode();
  if(signal.aborted)return ()=>{};
  const {width,height}=portraitSize,crop=portraitCrop(image.naturalWidth,image.naturalHeight);
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
  const listeners=new AbortController();
  const dialog=document.querySelector('#project-detail');
  let frame=0,visible=true,pageActive=true,disposed=false,sectionMoving=false;
  let elapsed=0,lastTime=null,lastPaint=null,cells=[],columns=0,rows=0,spriteWidth=0,spriteHeight=0;
  let cellWidth=0,cellHeight=0,tileWidth=0,tileHeight=0,tilePad=0,dpr=1,inkColor='',fallback=false;
  const on=(target,type,listener)=>target?.addEventListener(type,listener,{signal:listeners.signal,passive:true});
  function drawMark(cell,slot,weight) {
    if(weight<=0||slot===0)return;
    ctx.globalAlpha=cell.alpha*portraitTreatment.asciiOpacity*weight;
    ctx.drawImage(atlas,(slot%portraitTreatment.atlasColumns)*spriteWidth,Math.floor(slot/portraitTreatment.atlasColumns)*spriteHeight,spriteWidth,spriteHeight,
      cell.x-cellWidth/2-tilePad,cell.y-cellHeight/2-tilePad,tileWidth,tileHeight);
  }
  function draw() {
    ctx.clearRect(0,0,width,height);
    // The original photo is sampled offscreen only. Every visible mark is a
    // cached character; no photographic underlay, mask or lower wash remains.
    ctx.globalCompositeOperation='source-over';
    if(fallback)return;
    const still=motion.matches||forced.matches;
    for(const cell of cells) {
      const pulse=portraitAsciiPulse(cell,elapsed,still);
      const from=portraitAsciiMask(cell,pulse.from),to=portraitAsciiMask(cell,pulse.to);
      if(pulse.mix===0||from===to)drawMark(cell,from,1);
      else {
        // Shared facial points stay fully inked; only differing points fade.
        drawMark(cell,from&to,1);
        drawMark(cell,from&~to,1-pulse.mix);
        drawMark(cell,to&~from,pulse.mix);
      }
    }
    ctx.globalAlpha=1;
  }
  function cacheGlyphs() {
    // A transparent gutter lets edge dots cross a character boundary without
    // clipping or creating a white seam between neighbouring glyph cells.
    tilePad=cellWidth/2;tileWidth=cellWidth+tilePad*2;tileHeight=cellHeight+tilePad*2;
    spriteWidth=Math.ceil(tileWidth*dpr*2);spriteHeight=Math.ceil(tileHeight*dpr*2);
    atlas.width=spriteWidth*portraitTreatment.atlasColumns;atlas.height=spriteHeight*Math.ceil(portraitTreatment.glyphCount/portraitTreatment.atlasColumns);
    glyphs.fillStyle=inkColor;
    const sx=spriteWidth/tileWidth,sy=spriteHeight/tileHeight;
    for(let i=0;i<portraitTreatment.glyphCount;i++) {
      const glyph=portraitAsciiGlyph(i);
      glyphs.setTransform(sx,0,0,sy,(i%portraitTreatment.atlasColumns)*spriteWidth+tilePad*sx,Math.floor(i/portraitTreatment.atlasColumns)*spriteHeight+tilePad*sy);
      glyphs.globalAlpha=1;
      glyphs.beginPath();
      for(const dot of glyph.dots){
        const x=dot.x*cellWidth/2,y=dot.y*cellHeight/4,radius=dot.radius*Math.min(cellWidth/2,cellHeight/4);
        glyphs.moveTo(x+radius,y);glyphs.arc(x,y,radius,0,Math.PI*2);
      }
      glyphs.fill();
    }
    glyphs.globalAlpha=1;
  }
  function palette() {
    if(disposed)return;
    inkColor=getComputedStyle(canvas).color;
    cacheGlyphs();draw();
  }
  function resize() {
    if(disposed)return;
    const displayWidth=canvas.clientWidth||width,displayHeight=canvas.clientHeight||height;
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(displayWidth*dpr));canvas.height=Math.max(1,Math.round(displayHeight*dpr));
    ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
    // Keep cached ink pixels crisp when the tiny glyph tiles meet the display
    // scale. The offscreen photo sampler retains its normal smooth filtering.
    ctx.imageSmoothingEnabled=false;
    const grid=portraitAsciiGrid(displayWidth);
    if(grid.columns!==columns||grid.rows!==rows) {
      columns=grid.columns;rows=grid.rows;cellWidth=width/columns;cellHeight=height/rows;
      sample.width=columns*2;sample.height=rows*4;
      ink.imageSmoothingEnabled=true;
      ink.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,sample.width,sample.height);
      try{cells=portraitAsciiCells(ink.getImageData(0,0,sample.width,sample.height).data,columns,rows);fallback=false;}
      catch{fallback=true;}
    }
    palette();
  }
  const active=()=>!disposed&&!fallback&&visible&&pageActive&&!sectionMoving&&!document.hidden&&!motion.matches&&!forced.matches&&!dialog?.open
    &&document.documentElement.dataset.entry!=='loading'
    &&document.documentElement.dataset.galleryMoving!=='true';
  function wake(){if(active()&&!frame)frame=requestAnimationFrame(tick);}
  function tick(now) {
    frame=0;if(!active()){lastTime=lastPaint=null;return;}
    if(lastTime!==null)elapsed+=Math.max(0,Math.min(100,now-lastTime));
    lastTime=now;
    // Small mobile portraits have a lower drawing budget. These are caps, not FPS measurements.
    const interval=1000/(canvas.clientWidth<140?24:30);
    if(lastPaint===null||now-lastPaint>=interval){draw();lastPaint=lastPaint===null?now:now-(now-lastPaint)%interval;}
    wake();
  }
  function sync() {
    cancelAnimationFrame(frame);frame=0;lastTime=lastPaint=null;
    if(disposed)return;
    draw();wake();
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}):null;
  observer?.observe(canvas);
  const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{resize();sync();}):null;
  sizeObserver?.observe(canvas);
  const attributes=typeof MutationObserver==='function'?new MutationObserver(records=>{
    if(records.some(record=>record.attributeName==='data-theme'))palette();
    // Recolor the print without interrupting its clock or pending frame.
    if(records.some(record=>record.attributeName!=='data-theme'))sync();
  }):null;
  attributes?.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-gallery-moving','data-entry']});
  if(dialog)attributes?.observe(dialog,{attributes:true,attributeFilter:['open']});
  on(window,'resize',resize);
  on(document,'visibilitychange',sync);
  on(document,'portfolio:entryready',sync);
  on(document,'portfolio:gallerymotion',sync);
  on(document,'portfolio:sectionstart',()=>{sectionMoving=true;sync();});
  on(document,'portfolio:sectionsettled',()=>{sectionMoving=false;sync();});
  on(motion,'change',sync);on(forced,'change',()=>{palette();sync();});
  on(window,'pagehide',()=>{pageActive=false;sync();});
  on(window,'pageshow',()=>{pageActive=true;sync();});
  function destroy() {
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;
    observer?.disconnect();sizeObserver?.disconnect();attributes?.disconnect();listeners.abort();
    signal.removeEventListener('abort',destroy);
    sample.width=sample.height=atlas.width=atlas.height=1;cells=[];
  }
  signal.addEventListener('abort',destroy,{once:true});
  resize();sync();return destroy;
}
