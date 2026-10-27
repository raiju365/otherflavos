import {createLoopMesh} from './project-loop-model.js';
import {LOOP_VERTEX,LOOP_FRAGMENT} from './project-loop-shaders.js';

export function createProjectLoopSurface(canvas,{signal,invalidate,isActive}) {
  if(!canvas||signal.aborted||typeof canvas.getContext!=='function')return null;
  let gl;
  try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,depth:true,powerPreference:'low-power'});}catch{return null;}
  if(!gl||typeof gl.createShader!=='function')return null;
  const resources=[],textures=new Map();let dead=false;
  const own=(kind,value)=>{if(!value)throw Error(`Cannot allocate ${kind}`);resources.push([kind,value]);return value;};
  function destroy(){
    if(dead)return;dead=true;canvas.hidden=true;
    textures.forEach(entry=>{entry.image.onload=null;entry.image.onerror=null;entry.image.src='';});textures.clear();
    resources.reverse().forEach(([kind,value])=>gl[`delete${kind}`](value));resources.length=0;
    if(!gl.isContextLost?.())gl.getExtension?.('WEBGL_lose_context')?.loseContext();
  }
  try{
    const shaders=[[gl.VERTEX_SHADER,LOOP_VERTEX],[gl.FRAGMENT_SHADER,LOOP_FRAGMENT]].map(([type,source])=>{
      const shader=own('Shader',gl.createShader(type));gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Gallery shader failed');return shader;
    });
    const program=own('Program',gl.createProgram());shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Gallery program failed');
    const mesh=createLoopMesh(),vertices=own('Buffer',gl.createBuffer()),indices=own('Buffer',gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,mesh.uv,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    const attribute=gl.getAttribLocation(program,'aUV');
    const uniform=Object.fromEntries(['uViewport','uSize','uPosition','uShape','uVertical','uPassage','uOptics','uImage','uOpacity','uUVScale'].map(name=>[name,gl.getUniformLocation(program,name)]));
    function texture(source){
      if(textures.has(source))return textures.get(source);
      const image=new Image(),entry={image,ready:false,failed:false,texture:null,aspect:1.6};textures.set(source,entry);
      image.crossOrigin='anonymous';image.decoding='async';
      image.onload=()=>{
        if(dead||signal.aborted)return;
        try{
          entry.texture=own('Texture',gl.createTexture());gl.bindTexture(gl.TEXTURE_2D,entry.texture);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
          entry.aspect=image.naturalWidth/image.naturalHeight||1.6;entry.ready=true;
        }catch{entry.ready=false;entry.failed=true;}
        if(isActive())invalidate();
      };
      image.onerror=()=>{if(dead||signal.aborted)return;entry.failed=true;if(isActive())invalidate();};image.src=source;return entry;
    }
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();destroy();invalidate();},{signal});
    signal.addEventListener('abort',destroy,{once:true});
    return {
      prime(sources){
        if(dead||signal.aborted)return;
        // Prepare the real GPU images behind the existing page loader.
        [...new Set(sources)].filter(Boolean).forEach(texture);
      },
      status(source){
        if(dead||signal.aborted)return 'unavailable';
        const entry=textures.get(source);
        return entry?.failed?'failed':entry?.ready?'ready':'loading';
      },
      draw(cards,width,height,ratio=1){
        const rendered=new Set();if(dead||signal.aborted||!isActive()){canvas.hidden=true;return rendered;}
        const dpr=Math.min(width<=800?1.25:1.75,Math.max(1,ratio)),w=Math.round(width*dpr),h=Math.round(height*dpr);
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
        canvas.hidden=false;gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(uniform.uImage,0);gl.uniform2f(uniform.uViewport,width,height);
        [...cards].sort((a,b)=>a.pose.z-b.pose.z).forEach(card=>{
          if(card.pose.opacity<.001)return;
          const image=texture(card.source);if(!image.ready)return;
          const p=card.pose,aspect=p.width/p.height;
          gl.bindTexture(gl.TEXTURE_2D,image.texture);gl.uniform2f(uniform.uSize,p.width,p.height);gl.uniform3f(uniform.uPosition,p.x,p.y,p.z);
          gl.uniform4f(uniform.uShape,p.turn*Math.PI/180,p.roll*Math.PI/180,p.scale,p.bend);gl.uniform1f(uniform.uOpacity,p.opacity);
          gl.uniform1f(uniform.uVertical,p.vertical||0);
          gl.uniform3f(uniform.uPassage,p.reveal,p.edgeSide,p.edgeEnergy);
          gl.uniform3f(uniform.uOptics,p.edgeDrive,p.opticsEnabled,p.angle);
          gl.uniform2f(uniform.uUVScale,image.aspect>aspect?aspect/image.aspect:1,image.aspect<aspect?image.aspect/aspect:1);
          // All sheets belong to one cylinder and share its depth buffer.
          gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);rendered.add(card.slot);
        });
        gl.disableVertexAttribArray(attribute);return rendered;
      },destroy
    };
  }catch{destroy();return null;}
}
