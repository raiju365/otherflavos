import { FOLDED_SPINE_GLSL } from './entry-form.js';

export const SURFACE_VERTEX = `
precision highp float;
attribute vec3 aParam;
uniform vec4 uPose;
uniform float uRoll;
varying mediump vec3 vPosition;
varying mediump vec3 vNormal;
varying mediump float vArc;
varying mediump float vStrand;
const float TAU = 6.28318530718;
${FOLDED_SPINE_GLSL}
vec3 surface(vec3 uv) {
  float u = uv.x, v = uv.y;
  float q=u/TAU;
  vec3 curve,derivative,acceleration;foldedSpine(q,curve,derivative,acceleration);
  vec3 center=mix(vec3((q-.5)*2.7,(q-.5)*1.8,0.0),curve,uPose.x);
  derivative=mix(vec3(2.7,1.8,0.0),derivative,uPose.x);acceleration*=uPose.x;
  vec3 tangent=normalize(derivative);
  vec3 curvature=(acceleration-tangent*dot(acceleration,tangent))/dot(derivative,derivative);
  vec3 normal=normalize(vec3(-tangent.y,tangent.x,0.0));
  vec3 binormal = cross(tangent,normal);
  float twist=uPose.x*(.24+1.22*sin(TAU*q-.22));
  float cap=clamp(min(q,1.0-q)/.025,0.0,1.0),taper=sqrt(max(0.0,1.0-(1.0-cap)*(1.0-cap)));
  float width=.075+uPose.x*(.135+.115*sin(3.14159265359*q)+.045*sin(TAU*q));
  float thickness=.055-.021*uPose.x;
  vec3 wide=normal*cos(twist)+binormal*sin(twist),thin=-normal*sin(twist)+binormal*cos(twist);
  float reach=length(vec2(dot(curvature,wide)*width,dot(curvature,thin)*thickness))*taper;
  float profile=inversesqrt(1.0+(reach/.65)*(reach/.65));
  float across=cos(v)*width*taper*profile,depth=sin(v)*thickness*taper*profile;
  vec3 p=center+wide*across+thin*depth;
  float py = p.y*cos(uPose.z)-p.z*sin(uPose.z), pz = p.y*sin(uPose.z)+p.z*cos(uPose.z);
  float px = p.x*cos(uPose.w)+pz*sin(uPose.w), rz = -p.x*sin(uPose.w)+pz*cos(uPose.w);
  p = vec3(px*cos(uRoll)-py*sin(uRoll),px*sin(uRoll)+py*cos(uRoll),rz);
  return p;
}
void main() {
  vec3 p = surface(aParam);
  vec3 du = surface(aParam+vec3(.001,0.0,0.0))-surface(aParam-vec3(.001,0.0,0.0));
  vec3 dv = surface(aParam+vec3(0.0,.001,0.0))-surface(aParam-vec3(0.0,.001,0.0));
  vec3 normal=cross(du,dv);
  vec3 tipNormal=aParam.x<TAU*.5?-normalize(du):normalize(du);
  vPosition=p; vNormal=dot(normal,normal)>1.e-16?normalize(normal):tipNormal;
  vArc=aParam.x/TAU; vStrand=aParam.z;
  float w = 4.6-p.z;
  gl_Position=vec4(p.x*2.162,-p.y*2.162,(12.1/11.9)*w-2.4/11.9,w);
}`;

