export const portraitSource='/profile/selfphoto.png';
export const portraitSize={width:200,height:250};

export function portraitCrop(width,height){
  const x=width*.24,y=height*.265;
  const cropWidth=Math.min(width*.52,(height-y)*portraitSize.width/portraitSize.height);
  return {x,y,width:cropWidth,height:cropWidth*portraitSize.height/portraitSize.width};
}

export const portraitTreatment={asciiOpacity:1,sampleColumns:2,sampleRows:4,glyphCount:256,fontSize:48,stroke:1.2};
export const portraitAsciiVariants=4;
export const portraitAsciiTempo={bpm:72,beats:8};
const events=[[0,.5],[1.5,.65],[4,.45],[5,1.05]];
const dotBits=[1,8,2,16,4,32,64,128];
export function portraitEdgeAlpha(){return 1;}

export function portraitAsciiGrid(displayWidth){
  const columns=Math.max(32,Math.min(64,Math.round(displayWidth/3.33)));
  return {columns,rows:Math.round(columns*portraitSize.height/portraitSize.width/2)};
}

// Eight source samples per point character preserve eyes/lips instead of
// flattening an entire facial patch into one heavy alphabetic glyph.
export function portraitAsciiCells(pixels,columns,rows){
  const pw=columns*2,ph=rows*4,count=pw*ph;
  const full=pixels.length===count*4;
  const values=new Float32Array(count),alphas=new Float32Array(count),lumas=new Float32Array(count);
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
    const i=y*pw+x,o=full?i*4:(Math.floor(y/4)*columns+Math.floor(x/2))*4;
    const alpha=pixels[o+3]/255,L=(pixels[o]*.2126+pixels[o+1]*.7152+pixels[o+2]*.0722)/255;
    const exposed=Math.max(0,Math.min(1,(L-.015)/.735));
    alphas[i]=alpha;lumas[i]=L;values[i]=(1-exposed)*alpha;
  }
  const masks=Array.from({length:portraitAsciiVariants},()=>new Uint8Array(columns*rows));
  for(let variant=0;variant<portraitAsciiVariants;variant++){
    const work=Float32Array.from(values,(value,i)=>value<=.02||value>=.98?value:value+Math.sin(i*2.399963+variant*Math.PI/2)*.02);
    for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
      const i=y*pw+x;if(alphas[i]<.06)continue;
      const value=Math.max(0,Math.min(1,work[i])),dot=value>=.5?1:0,error=value-dot;
      if(dot)masks[variant][Math.floor(y/4)*columns+Math.floor(x/2)]|=dotBits[(y%4)*2+x%2];
      if(x+1<pw)work[i+1]+=error*7/16;
      if(y+1<ph){if(x>0)work[i+pw-1]+=error*3/16;work[i+pw]+=error*5/16;if(x+1<pw)work[i+pw+1]+=error/16;}
    }
  }
  const cells=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    let alpha=0,luminance=0;
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<2;dx++){const i=(row*4+dy)*pw+column*2+dx;alpha+=alphas[i]/8;luminance+=lumas[i]/8;}
    if(alpha<.06)continue;
    const phase=column*.31+row*.17,x=(column+.5)*portraitSize.width/columns,y=(row+.5)*portraitSize.height/rows;
    const random=Math.sin(phase*12.9898+x*78.233+y*37.719)*43758.5453;
    cells.push({x,y,alpha,luminance,phase,rhythmSeed:random-Math.floor(random),masks:masks.map(mask=>mask[row*columns+column])});
  }
  return cells;
}

// Braille point patterns are Unicode character glyphs, not a photograph layer.
export function portraitAsciiGlyph(mask){return {mark:String.fromCodePoint(0x2800+mask),alpha:1};}
export function portraitAsciiMask(cell,variant){return cell.masks[variant%portraitAsciiVariants];}
export function portraitAsciiPose(cell){return {x:cell.x,y:cell.y};}

export function portraitAsciiPulse(cell,elapsed,still=false){
  if(still)return {from:0,to:0,mix:0};
  const random=cell.rhythmSeed??Math.sin(cell.phase*12.9898+cell.x*78.233+cell.y*37.719)*43758.5453;
  const seed=random-Math.floor(random),beatMs=60000/portraitAsciiTempo.bpm;
  const beat=(Math.max(0,elapsed)/beatMs)%portraitAsciiTempo.beats;
  let variant=Math.floor(seed*portraitAsciiVariants);
  for(const[start,duration]of events){
    const local=(beat-start-seed*.38)/duration;if(local<0)break;
    const next=(variant+1)%portraitAsciiVariants;
    if(local<1)return {from:variant,to:next,mix:local*local*(3-2*local)};
    variant=next;
  }
  return {from:variant,to:variant,mix:0};
}
