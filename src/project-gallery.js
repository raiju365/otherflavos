import {loopSlot,loopPose,reelPose,hitLoopCard,loopSequence,loopDeparture,loopDepartureDuration,LOOP_ARRIVAL_MS,LOOP_CARD_TRAVEL,LOOP_ANGULAR_STEP,advanceLoopSway,wheelProjects,wrapProject} from './project-loop-model.js';
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
  let paintedCards=[],lastCards=[],entranceOrder=new Map(),entranceFrom=null,departure=null,introDuration=LOOP_ARRIVAL_MS,leftForNavigation=false;
  let motionNotified=false;
  function notifyMotion(moving){
    if(motionNotified===moving)return;motionNotified=moving;
    document.documentElement.dataset.galleryMoving=String(moving);
    document.dispatchEvent(new CustomEvent('portfolio:gallerymotion',{detail:{moving}}));
  }
  const poseFor=(...args)=>(compact.matches?reelPose:loopPose)(...args);
  const available=()=>!signal.aborted&&!document.hidden&&pageActive&&focused&&visible&&!dialogOpen&&!panel.hidden
    &&document.documentElement.dataset.entry!=='loading'&&(workspace.getAttribute('aria-busy')!=='true'||sectionEntering||departure!==null);
  const canInteract=()=>available()&&departure===null;
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
      const rank=entranceOrder.get(state.slot),presence=rank===undefined?0:loopSequence(progress,rank,entranceOrder.size);
      const from=entranceFrom?.get(state.slot)?.pose;
      const start=from?from.angle/LOOP_ANGULAR_STEP-slot.relative:LOOP_CARD_TRAVEL;
      let pose=poseFor(slot.relative+(progress<1?start*(1-presence):0),width,height,reduced.matches?0:sway,reduced.matches||forced.matches);
      if(progress<1)pose.opacity=from?from.opacity*(1-presence)+pose.opacity*presence:pose.opacity*presence;
      if(departure){
        const sampled=departure.from.get(state.slot)?.pose;
        const leavingRank=departure.order.get(state.slot);
        pose=sampled?(leavingRank===undefined?{...sampled,opacity:0}:loopDeparture(sampled,departure.progress,leavingRank,departure.order.size,height,slot.relative*LOOP_ANGULAR_STEP)):{...pose,opacity:0};
      }
      if(slot.project!==state.project){
        state.project=slot.project;const project=projects[slot.project],image=mediaPath(project.image)||'';
        state.image.src=image;state.button.dataset.index=String(slot.project);
      }
      const {element}=state;
      const resized=state.width!==pose.width;
      if(resized){state.width=pose.width;element.style.width=`${pose.width}px`;element.style.height=`${pose.height}px`;}
      element.style.opacity=String(pose.opacity);element.style.zIndex=String(100-Math.round(Math.abs(slot.relative)*20));
      state.button.style.pointerEvents=!departure&&pose.opacity>.1&&pose.reveal>.03?'auto':'none';
      const concealed=(1-pose.reveal)*100;
      state.button.style.clipPath=`inset(0 ${pose.edgeSide>0?concealed:0}% 0 ${pose.edgeSide<0?concealed:0}% round 14px)`;
      element.style.transform=`translate3d(${pose.x-pose.width/2}px,${pose.y-pose.height/2}px,${pose.z}px) rotate${pose.vertical?'X':'Y'}(${pose.vertical?-pose.turn:pose.turn}deg) rotateZ(${pose.roll}deg) scale(${pose.scale})`;
      cards.push({slot:state.slot,relative:slot.relative,project:state.project,source:mediaPath(projects[state.project].image)||'',pose});
    });
    lastCards=cards;
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
  function prepareEntrance(){
    const visibleSlots=slots.map(state=>({slot:state.slot,...loopSlot(state.slot,position,projects.length)}))
      .filter(slot=>{
        const pose=poseFor(slot.relative,width,height),from=entranceFrom?.get(slot.slot)?.pose;
        return pose.opacity>.01&&pose.reveal>.01&&(!from||from.opacity<pose.opacity-.001||Math.abs(from.angle-pose.angle)>.0001);
      })
      .sort((a,b)=>Math.abs(a.relative)-Math.abs(b.relative)||b.relative-a.relative);
    entranceOrder=new Map(visibleSlots.map((slot,index)=>[slot.slot,index]));
    introDuration=entranceFrom?Math.min(LOOP_ARRIVAL_MS,260+Math.max(0,visibleSlots.length-1)*180):LOOP_ARRIVAL_MS;
    if(!visibleSlots.length)intro=null;
  }
  function finishDeparture(hide=false){
    if(!departure)return;
    if(hide){departure.progress=1;paint();}
    const done=departure.resolve;departure=null;delete root.dataset.sectionExiting;
    if(frame)cancelAnimationFrame(frame);frame=0;previous=null;notifyMotion(false);done();
  }
  function leave(){
    leftForNavigation=true;
    const from=new Map(lastCards.map(card=>[card.slot,{...card,pose:{...card.pose}}]));
    finishDeparture();pause();sectionEntering=false;delete root.dataset.sectionEntering;
    intro=null;needsEntrance=false;entranceFrom=null;
    const visibleCards=[...from.values()].filter(card=>card.pose.opacity>.001&&card.pose.reveal>.01)
      .sort((a,b)=>Math.abs(b.relative)-Math.abs(a.relative)||a.relative-b.relative);
    if(!visibleCards.length||reduced.matches||forced.matches||document.hidden||!visible||!pageActive||!focused||dialogOpen)return Promise.resolve();
    const task=new Promise(resolve=>{departure={from,order:new Map(visibleCards.map((card,index)=>[card.slot,index])),progress:0,
      duration:loopDepartureDuration(visibleCards.length,compact.matches),resolve};});
    root.dataset.sectionExiting='true';paint();wake();return task;
  }
  function tick(time){
    frame=0;if(!available()){finishDeparture(true);return;}
    const dt=previous===null?16:Math.min(40,Math.max(0,time-previous));previous=time;
    if(departure){
      departure.progress=Math.min(1,departure.progress+dt/departure.duration);paint();
      if(departure.progress===1)finishDeparture();else frame=requestAnimationFrame(tick);
      return;
    }
    if(intro!==null){intro+=dt/(introDuration*(compact.matches ? .8 : 1));if(intro>=1){intro=null;entranceFrom=null;}}
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
    if(departure){if(reduced.matches||forced.matches)finishDeparture(true);else if(!frame){notifyMotion(true);frame=requestAnimationFrame(tick);}return;}
    if(reduced.matches||forced.matches){position=target;sway=swayVelocity=0;intro=null;needsEntrance=false;paint();announce();notifyMotion(false);return;}
    // Wait for the real visible pool instead of spending the entrance while
    // textures are loading. Load/error callbacks wake this same finite owner.
    if(intro===0&&slots.some(state=>{
      if(!entranceOrder.has(state.slot))return false;
      const status=surface?.status(mediaPath(projects[state.project]?.image)||'');
      return status==='loading'||(!surface||status==='failed'||status==='unavailable')&&state.image.complete===false;
    }))return;
    if(!frame){notifyMotion(true);frame=requestAnimationFrame(tick);}
  }
  function move(step){if(!canInteract()||projects.length<2)return;target=Math.round(target)+step;wake();}
  function measure(repaint=true){
    viewport.dataset.axis=compact.matches?'vertical':'horizontal';
    const rect=viewport.getBoundingClientRect();if(rect.width>0)width=rect.width;if(rect.height>0)height=rect.height;
    if(repaint)paint();
  }
  function sync(){
    const active=available();
    if(!active){finishDeparture(true);pause();wasActive=false;return;}
    measure(false);
    if(!wasActive){
      target=position;
      if(needsEntrance&&!reduced.matches&&!forced.matches){intro=0;prepareEntrance();}
      needsEntrance=false;
    }
    paint();
    wasActive=true;
    if(intro!==null||departure)wake();
  }
  on(viewport,'wheel',event=>{
    if(!canInteract()||event.ctrlKey||event.metaKey||projects.length<2)return;
    const distance=wheelProjects(compact.matches?{deltaY:event.deltaY,deltaMode:event.deltaMode}:event,height);
    if(!distance)return;
    event.preventDefault();target+=distance;wake();
  },{passive:false});
  on(viewport,'pointerdown',event=>{
    if(!canInteract()||event.button!==0||event.isPrimary===false||projects.length<2)return;
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
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key)||!canInteract())return;
    event.preventDefault();
    if(event.key==='Enter'||event.key===' '){viewport.focus({preventScroll:true});onOpen(current);return;}
    if(event.key==='Home'||event.key==='End'){const nearest=Math.round(target);target=nearest+(event.key==='Home'?0:projects.length-1)-wrapProject(nearest,projects.length);wake();}
    else move(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
  });
  on(viewport,'click',event=>{
    if(event.target.closest?.('.loop-card-button'))return;
    if(clickBlocked){clickBlocked=false;return;}
    if(!canInteract())return;
    const rect=viewport.getBoundingClientRect(),x=event.clientX-(rect.left||0),y=event.clientY-(rect.top||0);
    const card=paintedCards.find(card=>hitLoopCard(card.pose,x,y,width,height));
    if(card){viewport.focus({preventScroll:true});onOpen(card.project);}
  });
  slots.forEach(state=>on(state.button,'click',()=>{
    if(clickBlocked){clickBlocked=false;return;}
    if(!canInteract())return;viewport.focus({preventScroll:true});onOpen(state.project);
  }));
  on(document,'portfolio:sectionstart',event=>{
    if(event.detail?.entering!==true&&!panel.hidden&&workspace.dataset.view==='projects'){
      const task=leave();event.detail?.waitUntil?.(task);return;
    }
    const returning=event.detail?.entering===true&&event.detail.view==='projects';
    const from=returning&&departure?new Map(lastCards.map(card=>[card.slot,{...card,pose:{...card.pose}}])):null;
    finishDeparture(!returning);pause();wasActive=false;sectionEntering=returning;needsEntrance=returning;entranceFrom=from;leftForNavigation=false;
    if(returning){root.dataset.sectionEntering='true';sync();}else delete root.dataset.sectionEntering;
  });
  on(document,'portfolio:sectionsettled',()=>{
    if(departure||leftForNavigation){
      const returning=!panel.hidden&&workspace.dataset.view==='projects';
      const from=returning?new Map(lastCards.map(card=>[card.slot,{...card,pose:{...card.pose}}])):null;
      finishDeparture(!returning);
      if(returning){needsEntrance=true;wasActive=false;entranceFrom=from;}
    }
    leftForNavigation=false;
    sectionEntering=false;delete root.dataset.sectionEntering;sync();
  });
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
    finishDeparture(true);pause();observer?.disconnect();resize?.disconnect();
    root.dataset.enhanced='false';viewport.hidden=true;caption.hidden=true;controls.hidden=true;fallback.hidden=false;
    delete root.dataset.sectionEntering;
  },{once:true});
  return {setDialogOpen(open){dialogOpen=open;sync();}};
}
