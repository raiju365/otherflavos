const clamp=value=>Math.min(1,Math.max(0,value));

// One whole-word carry: 99 recedes while 100 rolls into the same center.
// Only the cached rows transform; the counter's layout width stays fixed.
export function entryCompletionPose(value) {
  const p=clamp(value-99),n=value=>Number(value.toFixed(4));
  return {
    track:`translate3d(0,${-p*1.05}em,0)`,
    outgoing:`perspective(5em) translate3d(0,0em,0) rotateX(${n(-36*p)}deg) scale(${n(1-.04*p)},${n(1-.07*p)})`,
    incoming:`perspective(5em) translate3d(0,0em,0) rotateX(${n(36*(1-p))}deg) scale(${n(.975+.025*p)},${n(.94+.06*p)})`,
  };
}

// The existing 220ms confirmation is a small landing, then a flat, exact 100.
export function entryCompletionFrames() {
  return [
    {transform:'perspective(5em) translate3d(0,0em,0) rotateX(0deg) scale(1,1)'},
    {offset:.3,transform:'perspective(5em) translate3d(0,.008em,0) rotateX(0deg) scale(1.018,.965)'},
    {offset:.66,transform:'perspective(5em) translate3d(0,-.004em,0) rotateX(0deg) scale(.992,1.016)'},
    {transform:'perspective(5em) translate3d(0,0em,0) rotateX(0deg) scale(1,1)'},
  ];
}

// A carry rolls only over the final unit, so 39 -> 40 stays readable.
export function numeralReels(value) {
  value=Math.min(100,Math.max(0,Number.isFinite(value)?value:0));
  return [100,10,1].map(place=>{
    const digit=Math.floor(value/place)%10;
    const carry=clamp(value%place-(place-1));
    return {position:digit+carry,opacity:place===1?1:clamp(value-(place-1))};
  });
}

export function createEntryNumerals(element) {
  const group=document.createElement('span');group.className='entry-reel-group';
  const reels=[100,10,1].map(()=>{
    const window=document.createElement('span'),track=document.createElement('span');
    window.className='entry-reel-window';track.className='entry-reel-track';
    for(const digit of '01234567890'){
      const glyph=document.createElement('span');glyph.className='entry-reel-glyph';glyph.textContent=digit;track.append(glyph);
    }
    window.append(track);return {window,track};
  });
  group.append(...reels.map(reel=>reel.window));
  const finishWindow=document.createElement('span'),finishTrack=document.createElement('span'),finishRows=[];
  finishWindow.className='entry-finish-window';finishTrack.className='entry-reel-track';
  for(const number of ['99','100']){
    const row=document.createElement('span');row.className='entry-finish-row';
    for(const digit of number){
      const glyph=document.createElement('span');glyph.className='entry-reel-glyph';glyph.textContent=digit;row.append(glyph);
    }
    finishTrack.append(row);
    finishRows.push(row);
  }
  finishWindow.append(finishTrack);finishWindow.style.visibility='hidden';
  element.replaceChildren(group,finishWindow);
  const paint=value=>{
    element.dataset.value=String(Math.floor(value));
    if(value>=99){
      // One centered row carry; no simultaneous 9/9/1 rolls or width drift.
      group.style.visibility='hidden';finishWindow.style.visibility='visible';
      element.style.transform='translateX(0em)';
      const pose=entryCompletionPose(value);
      finishTrack.style.transform=pose.track;
      finishRows[0].style.transform=pose.outgoing;
      finishRows[1].style.transform=pose.incoming;
      return;
    }
    group.style.visibility='visible';finishWindow.style.visibility='hidden';
    const states=numeralReels(value);
    states.forEach((state,index)=>{
      reels[index].track.style.transform=`translate3d(0,${-state.position*1.05}em,0)`;
      reels[index].window.style.opacity=String(state.opacity);
    });
    // Center just the visible digits, including the gradual carry at 10/100.
    element.style.transform=`translateX(${-((1-states[0].opacity)+(1-states[1].opacity))*.29}em)`;
  };
  // The loader owns the finite confirmation after this renderer reaches 100.
  paint.completion=finishRows[1];
  return paint;
}
