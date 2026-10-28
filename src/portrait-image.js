export const portraitSource = '/profile/selfphoto.png';
export const portraitSize = { width: 200, height: 250 };

// Prioritize eyes/nose/mouth within the existing oval, with less shirt below.
export function portraitCrop(width, height) {
  const x = width * .29, y = height * .29;
  const cropWidth = Math.min(width * .42, (height - y) * portraitSize.width / portraitSize.height);
  return { x, y, width: cropWidth, height: cropWidth * portraitSize.height / portraitSize.width };
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
  return {x:cell.x+Math.sin(t*.42+cell.y*.032)*.4+Math.sin(t*.24+cell.phase)*.1,
    y:cell.y+Math.sin(t*.33+cell.x*.038)*.28};
}
