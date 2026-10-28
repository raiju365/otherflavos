import { portraitSource, portraitSize, portraitCrop, portraitTreatment, portraitEdgeAlpha, portraitAsciiGrid, portraitAsciiCells, portraitAsciiTone, portraitAsciiGlyph, portraitAsciiPose } from './portrait-image.js';

// The user's real portrait, printed in tiny ASCII marks. One capped frame owner
// moves the individual points; image sampling and glyph rasterization are cached.
export async function initFigure(canvas, signal) {
  if (!canvas || signal.aborted) return () => {};
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return ()=>{};
  const sample=document.createElement('canvas'), ink=sample.getContext('2d',{willReadFrequently:true});
  const atlas=document.createElement('canvas'), glyphs=atlas.getContext('2d');
  const relief=document.createElement('canvas'), reliefInk=relief.getContext('2d');
  if(!ink||!glyphs||!reliefInk)return ()=>{};
  const image=new Image();image.decoding='async';image.src=portraitSource;
  await image.decode();
  if(signal.aborted)return ()=>{};
  const {width,height}=portraitSize,crop=portraitCrop(image.naturalWidth,image.naturalHeight);
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
  const listeners=new AbortController();
  const dialog=document.querySelector('#project-detail');
  let frame=0,visible=true,pageActive=true,focused=true,disposed=false,sectionMoving=false;
  let elapsed=0,lastTime=null,lastPaint=null,cells=[],columns=0,rows=0,spriteWidth=0,spriteHeight=0;
  let cellWidth=0,cellHeight=0,light=false,dpr=1,inkColor='',fallback=false;
  const on=(target,type,listener)=>target?.addEventListener(type,listener,{signal:listeners.signal,passive:true});
  function draw() {
    ctx.clearRect(0,0,width,height);
    // A strong source-photo core prevents the background screen from showing
    // through the face. The cached perimeter alone dissolves into the rail.
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=portraitTreatment.reliefOpacity;
    ctx.drawImage(relief,0,0,width,height);
    if(fallback){ctx.globalAlpha=1;return;}
    const still=motion.matches||forced.matches;
    for(const cell of cells) {
      const tone=portraitAsciiTone(cell.luminance,light);
      const point=portraitAsciiPose(cell,elapsed,still);
      ctx.globalAlpha=cell.alpha*portraitTreatment.asciiOpacity;
      ctx.drawImage(atlas,tone*spriteWidth,0,spriteWidth,spriteHeight,
        point.x-cellWidth/2,point.y-cellHeight/2,cellWidth,cellHeight);
    }
    ctx.globalAlpha=1;
  }
  function cacheGlyphs() {
    spriteWidth=Math.ceil(cellWidth*dpr);spriteHeight=Math.ceil(cellHeight*dpr);
    atlas.width=spriteWidth*32;atlas.height=spriteHeight;
    glyphs.setTransform(dpr,0,0,dpr,0,0);
    glyphs.fillStyle=inkColor;
    glyphs.textAlign='center';glyphs.textBaseline='middle';
    glyphs.font=`700 ${Math.min(cellHeight*1.03,cellWidth/0.6)}px ui-monospace, Consolas, monospace`;
    for(let i=0;i<32;i++) {
      const glyph=portraitAsciiGlyph(i);
      glyphs.globalAlpha=glyph.alpha;
      glyphs.fillText(glyph.mark,(i+.5)*spriteWidth/dpr,cellHeight*.49);
    }
    glyphs.globalAlpha=1;
  }
  function palette() {
    if(disposed)return;
    light=document.documentElement.dataset.theme==='light';
    inkColor=getComputedStyle(canvas).color;
    cacheGlyphs();draw();
  }
  function resize() {
    if(disposed)return;
    const displayWidth=canvas.clientWidth||width,displayHeight=canvas.clientHeight||height;
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(displayWidth*dpr));canvas.height=Math.max(1,Math.round(displayHeight*dpr));
    ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
    relief.width=canvas.width;relief.height=canvas.height;
    reliefInk.globalCompositeOperation='source-over';
    reliefInk.filter=`grayscale(1) contrast(${portraitTreatment.contrast}) brightness(${portraitTreatment.brightness})`;
    reliefInk.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,relief.width,relief.height);
    reliefInk.filter='none';
    // Apply only to cached pixels, not as a second animation or an oval clip.
    reliefInk.globalCompositeOperation='destination-in';
    const across=reliefInk.createLinearGradient(0,0,relief.width,0);
    [0,.02,.04,.06,.08,.92,.94,.96,.98,1].forEach(x=>across.addColorStop(x,`rgba(0,0,0,${portraitEdgeAlpha(x,.4)})`));
    reliefInk.fillStyle=across;reliefInk.fillRect(0,0,relief.width,relief.height);
    const down=reliefInk.createLinearGradient(0,0,0,relief.height);
    [0,.74,.78,.82,.86,.9,.94,.98,1].forEach(y=>down.addColorStop(y,`rgba(0,0,0,${portraitEdgeAlpha(.5,y)})`));
    reliefInk.fillStyle=down;reliefInk.fillRect(0,0,relief.width,relief.height);
    reliefInk.globalCompositeOperation='source-over';
    const grid=portraitAsciiGrid(displayWidth);
    if(grid.columns!==columns||grid.rows!==rows) {
      columns=grid.columns;rows=grid.rows;cellWidth=width/columns;cellHeight=height/rows;
      sample.width=columns;sample.height=rows;
      ink.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,columns,rows);
      try{cells=portraitAsciiCells(ink.getImageData(0,0,columns,rows).data,columns,rows);fallback=false;}
      catch{fallback=true;}
    }
    palette();
  }
  const active=()=>!disposed&&!fallback&&visible&&pageActive&&focused&&!sectionMoving&&!document.hidden&&!motion.matches&&!forced.matches&&!dialog?.open
    &&document.documentElement.dataset.entry!=='loading'
    &&document.documentElement.dataset.themeControlOpen!=='true'&&document.documentElement.dataset.galleryMoving!=='true';
  function wake(){if(active()&&!frame)frame=requestAnimationFrame(tick);}
  function tick(now) {
    frame=0;if(!active()){lastTime=lastPaint=null;return;}
    if(lastTime!==null)elapsed+=Math.max(0,Math.min(100,now-lastTime));
    lastTime=now;
    // Small mobile portraits have a lower drawing budget. These are caps, not FPS measurements.
    const interval=1000/(canvas.clientWidth<140?12:18);
    if(lastPaint===null||now-lastPaint>=interval){draw();lastPaint=now;}
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
    sync();
  }):null;
  attributes?.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-theme-control-open','data-gallery-moving','data-entry']});
  if(dialog)attributes?.observe(dialog,{attributes:true,attributeFilter:['open']});
  on(window,'resize',resize);
  on(document,'visibilitychange',sync);
  on(document,'portfolio:entryready',sync);
  on(document,'portfolio:themecontrol',sync);
  on(document,'portfolio:gallerymotion',sync);
  on(document,'portfolio:sectionstart',()=>{sectionMoving=true;sync();});
  on(document,'portfolio:sectionsettled',()=>{sectionMoving=false;sync();});
  on(motion,'change',sync);on(forced,'change',()=>{palette();sync();});
  on(window,'pagehide',()=>{pageActive=false;sync();});
  on(window,'pageshow',()=>{pageActive=true;sync();});
  on(window,'blur',()=>{focused=false;sync();});
  on(window,'focus',()=>{focused=true;sync();});
  function destroy() {
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;
    observer?.disconnect();sizeObserver?.disconnect();attributes?.disconnect();listeners.abort();
    signal.removeEventListener('abort',destroy);
    sample.width=sample.height=atlas.width=atlas.height=relief.width=relief.height=1;cells=[];
  }
  signal.addEventListener('abort',destroy,{once:true});
  resize();sync();return destroy;
}
