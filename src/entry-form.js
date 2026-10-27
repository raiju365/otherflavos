// An original open folded stroke: two unequal returns, never a closed loop.
// Quintic B-splines keep four derivatives continuous, including the changing
// width driven by curvature. Broad metallic faces do not acquire knot creases.
const controls = [
  [-2.75,-1.06,-.22],
  [-2,-1.02,-.16],[-1.25,-.98,-.1],[-.5,-.94,-.04],
  [1.5,-.88,.28],[1.52,-.24,.54],[.08,-.19,.12],
  [-1.48,.02,-.42],[-1.42,.65,-.4],[-.3,.83,-.15],
  [.61,1.01,.1],[1.52,1.19,.35],[2.43,1.37,.6],
];
const basis = [
  [1,-5,10,-10,5,-1],[26,-50,20,20,-20,5],[66,0,-60,0,30,-10],
  [26,50,20,-20,-20,10],[1,5,10,10,5,-5],[0,0,0,0,0,1],
];
const coefficients=controls.slice(0,-5).map((_,i)=>Array.from({length:6},(_,degree)=>
  [0,1,2].map(axis=>basis.reduce((sum,weights,j)=>sum+controls[i+j][axis]*weights[5-degree]/120,0))));
export function foldedSpine(q) {
  const scaled=q*coefficients.length, index=Math.max(0,Math.min(coefficients.length-1,Math.floor(scaled)));
  const t=scaled-index,[a,b,c,d,e,f]=coefficients[index];
  return { center:a.map((n,j)=>((((n*t+b[j])*t+c[j])*t+d[j])*t+e[j])*t+f[j]),
    derivative:a.map((n,j)=>((((5*n*t+4*b[j])*t+3*c[j])*t+2*d[j])*t+e[j])*coefficients.length),
    acceleration:a.map((n,j)=>(((20*n*t+12*b[j])*t+6*c[j])*t+2*d[j])*coefficients.length**2) };
}
const glNumber=n => { const value=n.toFixed(9).replace(/0+$/,'');return value.endsWith('.')?`${value}0`:value; };
const vector=a=>`vec3(${a.map(glNumber).join(',')})`;
// The vertex shader uses these same authored controls rather than a separate
// hand-maintained approximation of the sculpture.
export const FOLDED_SPINE_GLSL = `
void foldedSpine(float q,out vec3 center,out vec3 derivative,out vec3 acceleration) {
  float scaled=q*${glNumber(coefficients.length)},t;
  vec3 a,b,c,d,e,f;
  ${coefficients.map(([a,b,c,d,e,f],i)=>`${i===0?'if':i===coefficients.length-1?'else':'else if'}${i===coefficients.length-1?'':`(scaled<${glNumber(i+1)})`} {
    t=scaled-${glNumber(i)};a=${vector(a)};b=${vector(b)};c=${vector(c)};d=${vector(d)};e=${vector(e)};f=${vector(f)};
  }`).join('\n')}
  center=((((a*t+b)*t+c)*t+d)*t+e)*t+f;
  derivative=((((5.0*a*t+4.0*b)*t+3.0*c)*t+2.0*d)*t+e)*${glNumber(coefficients.length)};
  acceleration=(((20.0*a*t+12.0*b)*t+6.0*c)*t+2.0*d)*${glNumber(coefficients.length**2)};
}`;
