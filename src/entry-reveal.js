const clamp=value=>Math.min(1,Math.max(0,value));

// One continuous lower edge: broad convex bend with a small asymmetric drift.
export function entryWaveEdge(progress,x) {
  const p=clamp(progress),bend=Math.sin(Math.PI*p);
  return 1.04-1.1*p+bend*(.18*Math.sin(Math.PI*(.12+.82*x))+.035*Math.sin(2*Math.PI*x-.8));
}

export function entryWaveFrames() {
  return Array.from({length:33},(_,index)=>{
    const progress=index/32;
    const edge=Array.from({length:33},(_,point)=>{
      const x=1-point/32;
      return `${(x*100).toFixed(3)}% ${(entryWaveEdge(progress,x)*100).toFixed(3)}%`;
    });
    return {offset:progress,clipPath:`polygon(0% 0%,100% 0%,${edge.join(',')})`};
  });
}
