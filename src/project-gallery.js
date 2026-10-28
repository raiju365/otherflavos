import {loopSlot,loopPose,reelPose,hitLoopCard,loopArrival,LOOP_ARRIVAL_MS,advanceLoopSway,wheelProjects,wrapProject} from './project-loop-model.js';
import {mediaPath} from './project-showcase.js';
import {createProjectLoopSurface} from './project-loop-surface.js';

export function initProjectGallery({signal,projects,onOpen}) {
  const empty={setDialogOpen(){}};
  const root=document.querySelector('.loop-gallery'),panel=document.querySelector('#panel-projects'),workspace=document.querySelector('.workspace');
  if(signal.aborted||!root||!panel||!workspace||!projects.length||typeof onOpen!=='function'||typeof requestAnimationFrame!=='function')return empty;
  const viewport=root.querySelector('.loop-viewport'),caption=root.querySelector('.loop-caption'),controls=root.querySelector('.loop-controls'),fallback=root.querySelector('.loop-fallback');
  const openButton=root.querySelector('.loop-open'),kind=root.querySelector('.loop-kind'),title=root.querySelector('.loop-title'),status=root.querySelector('.loop-status'),announcement=root.querySelector('.loop-announcement');
  const slots=[...root.querySelectorAll('[data-loop-slot]')].map((element,slot)=>({element,slot,button:element.querySelector('button'),image:element.querySelector('img'),project:-1}));
  if(!viewport||!caption||!controls||!fallback||!openButton||!kind||!title||!status||!announcement||slots.length!==5||slots.some(state=>!state.button||!state.image))return empty;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)'),compact=matchMedia('(max-width: 800px)');
  const on=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal});
  let position=0,target=0,frame=0,previous=null,width=800,height=440,current=-1,sway=0,swayVelocity=0;
  let visible=true,dialogOpen=false,pageActive=true,focused=true,drag=null,clickBlocked=false,intro=null,wasActive=false,needsEntrance=true,sectionEntering=false;
  let paintedCards=[];
  let motionNotified=false;
  function notifyMotion(moving){
    if(motionNotified===moving)return;motionNotified=moving;
    document.documentElement.dataset.galleryMoving=String(moving);
    document.dispatchEvent(new CustomEvent('portfolio:gallerymotion',{detail:{moving}}));
  }
  const poseFor=(...args)=>(compact.matches?reelPose:loopPose)(...args);
  const available=()=>!signal.aborted&&!document.hidden&&pageActive&&focused&&visible&&!dialogOpen&&!panel.hidden
    &&document.documentElement.dataset.entry!=='loading'&&(workspace.getAttribute('aria-busy')!=='true'||sectionEntering);
  const surface=createProjectLoopSurface(root.querySelector('.loop-canvas'),{signal,isActive:available,invalidate:()=>{if(available()){paint();if(intro!==null)wake();}}});
  surface?.prime(projects.map(project=>mediaPath(project.image)||''));
  const pause=()=>{
    if(frame)cancelAnimationFrame(frame);frame=0;previous=null;target=position;sway=swayVelocity=0;
    const pointer=drag?.id;drag=null;
    if(pointer!==undefined&&viewport.hasPointerCapture?.(pointer))viewport.releasePointerCapture(pointer);
    delete viewport.dataset.dragging;
    notifyMotion(false);
  };
  function updateCaption(){
    const selected=wrapProject(Math.round(position),projects.length);
    if(selected===current)return;current=selected;
    const project=projects[selected];kind.textContent=project.type;title.textContent=project.name;
    status.textContent=project.status==='placeholder'?'Placeholder preview':'';
    openButton.dataset.project=String(selected);openButton.setAttribute('aria-label',`View ${project.name} project`);
  }
  function paint(){
    const cards=[];
    slots.forEach(state=>{
      const slot=loopSlot(state.slot,position,projects.length);
      const progress=reduced.matches||forced.matches?1:needsEntrance?0:intro??1;
      const arrival=loopArrival(slot.relative,progress,height);
      const pose=poseFor(slot.relative+arrival.shift,width,height,reduced.matches?0:sway,reduced.matches||forced.matches);
      if(!pose.vertical)pose.y+=arrival.rise;
      pose.opacity*=arrival.opacity;
      if(slot.project!==state.project){
        state.project=slot.project;const project=projects[slot.project],image=mediaPath(project.image)||'';
        state.image.src=image;state.button.dataset.index=String(slot.project);
      }
      const {element}=state;
      const resized=state.width!==pose.width;
      if(resized){state.width=pose.width;element.style.width=`${pose.width}px`;element.style.height=`${pose.height}px`;}
      element.style.opacity=String(pose.opacity);element.style.zIndex=String(100-Math.round(Math.abs(slot.relative)*20));
      state.button.style.pointerEvents=pose.opacity>.1&&pose.reveal>.03?'auto':'none';
      const concealed=(1-pose.reveal)*100;
      state.button.style.clipPath=`inset(0 ${pose.edgeSide>0?concealed:0}% 0 ${pose.edgeSide<0?concealed:0}% round 14px)`;
      element.style.transform=`translate3d(${pose.x-pose.width/2}px,${pose.y-pose.height/2}px,${pose.z}px) rotate${pose.vertical?'X':'Y'}(${pose.vertical?-pose.turn:pose.turn}deg) rotateZ(${pose.roll}deg) scale(${pose.scale})`;
      cards.push({slot:state.slot,project:state.project,source:mediaPath(projects[state.project].image)||'',pose});
    });
    const rendered=surface?.draw(cards,width,height,window.devicePixelRatio||1);
    paintedCards=cards.filter(card=>rendered?.has(card.slot));
    slots.forEach(state=>{
      const status=surface?.status(mediaPath(projects[state.project].image)||'');
      // A pending GPU texture is not a failure: don't flash a flat DOM card.
      // Only a genuine image/upload/context failure enables that fallback.
      state.element.dataset.gpu=String(Boolean(rendered?.has(state.slot)||status==='loading'||status==='ready'));
      if(state.element.dataset.gpu==='true')state.button.style.pointerEvents='none';
    });
    updateCaption();
  }
  function announce(){announcement.textContent=`${current+1} of ${projects.length}: ${projects[current].name}`;}
  function tick(time){
    frame=0;if(!available())return;
    const dt=previous===null?16:Math.min(40,Math.max(0,time-previous));previous=time;
    if(intro!==null){intro+=dt/(LOOP_ARRIVAL_MS*(compact.matches ? .8 : 1));if(intro>=1)intro=null;}
    const before=position;position+=(target-position)*(1-Math.exp(-dt/95));
    if(Math.abs(target-position)<.0003)position=target;
    const spring=advanceLoopSway(sway,swayVelocity,(position-before)*1000/Math.max(dt,1),dt/1000);
    sway=spring.sway;swayVelocity=spring.velocity;
    if(position===target&&Math.abs(sway)<.0005&&Math.abs(swayVelocity)<.005)sway=swayVelocity=0;
    paint();
    if(position!==target||sway!==0||swayVelocity!==0||intro!==null)frame=requestAnimationFrame(tick);else{
      previous=null;
      const cycle=projects.length*slots.length;
      if(!drag&&Math.abs(position)>cycle*4){const shift=Math.trunc(position/cycle)*cycle;position-=shift;target-=shift;paint();}
      announce();
      notifyMotion(false);
    }
  }
  function wake(){
    if(!available())return;
    if(reduced.matches||forced.matches){position=target;sway=swayVelocity=0;intro=null;needsEntrance=false;paint();announce();notifyMotion(false);return;}
    // Wait for the real visible pool instead of spending the entrance while
    // textures are loading. Load/error callbacks wake this same finite owner.
    if(intro===0&&slots.some(state=>{
      const relative=loopSlot(state.slot,position,projects.length).relative;
      const visibleDuringArrival=[.2,.5,1].some(progress=>{
        const arrival=loopArrival(relative,progress,height),pose=poseFor(relative+arrival.shift,width,height);
        return arrival.opacity>.01&&pose.opacity>.01&&pose.reveal>.01;
      });
      if(!visibleDuringArrival)return false;
      const status=surface?.status(mediaPath(projects[state.project]?.image)||'');
      return status==='loading'||(!surface||status==='failed'||status==='unavailable')&&state.image.complete===false;
    }))return;
    if(!frame){notifyMotion(true);frame=requestAnimationFrame(tick);}
  }
  function move(step){if(!available()||projects.length<2)return;target=Math.round(target)+step;wake();}
  function measure(repaint=true){
    viewport.dataset.axis=compact.matches?'vertical':'horizontal';
    const rect=viewport.getBoundingClientRect();if(rect.width>0)width=rect.width;if(rect.height>0)height=rect.height;
    if(repaint)paint();
  }
  function sync(){
    const active=available();
    if(!active){pause();wasActive=false;return;}
    if(!wasActive){
      target=position;
      if(needsEntrance&&!reduced.matches&&!forced.matches)intro=0;
      needsEntrance=false;
    }
    measure();
    wasActive=true;
    if(intro!==null)wake();
  }
  on(viewport,'wheel',event=>{
    if(!available()||event.ctrlKey||event.metaKey||projects.length<2)return;
    const distance=wheelProjects(compact.matches?{deltaY:event.deltaY,deltaMode:event.deltaMode}:event,height);
    if(!distance)return;
    event.preventDefault();target+=distance;wake();
  },{passive:false});
  on(viewport,'pointerdown',event=>{
    if(!available()||event.button!==0||event.isPrimary===false||projects.length<2)return;
    target=position;clickBlocked=false;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,origin:position,lastTarget:position,lastTime:event.timeStamp,velocity:0,axis:null,compact:compact.matches};
  });
  on(viewport,'pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.axis){
      if(!drag.compact&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){drag=null;return;}
      if(drag.compact&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){drag=null;clickBlocked=true;return;}
      if(Math.abs(drag.compact?dy:dx)<6)return;
      drag.axis=drag.compact?'y':'x';
      viewport.setPointerCapture?.(event.pointerId);viewport.dataset.dragging='true';clickBlocked=true;
    }
    event.preventDefault();
    const distance=drag.axis==='y'?dy:dx,span=poseFor(0,width,height).step;
    target=drag.origin-distance/span;
    const dt=Math.max(8,event.timeStamp-drag.lastTime);
    drag.velocity=Math.max(-.012,Math.min(.012,(target-drag.lastTarget)/dt));drag.lastTarget=target;drag.lastTime=event.timeStamp;wake();
  },{passive:false});
  function release(event){
    if(!drag||drag.id!==event.pointerId)return;
    const moved=Boolean(drag.axis),velocity=event.timeStamp-drag.lastTime<90?drag.velocity:0;
    drag=null;delete viewport.dataset.dragging;
    if(viewport.hasPointerCapture?.(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    if(moved){target=compact.matches?Math.round(target+Math.max(-.65,Math.min(.65,velocity*110))):target+velocity*110;wake();}
  }
  on(viewport,'pointerup',release);on(viewport,'pointercancel',event=>{if(drag?.id===event.pointerId){drag=null;target=position;delete viewport.dataset.dragging;wake();}});
  on(viewport,'lostpointercapture',event=>{
    // Touch implicitly captures the initial child. Its bubbled loss during
    // transfer to viewport is not a loss of the gallery's active gesture.
    if(!drag||event.target!==viewport||event.pointerId!==drag.id||viewport.hasPointerCapture?.(event.pointerId))return;
    drag=null;target=position;delete viewport.dataset.dragging;wake();
  });
  on(viewport,'keydown',event=>{
    if(compact.matches&&['ArrowLeft','ArrowRight'].includes(event.key))return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key)||!available())return;
    event.preventDefault();
    if(event.key==='Enter'||event.key===' '){viewport.focus({preventScroll:true});onOpen(current);return;}
    if(event.key==='Home'||event.key==='End'){const nearest=Math.round(target);target=nearest+(event.key==='Home'?0:projects.length-1)-wrapProject(nearest,projects.length);wake();}
    else move(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
  });
  on(viewport,'click',event=>{
    if(event.target.closest?.('.loop-card-button'))return;
    if(clickBlocked){clickBlocked=false;return;}
    if(!available())return;
    const rect=viewport.getBoundingClientRect(),x=event.clientX-(rect.left||0),y=event.clientY-(rect.top||0);
    const card=paintedCards.find(card=>hitLoopCard(card.pose,x,y,width,height));
    if(card){viewport.focus({preventScroll:true});onOpen(card.project);}
  });
  slots.forEach(state=>on(state.button,'click',()=>{
    if(clickBlocked){clickBlocked=false;return;}
    if(!available())return;viewport.focus({preventScroll:true});onOpen(state.project);
  }));
  on(document,'portfolio:sectionstart',event=>{
    pause();wasActive=false;
    sectionEntering=event.detail?.entering===true&&event.detail.view==='projects';
    needsEntrance=sectionEntering;
    if(sectionEntering){root.dataset.sectionEntering='true';sync();}else delete root.dataset.sectionEntering;
  });
  on(document,'portfolio:sectionsettled',()=>{sectionEntering=false;delete root.dataset.sectionEntering;sync();});
  on(document,'portfolio:entryready',sync);
  slots.forEach(state=>{for(const type of ['load','error'])on(state.image,type,()=>{if(available()){paint();if(intro!==null)wake();}});});
  // The preview stays interactive behind the open glass. Its movement signal
  // gates the portrait; the rail field flows independently of navigation.
  on(document,'visibilitychange',sync);on(window,'blur',()=>{focused=false;sync();});
  on(window,'focus',()=>{focused=true;sync();});on(window,'pagehide',()=>{pageActive=false;sync();});on(window,'pageshow',()=>{pageActive=true;sync();});
  on(window,'resize',()=>{pause();measure();sync();});
  on(reduced,'change',()=>{pause();paint();sync();});on(forced,'change',()=>{pause();paint();sync();});
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;sync();}):null;
  observer?.observe(viewport);
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(available()){measure(false);wake();}}):null;resize?.observe(viewport);
  root.dataset.enhanced='true';viewport.hidden=false;caption.hidden=true;controls.hidden=false;fallback.hidden=true;
  measure();sync();
  signal.addEventListener('abort',()=>{
    pause();observer?.disconnect();resize?.disconnect();
    root.dataset.enhanced='false';viewport.hidden=true;caption.hidden=true;controls.hidden=true;fallback.hidden=false;
    delete root.dataset.sectionEntering;
  },{once:true});
  return {setDialogOpen(open){dialogOpen=open;sync();}};
}
