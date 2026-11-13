// One continuous surface sampled with fine points, from the About artwork's
// original family of forms. Both renderers use the same projected geometry.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const turn = Math.PI * 2;
const forms = [
  { name: 'rosette', bend: .21, twist: 3.65, ribs: .15, waist: .08 },
  { name: 'knot', bend: .24, twist: 3.95, ribs: .08, waist: .38 },
  { name: 'islands', bend: .29, twist: 2.20, ribs: .14, waist: .25 },
  { name: 'radial', bend: .19, twist: 4.55, ribs: .09, waist: .14 },
  { name: 'coral', bend: .30, twist: 2.85, ribs: .17, waist: .10 },
  { name: 'folds', bend: .29, twist: 3.35, ribs: .11, waist: .21 },
  { name: 'orbits', bend: .20, twist: 2.55, ribs: .05, waist: .04 },
];
export const POINTILLIST_FORMS = forms.map(form => form.name);

let randomState = 78193;
const random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 4294967296;
};
const itinerary = [];
for (let round = 0; round < 8; round++) {
  const set = forms.map((_, index) => index);
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [set[i], set[j]] = [set[j], set[i]];
  }
  if (set[0] === itinerary.at(-1)?.form) [set[0], set[1]] = [set[1], set[0]];
  set.forEach(form => itinerary.push({ form, duration: 6 + random() * 2, seed: random() * turn }));
}
if (itinerary.at(-1).form === itinerary[0].form) {
  [itinerary.at(-1).form, itinerary.at(-2).form] = [itinerary.at(-2).form, itinerary.at(-1).form];
}
let itineraryDuration = 0;
for (const stage of itinerary) {
  stage.start = itineraryDuration;
  itineraryDuration += stage.duration;
}
export function pointillistMotion(time) {
  const elapsed = Math.max(0, time);
  const local = elapsed % itineraryDuration;
  const index = itinerary.findLastIndex(stage => stage.start <= local);
  const stage = itinerary[index];
  const next = itinerary[(index + 1) % itinerary.length];
  return {
    flow: elapsed * .45,
    from: stage.form,
    to: next.form,
    morph: smooth((local - stage.start) / stage.duration),
    fromSeed: stage.seed,
    toSeed: next.seed,
  };
}

export function createPointillistField(width, height, fallback = false) {
  const verticalScale = Math.min(height * .35, Math.max(1, height - 12) * .37, width * .31);
  const columnPitch = fallback ? 6.4 : 4;
  const rowPitch = fallback ? 5.2 : 3.5;
  const budget = fallback ? 6500 : 28000;
  const rows = Math.min(160, Math.max(16, Math.round(verticalScale * 2.85 / rowPitch)));
  const columns = Math.min(Math.floor(budget / rows), Math.max(12, Math.round(width * .8 / columnPitch)));
  const count = columns * rows;
  const samples = new Float32Array(count * 4);
  // Stagger the rings and jitter once so dots stay attached to the surface.
  let seed = 5617;
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const index = (column * rows + row) * 4;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const angle = (row + (column % 2) * .5 + (seed & 255) / 512) * turn / rows;
      samples[index] = Math.cos(angle);
      samples[index + 1] = Math.sin(angle);
      samples[index + 2] = ((seed >>> 8 & 255) / 255 - .5) * .9;
      samples[index + 3] = (seed >>> 16 & 255) / 255;
    }
  }
  return { width, height, verticalScale, columns, rows, count, samples, dots: new Float32Array(count * 4) };
}

export function projectPointillistField(field, state) {
  const { width, height, verticalScale, columns, rows, samples, dots } = field;
  const { from, to, morph, fromSeed, toSeed, flow } = state;
  const bend = mix(forms[from].bend, forms[to].bend, morph);
  const twist = mix(forms[from].twist, forms[to].twist, morph);
  const ribs = mix(forms[from].ribs, forms[to].ribs, morph);
  const waist = mix(forms[from].waist, forms[to].waist, morph);
  const phase = flow + .75 * mix(Math.sin(fromSeed), Math.sin(toSeed), morph);
  const impact = clamp(state.impact || 0);
  const detail = clamp(state.detail || 0);
  const body = clamp(state.body || 0);
  const halfWidth = width * (.375 + impact * .013);
  const yScale = verticalScale * (1 + impact * .085);
  const spread = .62 + impact * .12 + detail * .025;

  for (let column = 0; column < columns; column++) {
    const u = (column + .5) * 2 / columns - 1;
    const taper = Math.sqrt(1 - u * u);
    const wave = u * 4.4 - phase;
    const centerY = bend * Math.sin(wave) + .085 * Math.sin(8.4 * u + .68 * phase) - .14 * u;
    const centerZ = .29 * Math.cos(wave) + .16 * u;
    const wide = taper * (.78 + ribs * Math.cos(8.2 * u - .8 * phase) - waist * (1 - u * u));
    const thin = taper * (.17 + .035 * Math.cos(wave));
    const roll = u * twist + .4 * Math.sin(5 * u - .86 * phase) + flow * 1.02 + .48;
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);
    const wideCos = wide * cosRoll, wideSin = wide * sinRoll;
    const thinCos = thin * cosRoll, thinSin = thin * sinRoll;

    for (let row = 0; row < rows; row++) {
      const index = (column * rows + row) * 4;
      const cos = samples[index];
      const sin = samples[index + 1];
      const grain = samples[index + 3];
      const y = centerY + cos * wideCos - sin * thinSin;
      const z = centerZ + cos * wideSin + sin * thinCos;
      const x = (u + samples[index + 2] * 2 / columns) * halfWidth;
      const perspective = 1 / (1 - z * .14);

      // The ellipse normal shades the curved surface. The rear face is
      // sparse and translucent, so its dots suggest depth through the front.
      const normalY = cos * thinCos - sin * wideSin;
      const normalZ = cos * thinSin + sin * wideCos;
      const invLength = 1 / Math.sqrt(normalY * normalY + normalZ * normalZ);
      const facing = normalZ * invLength;
      const front = smooth((facing + .25) / .85);
      const lit = clamp((normalZ * .68 - normalY * .74) * invLength);
      const silhouette = 1 - Math.abs(facing);
      const rim = silhouette * silhouette;
      const opacity = (.035 + front * (.34 + lit * .51) + rim * .14 + body * .02)
        * (.72 + grain * .28);
      const radius = (spread + front * .27 + grain * .2) * perspective;

      dots[index] = width * .5 + (x + z * yScale * .16) * perspective;
      dots[index + 1] = height * .5 + y * yScale * perspective;
      dots[index + 2] = radius;
      dots[index + 3] = opacity;
    }
  }

  return dots;
}

