import { createGLSculpture } from './entry-gl.js';
import { sculptureState,entryTravelState } from './entry-motion.js';
import { createWindRenderer } from './entry-wind.js';
import { createEntryVector } from './entry-vector.js';

export function createEntrySculpture(canvas, { scene, airCanvas, compact = false, reduced = false }) {
  const empty = { available: false, play: () => Promise.resolve(), pause() {}, resume() {}, stop() {}, destroy() {
    for (const element of [canvas, airCanvas]) if (element) { element.width = 1; element.height = 1; }
  } };
  if (!canvas || typeof requestAnimationFrame !== 'function') return empty;
  const size = Math.max(1, Math.min(compact ? 440 : 640, Math.round(canvas.getBoundingClientRect().width || 320)));
  const ratio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
  let gpu;
  try { gpu = createGLSculpture(canvas, { compact, size, ratio }); } catch { /* Inline SVG remains. */ }
  const vector=createEntryVector(scene,{size});
  if (!gpu && !vector) return empty;
  let renderer=gpu||vector,lastState=null;
  const wind = createWindRenderer(airCanvas, { size, ratio, compact });
  let job = null, frameId = 0, paused = document.hidden, dead = false, available = true, windEnabled = true;
  function render(state) {
    lastState=state;
    try { renderer.draw(state); }
    catch(error) { if(!useVector()) throw error; }
    if (windEnabled) { try { wind.draw(state); } catch { windEnabled = false; wind.destroy(); } }
    scene.dataset.renderer = gpu ? 'ready' : 'vector';
  }
  function draw(phase,progress,duration,travel) {
    render({...sculptureState(phase,progress,duration),...entryTravelState(phase,progress,travel,duration,compact)});
  }
  function stop(clearTravel=false) {
    cancelAnimationFrame(frameId); frameId = 0;
    if (job) { const resolve = job.resolve; job = null; resolve(); }
    if(clearTravel&&renderer&&lastState&&(lastState.motionX||lastState.motionY||lastState.travelFade)){
      try{render({...lastState,motionX:0,motionY:0,travelFade:0,travelSide:0,wind:0});}catch{fail();}
    }
  }
  function graphicsCleanup() {
    canvas.removeEventListener('webglcontextlost', contextLost); gpu?.destroy(); gpu=null; vector?.destroy(); wind.destroy();
    renderer=null;lastState=null;
    canvas.width = 1; canvas.height = 1;
  }
  function fail() { available = false; stop(); graphicsCleanup(); canvas.hidden = true; delete scene.dataset.renderer; }
  function useVector() {
    if(!gpu||!vector) return false;
    canvas.removeEventListener('webglcontextlost',contextLost);
    const previous=gpu;gpu=null;renderer=vector;previous.destroy();
    canvas.hidden=true;canvas.width=1;canvas.height=1;
    if(lastState) vector.draw(lastState);
    scene.dataset.renderer='vector';return true;
  }
  function contextLost(event) { event.preventDefault();try { if(!useVector()) fail(); } catch { fail(); } }
  if(gpu) canvas.addEventListener('webglcontextlost', contextLost);
  function tick(now) {
    frameId = 0; if (!job || paused || dead) return;
    if (job.lastTime !== null) job.elapsed += Math.max(0, now - job.lastTime);
    job.lastTime = now;
    const done = job.elapsed >= job.duration;
    if (job.elapsed - job.lastDraw + .1 >= 1000/(compact ? 30 : 60) || done || job.lastDraw < 0) {
      try { draw(job.phase,Math.min(1,job.elapsed/job.duration),job.duration,job.travel); } catch { fail(); return; }
      job.lastDraw = job.elapsed;
    }
    if (done) { stop(); return; }
    frameId = requestAnimationFrame(tick);
  }
  try { draw(reduced ? 'idle' : 'arrive', reduced ? 1 : 0); } catch { fail(); }
  return {
    get available() { return available; },
    play(phase,duration,travel) {
      stop(true); if (dead || !available || reduced) return Promise.resolve();
      return new Promise(resolve => {
        job = { phase, duration: Math.max(1, duration),travel, elapsed: 0, lastDraw: -1, lastTime: null, resolve };
        if (!paused) frameId = requestAnimationFrame(tick);
      });
    },
    pause() { paused = true; cancelAnimationFrame(frameId); frameId = 0; if (job) job.lastTime = null; },
    resume() { if (dead || !paused) return; paused = false; if (job && !frameId) frameId = requestAnimationFrame(tick); },
    stop:()=>stop(true),
    destroy() { if (dead) return; stop(); dead = true; graphicsCleanup(); },
  };
}
