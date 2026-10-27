// Smoothed display follows settled assets; no frame loop while waiting.
export function createEntryCounter(element, {render}={}) {
  let value=0,target=0,frame=0,previous=null,paused=false,immediate=false,destroyed=false;
  let completion=null;
  let resolveDone; const done=new Promise(resolve=>{resolveDone=resolve;});
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;previous=null;};
  function paint(){
    if(render)render(value);else element.textContent=String(Math.floor(value));
    if(value===100)resolveDone(true);
  }
  function tick(time){
    frame=0;if(destroyed||paused)return;
    const dt=previous===null?16:Math.min(40,Math.max(0,time-previous));previous=time;
    if(target===100&&value>=99){
      // Finish the last carry exactly, without the former .18-unit snap.
      completion||={from:value,elapsed:0};
      completion.elapsed=Math.min(300,completion.elapsed+dt);
      const t=completion.elapsed/300;
      value=completion.from+(100-completion.from)*t*t*(3-2*t);
    }else{
      value+=Math.min(dt*.065,(target-value)*(1-Math.exp(-dt/170)));
      if(target===100&&value>99)value=99;
      if(target!==100&&target-value<.18)value=target;
    }
    paint();if(value<target)frame=requestAnimationFrame(tick);else previous=null;
  }
  function wake(){
    if(destroyed)return;
    if(immediate||typeof requestAnimationFrame!=='function'){stop();value=target;paint();return;}
    if(!paused&&!frame&&value<target)frame=requestAnimationFrame(tick);
  }
  paint();
  return {done,
    target(next){if(destroyed||!Number.isFinite(next))return;target=Math.max(target,Math.min(100,Math.max(0,next)));wake();},
    pause(hidden){paused=hidden;if(hidden)stop();else wake();},
    snap(){immediate=true;wake();},
    destroy(){destroyed=true;stop();resolveDone(false);}
  };
}
