import { SURFACE_VERTEX, chromeFragmentSource, SCREEN_VERTEX, BLUR_FRAGMENT, GLOW_FRAGMENT,MOTION_FRAGMENT } from './entry-chrome.js';
import { createSculptureMesh } from './entry-motion.js';

export function createGLSculpture(canvas, { compact, size, ratio }) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, powerPreference: 'low-power' });
  if (!gl || typeof gl.createShader !== 'function') return null;
  const resources = [];
  let dead = false;
  const own = (kind, value) => { if (!value) throw new Error(`Cannot create ${kind}`); resources.push([kind, value]); return value; };
  function destroy() {
    if (dead) return; dead = true;
    resources.reverse().forEach(([kind, value]) => gl[`delete${kind}`](value)); resources.length = 0;
    if (!gl.isContextLost?.()) gl.getExtension?.('WEBGL_lose_context')?.loseContext();
  }
  function program(vertex, fragment) {
    const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
      const shader = own('Shader', gl.createShader(type)); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed'); return shader;
    });
    const object = own('Program', gl.createProgram()); shaders.forEach(s => gl.attachShader(object, s)); gl.linkProgram(object);
    if (!gl.getProgramParameter(object, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(object) || 'Program linking failed');
    return { object, attribute: name => gl.getAttribLocation(object, name), uniform: name => gl.getUniformLocation(object, name) };
  }
  function target(dimension, depth = false) {
    const texture = own('Texture', gl.createTexture()); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dimension, dimension, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = own('Framebuffer', gl.createFramebuffer()); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (depth) {
      const buffer = own('Renderbuffer', gl.createRenderbuffer()); gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, dimension, dimension);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, buffer);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete bloom framebuffer');
    return { texture, framebuffer, dimension };
  }
  try {
    const derivatives = Boolean(gl.getExtension('OES_standard_derivatives'));
    const mesh = createSculptureMesh(compact), surface = program(SURFACE_VERTEX, chromeFragmentSource(derivatives));
    const blur = program(SCREEN_VERTEX, BLUR_FRAGMENT), glow = program(SCREEN_VERTEX, GLOW_FRAGMENT),motion=program(SCREEN_VERTEX,MOTION_FRAGMENT);
    const vertices = own('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, mesh.parameters, gl.STATIC_DRAW);
    const indices = own('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    const screen = own('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, screen); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const bloomSize = compact ? 192 : 256, raw = target(bloomSize, true), horizontal = target(bloomSize), vertical = target(bloomSize);
    const surfaceLocation = { param: surface.attribute('aParam'), pose: surface.uniform('uPose'), roll: surface.uniform('uRoll'), reveal: surface.uniform('uReveal'), emission: surface.uniform('uEmission'), light: surface.uniform('uLight'), sweep:surface.uniform('uSweep'),glare:surface.uniform('uGlare'),travelFade:surface.uniform('uTravelFade'),travelSide:surface.uniform('uTravelSide') };
    const blurLocation = { position: blur.attribute('aPosition'), image: blur.uniform('uImage'), step: blur.uniform('uStep') };
    const glowLocation = { position: glow.attribute('aPosition'), image: glow.uniform('uImage'), pixel: glow.uniform('uPixel'),glare:glow.uniform('uGlare') };
    const motionLocation={position:motion.attribute('aPosition'),image:motion.uniform('uImage'),motion:motion.uniform('uMotion')};
    canvas.width = Math.round(size*ratio); canvas.height = Math.round(size*ratio);
    gl.clearColor(0, 0, 0, 0); gl.disable(gl.CULL_FACE); gl.depthFunc(gl.LEQUAL);
    function surfacePass(state, output, emission) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, output?.framebuffer || null);
      gl.viewport(0, 0, output?.dimension || canvas.width, output?.dimension || canvas.height);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(surface.object); gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.enableVertexAttribArray(surfaceLocation.param); gl.vertexAttribPointer(surfaceLocation.param, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.uniform4f(surfaceLocation.pose, state.formation, state.flatten, state.pitch, state.yaw);
      gl.uniform1f(surfaceLocation.roll, state.roll); gl.uniform1f(surfaceLocation.reveal, state.reveal); gl.uniform1f(surfaceLocation.emission, emission);
      gl.uniform1f(surfaceLocation.light,state.light);
      gl.uniform1f(surfaceLocation.sweep,state.sweep);gl.uniform1f(surfaceLocation.glare,state.glare);
      gl.uniform1f(surfaceLocation.travelFade,state.travelFade||0);gl.uniform1f(surfaceLocation.travelSide,state.travelSide||0);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(surfaceLocation.param);
    }
    function screenPass(p, location, input, output, stepX = 0, stepY = 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, output?.framebuffer || null); const dimension = output?.dimension || canvas.width;
      gl.viewport(0, 0, dimension, dimension); gl.disable(gl.DEPTH_TEST);
      gl.useProgram(p.object); gl.bindBuffer(gl.ARRAY_BUFFER, screen); gl.enableVertexAttribArray(location.position);
      gl.vertexAttribPointer(location.position, 2, gl.FLOAT, false, 0, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input.texture);
      gl.uniform1i(location.image, 0);
      if (p === blur) { gl.disable(gl.BLEND); gl.uniform2f(location.step, stepX, stepY); }
      else if(p===motion){gl.disable(gl.BLEND);gl.uniform2f(location.motion,stepX,stepY);}
      else {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform2f(location.pixel,1/bloomSize,1/bloomSize);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disableVertexAttribArray(location.position);
    }
    return {
      draw(state) {
        if (dead) return;
        if(Math.hypot(state.motionX||0,state.motionY||0)>.01){
          // Reuse the three bounded targets: colored shutter samples during
          // travel, then a softened halo. Centered chrome keeps its sharp pass.
          surfacePass(state,raw,0);
          screenPass(motion,motionLocation,raw,horizontal,state.motionX/size,-state.motionY/size);
          screenPass(motion,motionLocation,horizontal,null);
          screenPass(blur,blurLocation,horizontal,raw,2.2/bloomSize,0);
          screenPass(blur,blurLocation,raw,vertical,0,2.2/bloomSize);
        }else{
          surfacePass(state, null, 0); surfacePass(state, raw, 1);
          screenPass(blur, blurLocation, raw, horizontal, 2.2/bloomSize, 0);
          screenPass(blur, blurLocation, horizontal, vertical, 0, 2.2/bloomSize);
        }
        gl.useProgram(glow.object);gl.uniform1f(glowLocation.glare,state.glare);
        screenPass(glow, glowLocation, vertical, null); gl.disable(gl.BLEND);
      },
      destroy,
    };
  } catch { destroy(); return null; }
}
