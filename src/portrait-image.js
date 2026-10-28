export const portraitSource = '/profile/selfphoto.png';
export const portraitSize = { width: 200, height: 250 };

// More headroom and shoulders: keep a proportional crop without enlarging the face.
export function portraitCrop(width, height) {
  const x = width * .24, y = height * .265;
  const cropWidth = Math.min(width * .52, (height - y) * portraitSize.width / portraitSize.height);
  return { x, y, width: cropWidth, height: cropWidth * portraitSize.height / portraitSize.width };
}

export const portraitTreatment={reliefOpacity:.9,asciiOpacity:.88,contrast:1.18,brightness:1.15};

export function portraitEdgeAlpha(x,y) {
  const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  return smooth(x/.08)*smooth((1-x)/.08)*(1-smooth((y-.7)/.3));
}

export function portraitEffect({ rx, ry, elapsed, still }) {
  if (still) return { x: 0, y: 0 };
  return {
    x: rx * 1.8 + Math.sin(elapsed * .00025) * .35,
    y: ry * 1.2,
  };
}

// Each point retains the source alpha and brightness; no random face/noise.
export function portraitAsciiGrid(displayWidth) {
  const columns=Math.max(40,Math.min(80,Math.round(displayWidth/2.5)));
  return {columns,rows:Math.round(columns*1.15)};
}

export function portraitAsciiCells(pixels,columns,rows) {
  const cells=[];
  const luma=(column,row)=>{
    const offset=(row*columns+column)*4;
    return (pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722)/255;
  };
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    const offset=(row*columns+column)*4,alpha=pixels[offset+3]/255*portraitEdgeAlpha((column+.5)/columns,(row+.5)/rows);
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
    cells.push({x:(column+.5)*portraitSize.width/columns,y:(row+.5)*portraitSize.height/rows,
      luminance,alpha,phase:column*.31+row*.17});
  }
  return cells;
}

export function portraitAsciiTone(luminance,light) {
  // Keep a broad midtone range instead of clipping whole cheeks to white.
  const exposed=Math.min(1,Math.max(0,luminance*1.38));
  return Math.max(0,Math.min(31,Math.round(Math.pow(light?1-exposed:exposed,.9)*31)));
}

export function portraitAsciiGlyph(tone) {
  // No horizontal -/= bands across skin. More tone steps describe real features.
  const marks=['.',':','+','*','#','%','@','M'];
  return {mark:marks[Math.min(7,Math.floor(tone/4))],alpha:.18+.82*Math.pow(tone/31,.7)};
}

export function portraitAsciiPose(cell,elapsed,still=false) {
  if(still)return {x:cell.x,y:cell.y};
  const t=elapsed/1000;
  return {x:cell.x+Math.sin(t*.9+cell.y*.032)*1.65+Math.sin(t*.5+cell.phase)*.35,
    y:cell.y+Math.sin(t*.8+cell.x*.038)*1.15};
}

export function portraitAsciiPulse(cell,elapsed,still=false) {
  if(still)return {toneOffset:0,alpha:1};
  const wave=Math.sin(elapsed*.001*1.1-cell.y*.055+cell.x*.025);
  return {toneOffset:Math.round(wave*4),alpha:.76+.24*(wave+1)/2};
}