export const CHROME_FRAGMENT = `
#ifdef ENTRY_DERIVATIVES
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying mediump vec3 vPosition;
varying mediump vec3 vNormal;
varying mediump float vArc;
varying mediump float vStrand;
uniform float uReveal;
uniform float uEmission;
uniform float uLight;
uniform float uSweep;
uniform float uGlare;
uniform float uTravelFade;
uniform float uTravelSide;
float footprint(float value,float minimum) {
#ifdef ENTRY_DERIVATIVES
  return max(minimum,fwidth(value)*1.35);
#else
  return minimum;
#endif
}
void main() {
  vec3 n=normalize(vNormal), view=normalize(vec3(0.0,0.0,4.6)-vPosition);
  vec3 r=reflect(-view,n);
  r=vec3(r.x*cos(uLight)+r.z*sin(uLight),r.y,-r.x*sin(uLight)+r.z*cos(uLight));
  // Evaluate derivatives before the reveal discard so neighboring samples exist.
  float bandWidth=footprint(r.y,.095), angle=atan(r.x,r.z);
  float edgeWidth=footprint(angle,.24), arcWidth=footprint(vArc,.006);
  float keyDot=dot(r,normalize(vec3(-.48,.68,.56)));
  float pinDot=dot(r,normalize(vec3(.62,-.18,.76)));
  float keyWidth=footprint(keyDot,.045), pinWidth=footprint(pinDot,.018);
  float returnDot=dot(r,normalize(vec3(.12,.2,.97))),returnWidth=footprint(returnDot,.075);
  float sweepWidth=footprint(vArc,.072);
  float end=clamp(uReveal*1.12-vStrand*.055,0.0,1.0);
  float coverage=uReveal>.9999?1.0:1.0-smoothstep(end-arcWidth,end+arcWidth,vArc);
  float tip=uTravelSide>.5?1.0-smoothstep(.5,.995,vArc):smoothstep(.005,.5,vArc);
  coverage*=mix(1.0,tip,uTravelFade);
  if(uReveal<.0001||coverage<.001) discard;
  float band=(r.y+.13)/bandWidth;
  float strip=exp(-band*band)*(.095/bandWidth);
  // Focused studio reflections retain mirror gloss; footprint filtering keeps
  // their bright centers from collapsing to unstable subpixel sparkles.
  float box=exp(-max(0.0,1.0-keyDot)/keyWidth)*(.045/keyWidth);
  float pin=exp(-max(0.0,1.0-pinDot)/pinWidth)*(.018/pinWidth);
  float edge=(angle-.74)/edgeWidth;
  float vertical=exp(-edge*edge)*(.24/edgeWidth)*(.5+.5*clamp(r.y+.5,0.0,1.0));
  float rim=pow(1.0-abs(dot(n,view)),2.0);
  float sweepDistance=(vArc-mix(.04,.96,uSweep))/sweepWidth;
  float sweep=exp(-sweepDistance*sweepDistance);
  float cameraReturn=exp(-max(0.0,1.0-returnDot)/returnWidth)*(.075/returnWidth);
  // The center flare comes from a moving reflection on the surface. It enters
  // the depth-tested emission pass before the camera glare is composited.
  float flash=uGlare*sweep*(box*7.0+pin*4.0+cameraReturn*6.0);
  float energy=.02+strip*1.85+box*2.6+vertical*1.2+pin*2.3+rim*.6+flash;
  if(uEmission>.5) {
    float light=smoothstep(.6,2.4,energy)*.95*coverage;
    gl_FragColor=vec4(vec3(.97,.99,1.0)*light,light);
  } else {
    float tone=.025+.975*(1.0-exp(-energy*1.65));
    vec3 silver=mix(vec3(.78,.88,1.0),vec3(1.0),smoothstep(.25,1.2,energy));
    gl_FragColor=vec4(vec3(tone)*silver*coverage,coverage);
  }
}`;
export function chromeFragmentSource(derivatives = false) {
  return (derivatives ? '#define ENTRY_DERIVATIVES 1\n' : '')+CHROME_FRAGMENT;
}
export const SCREEN_VERTEX = `
attribute vec2 aPosition;
varying mediump vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.0,1.0);}`;
export const MOTION_FRAGMENT = `
precision mediump float;
varying mediump vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uMotion;
void main(){
  if(dot(uMotion,uMotion)<1.e-10){gl_FragColor=texture2D(uImage,vUv);return;}
  vec4 color=vec4(0.0);
  for(int i=0;i<9;i++){
    float sampleIndex=float(i)-4.0,weight=(5.0-abs(sampleIndex))/25.0;
    color+=texture2D(uImage,vUv+uMotion*(sampleIndex/8.0))*weight;
  }
  gl_FragColor=color;
}`;
export const BLUR_FRAGMENT = `
precision mediump float;
varying mediump vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uStep;
void main(){
  vec4 c=texture2D(uImage,vUv)*.227027;
  c+=(texture2D(uImage,vUv+uStep*1.384615)+texture2D(uImage,vUv-uStep*1.384615))*.316216;
  c+=(texture2D(uImage,vUv+uStep*3.230769)+texture2D(uImage,vUv-uStep*3.230769))*.070270;
  gl_FragColor=c;
}`;
export const GLOW_FRAGMENT = `
precision mediump float;
varying mediump vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uPixel;
uniform float uGlare;
vec3 lightAt(vec2 offset){return texture2D(uImage,vUv+offset*uPixel).rgb;}
void main(){
  // Only softened light reaches the halo, including shutter-filtered color
  // during flight. The center pulse still gathers the emission-only pass.
  vec3 c=texture2D(uImage,vUv).rgb*1.15;
  // Broad glare streaks sample the already blurred light, keeping smooth edges.
  c+=(texture2D(uImage,vUv+vec2(uPixel.x*4.0,0.0)).rgb+texture2D(uImage,vUv-vec2(uPixel.x*4.0,0.0)).rgb)*.09;
  c+=(texture2D(uImage,vUv+vec2(0.0,uPixel.y*4.0)).rgb+texture2D(uImage,vUv-vec2(0.0,uPixel.y*4.0)).rgb)*.09;
  // Broad camera streaks gather only softened, object-attached emission.
  // There is no white fullscreen flash or shifted copy of a sharp silhouette.
  if(uGlare>.0001){
    vec3 flare=(lightAt(vec2(10.0,0.0))+lightAt(vec2(-10.0,0.0)))*.24;
    flare+=(lightAt(vec2(24.0,0.0))+lightAt(vec2(-24.0,0.0)))*.14;
    flare+=(lightAt(vec2(46.0,0.0))+lightAt(vec2(-46.0,0.0)))*.055;
    flare+=(lightAt(vec2(0.0,12.0))+lightAt(vec2(0.0,-12.0)))*.1;
    c=c*(1.0+.85*uGlare)+flare*uGlare;
  }
  gl_FragColor=vec4(c,max(c.r,max(c.g,c.b)));
}`;