const vertex = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aDot;
uniform vec2 uSize;
uniform float uRatio;
out float vAlpha;
void main() {
  gl_Position = vec4(aDot.xy / uSize * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
  float diameter = aDot.z * 2. * uRatio;
  gl_PointSize = max(1., diameter);
  vAlpha = aDot.w * min(1., diameter * diameter);
}`;

const fragment = `#version 300 es
precision highp float;
uniform vec3 uInk;
in float vAlpha;
out vec4 color;
void main() {
  float d = length(gl_PointCoord * 2. - 1.);
  float edge = clamp(fwidth(d), .08, .4);
  color = vec4(uInk, (1. - smoothstep(1. - edge, 1., d)) * vAlpha);
}`;

export function themeInkRGB(ink) {
  if (/^#[\da-f]{6}$/i.test(ink)) return [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16) / 255);
  const channels = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i.exec(ink);
  return channels ? channels.slice(1, 4).map(n => clamp(Number(n) / 255)) : [1, 1, 1];
}

const opacityBands = [0, .12, .32, .55, .76, 1];
const paintOpacity = [.06, .22, .43, .65, .88];
function createCanvasRenderer(canvas) {
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch { return null; }
  if (!ctx) return null;
  return {
    kind: 'canvas2d',
    restore() {},
    dispose() {},
    paint(field, state, ink, ratio) {
      const dots = projectPointillistField(field, state);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, field.width, field.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(6, 6, field.width - 12, field.height - 12);
      ctx.clip();
      ctx.fillStyle = ink;
      for (let band = 0; band < paintOpacity.length; band++) {
        ctx.globalAlpha = paintOpacity[band];
        ctx.beginPath();
        for (let i = 0; i < dots.length; i += 4) {
          if (dots[i + 3] < opacityBands[band] || dots[i + 3] >= opacityBands[band + 1]) continue;
          const x = dots[i];
          const y = dots[i + 1];
          const radius = dots[i + 2];
          ctx.moveTo(x + radius, y);
          ctx.arc(x, y, radius, 0, turn);
        }
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

export function createPointillistRenderer(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'low-power',
    });
  } catch { /* Use Canvas2D. */ }
  if (!gl) return createCanvasRenderer(canvas);

  let program = null;
  let array = null;
  let buffer = null;
  let uniforms = null;
  let inkValue, inkChannels;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Pointillist shader unavailable');
    }
    return shader;
  }
  function release() {
    if (program) gl.deleteProgram(program);
    if (array) gl.deleteVertexArray(array);
    if (buffer) gl.deleteBuffer(buffer);
    program = array = buffer = uniforms = null;
  }
  function restore() {
    release();
    let vs = null;
    let fs = null;
    try {
      vs = compile(gl.VERTEX_SHADER, vertex);
      fs = compile(gl.FRAGMENT_SHADER, fragment);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Pointillist renderer unavailable');
      array = gl.createVertexArray();
      buffer = gl.createBuffer();
      gl.bindVertexArray(array);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      uniforms = {
        size: gl.getUniformLocation(program, 'uSize'),
        ratio: gl.getUniformLocation(program, 'uRatio'),
        ink: gl.getUniformLocation(program, 'uInk'),
      };
    } catch (error) {
      release();
      throw error;
    } finally {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }
  }
  try { restore(); } catch { return null; }

  return {
    kind: 'webgl2',
    restore,
    dispose: release,
    paint(field, state, ink, ratio) {
      if (!program || gl.isContextLost()) return;
      const dots = projectPointillistField(field, state);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.bindVertexArray(array);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, dots, gl.STREAM_DRAW);
      gl.uniform2f(uniforms.size, field.width, field.height);
      gl.uniform1f(uniforms.ratio, ratio);
      if (ink !== inkValue || !inkChannels) {
        inkValue = ink;
        inkChannels = themeInkRGB(ink);
      }
      gl.uniform3fv(uniforms.ink, inkChannels);
      gl.drawArrays(gl.POINTS, 0, field.count);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
  };
}
