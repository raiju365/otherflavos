// One finite owner for the native dialog, including interrupted close requests.
export function createProjectDetailMotion({dialog,reduced,signal}) {
  const motions=new Set();let revision=0,closing=false;
  const on=(target,type,listener)=>target.addEventListener(type,listener,{signal});
  function clear(){motions.forEach(motion=>motion.cancel());motions.clear();delete dialog.dataset.motion;}
  function settle(){
    revision++;
    if(closing&&dialog.open)dialog.close();
    closing=false;clear();
  }
  function animate(element,frames,options){
    if(!element||typeof element.animate!=='function')return null;
    const motion=element.animate(frames,{fill:'both',...options});
    motions.add(motion);motion.finished.catch(()=>{});return motion;
  }
  const done=list=>Promise.allSettled(list.filter(Boolean).map(motion=>motion.finished));
  function open(){
    revision++;closing=false;clear();
    if(signal.aborted||reduced.matches||document.hidden)return;
    const current=revision;dialog.dataset.motion='opening';
    const list=[animate(dialog,[
      {opacity:0,transform:'translate3d(0,28px,0) scale(.985)'},
      {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
    ],{duration:520,easing:'cubic-bezier(.22,1,.36,1)'})];
    [...dialog.querySelectorAll('.detail-eyebrow, #project-title, .detail-description, .detail-image, .detail-meta, .detail-links')].forEach((element,index)=>{
      list.push(animate(element,[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{
        duration:560,delay:Math.min(index*45,180),easing:'cubic-bezier(.22,1,.36,1)'
      }));
    });
    done(list).then(()=>{if(revision===current)clear();});
  }
  function close(){
    if(!dialog.open||closing)return;
    if(reduced.matches||document.hidden||typeof dialog.animate!=='function'){dialog.close();settle();return;}
    closing=true;const current=++revision;dialog.dataset.motion='closing';
    const currentStyle=typeof getComputedStyle==='function'?getComputedStyle(dialog):null;
    const motion=animate(dialog,[{opacity:currentStyle?.opacity||1,transform:currentStyle?.transform||'translateY(0)'},{opacity:0,transform:'translateY(18px)'}],{
      duration:230,easing:'cubic-bezier(.4,0,.8,.3)'
    });
    done([motion]).then(()=>{if(revision===current){if(dialog.open)dialog.close();closing=false;clear();}});
  }
  on(dialog,'close',()=>{revision++;closing=false;clear();});
  on(window,'resize',settle);
  on(window,'pagehide',settle);
  on(document,'visibilitychange',()=>{if(document.hidden)settle();});
  on(reduced,'change',()=>{if(reduced.matches)settle();});
  signal.addEventListener('abort',settle,{once:true});
  return {open,close};
}
