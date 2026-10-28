export const portraitSource = '/profile/selfphoto.png';
export const portraitSize = { width: 200, height: 250 };

// More headroom and shoulders: keep a proportional crop without enlarging the face.
export function portraitCrop(width, height) {
  const x = width * .24, y = height * .265;
  const cropWidth = Math.min(width * .52, (height - y) * portraitSize.width / portraitSize.height);
  return { x, y, width: cropWidth, height: cropWidth * portraitSize.height / portraitSize.width };
}

export const portraitTreatment={asciiOpacity:1,coverageFloor:.9};

// The rectangle retains all source pixels: no feathered sides or faded shirt.
export function portraitEdgeAlpha() { return 1; }

export function portraitEffect({ rx, ry, elapsed, still }) {
  if (still) return { x: 0, y: 0 };
  return {
    x: rx * 1.8 + Math.sin(elapsed * .00025) * .35,
    y: ry * 1.2,
  };
}

// Each point retains the source alpha and brightness; no random face/noise.
export function portraitAsciiGrid(displayWidth) {
  const columns=Math.max(28,Math.min(56,Math.round(displayWidth/3.7)));
  return {columns,rows:Math.round(columns*.95)};
}

export function portraitAsciiCells(pixels,columns,rows) {
  const cells=[];
  const luma=(column,row)=>{
    const offset=(row*columns+column)*4;
    return (pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722)/255;
  };
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    const offset=(row*columns+column)*4,alpha=pixels[offset+3]/255;
    if(alpha<.06)continue;
    const source=luma(column,row);
    // One cached unsharp pass preserves the small dark boundaries of the eyes,
    // nostrils and lips. Never sample transparent neighbours into a facial edge.
    let sum=0,count=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const cx=column+dx,cy=row+dy;
      if(cx<0||cx>=columns||cy<0||cy>=rows||pixels[(cy*columns+cx)*4+3]<16)continue;
      sum+=luma(cx,cy);count++;
    }
    const luminance=Math.max(0,Math.min(1,source+.85*(source-sum/Math.max(1,count))));
    const phase=column*.31+row*.17,x=(column+.5)*portraitSize.width/columns,y=(row+.5)*portraitSize.height/rows;
    const random=Math.sin(phase*12.9898+x*78.233+y*37.719)*43758.5453;
    cells.push({x:(column+.5)*portraitSize.width/columns,y:(row+.5)*portraitSize.height/rows,
      luminance,alpha,phase,rhythmSeed:random-Math.floor(random)});
  }
  return cells;
}

export function portraitAsciiTone(luminance,light) {
  // Keep a broad midtone range instead of clipping whole cheeks to white.
  const exposed=Math.min(1,Math.max(0,luminance*1.5));
  return Math.max(0,Math.min(31,Math.round(Math.pow(light?1-exposed:exposed,.9)*31)));
}

export const portraitAsciiVariants=4;
export const portraitAsciiTempo={bpm:72,beats:8};
const portraitAsciiEvents=[[0,.5],[1.5,.65],[4,.45],[5,1.05]];

export function portraitAsciiGlyph(tone,variant=0) {
  // Substitutions stay in one brightness family; the photo's tone never sweeps.
  const marks=[['.',',',"'",'`'],[':', ';', '!', 'i'],['+', 'x', '*', 't'],
    ['*','o','s','v'],['#','H','X','N'],['%','B','8','R'],['@','M','W','Q'],['M','W','#','@']];
  // Tone is carried by character density, not translucent gray strokes.
  return {mark:marks[Math.min(7,Math.floor(tone/4))][variant%portraitAsciiVariants],alpha:1};
}

export function portraitAsciiPose(cell) {
  // The grid is anchored. Only character identity changes, never the silhouette.
  return {x:cell.x,y:cell.y};
}

export function portraitAsciiPulse(cell,elapsed,still=false) {
  if(still)return {from:0,to:0,mix:0};
  const random=cell.rhythmSeed??Math.sin(cell.phase*12.9898+cell.x*78.233+cell.y*37.719)*43758.5453;
  const seed=random-Math.floor(random),beatMs=60000/portraitAsciiTempo.bpm;
  const beat=(Math.max(0,elapsed)/beatMs)%portraitAsciiTempo.beats;
  let variant=Math.floor(seed*portraitAsciiVariants);
  // Two short gestures, a rest, then an accent and a longer resolving change.
  for(const [start,duration] of portraitAsciiEvents) {
    const local=(beat-start-seed*.38)/duration;
    if(local<0)break;
    const next=(variant+1)%portraitAsciiVariants;
    if(local<1)return {from:variant,to:next,mix:local*local*(3-2*local)};
    variant=next;
  }
  return {from:variant,to:variant,mix:0};
}
