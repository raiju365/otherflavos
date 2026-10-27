import {LOOP_PERSPECTIVE,LOOP_RIM_FADE,LOOP_GLASS_WIDTH,LOOP_LENS_MAG,LOOP_LENS_FOCAL_HEIGHT,LOOP_LENS_FOCAL_WIDTH} from './project-loop-model.js';
export const LOOP_VERTEX=`
precision highp float;
attribute vec2 aUV;
uniform vec2 uViewport;
uniform mediump vec2 uSize;
uniform vec3 uPosition;
uniform vec4 uShape;
varying mediump vec2 vUV;
varying mediump float vShade;
varying mediump float vFacing;
void main(){
  float angle=(aUV.x-.5)*uShape.w;
  float radius=uSize.x/uShape.w;
  vec3 p=vec3(radius*sin(angle),(aUV.y-.5)*uSize.y,radius*(cos(angle)-.5*(1.+cos(uShape.w*.5))));
  p*=uShape.z;
  float cr=cos(uShape.y),sr=sin(uShape.y);
  p.xy=vec2(cr*p.x-sr*p.y,sr*p.x+cr*p.y);
  float ct=cos(uShape.x),st=sin(uShape.x);
  p.xz=vec2(ct*p.x+st*p.z,-st*p.x+ct*p.z);
  p+=uPosition;
  vec3 normal=vec3(sin(angle+uShape.x),0.,cos(angle+uShape.x));
  vFacing=dot(normal,vec3(-p.x,-p.y,${LOOP_PERSPECTIVE.toFixed(1)}-p.z))/${LOOP_PERSPECTIVE.toFixed(1)};
  float camera=1.-p.z/${LOOP_PERSPECTIVE.toFixed(1)};
  // One equidistant fisheye lens for the complete gallery, after the shared orbit.
  vec2 plane=p.xy/camera;
  float focal=max(uViewport.y*${LOOP_LENS_FOCAL_HEIGHT.toFixed(3)},uViewport.x*${LOOP_LENS_FOCAL_WIDTH.toFixed(3)});
  float lensRadius=length(plane)/focal;
  float lensFactor=(lensRadius>.00001?atan(lensRadius)/lensRadius:1.)*${LOOP_LENS_MAG.toFixed(3)};
  plane*=lensFactor;
  gl_Position=vec4(2.*plane.x/uViewport.x*camera,-2.*plane.y/uViewport.y*camera,-p.z/${LOOP_PERSPECTIVE.toFixed(1)},camera);
  vUV=aUV;
  float rim=abs(aUV.x-.5)*2.;
  vShade=1.-.09*rim*rim*min(uShape.w,1.)+.025*sin(angle);
}`;
export const LOOP_FRAGMENT=`
precision mediump float;
uniform sampler2D uImage;
uniform mediump vec2 uSize;
uniform vec2 uUVScale;
uniform float uOpacity;
uniform vec3 uPassage;
uniform vec3 uOptics;
varying mediump vec2 vUV;
varying mediump float vShade;
varying mediump float vFacing;
void main(){
  if(vFacing<=0.)discard;
  // A curved leading edge opens from the side nearest the gallery center.
  float opened=uPassage.x;
  float envelope=4.*opened*(1.-opened);
  float across=uPassage.y>0.?vUV.x:1.-vUV.x;
  float arch=(pow(abs(vUV.y*2.-1.),2.)-.35)*.08*envelope;
  float frontier=mix(-.07,1.07,opened)-arch;
  float softness=.016+.012*uPassage.z;
  float aperture=1.-smoothstep(frontier-softness,frontier+softness,across);
  if(aperture<.001)discard;
  float radius=min(14.,min(uSize.x,uSize.y)*.08);
  vec2 q=abs((vUV-.5)*uSize)-(uSize*.5-radius);
  float distance=length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
  float edge=1.-smoothstep(-.65,.65,distance);
  if(edge<.001)discard;
  float edgeDistance=abs(across-frontier);
  float borderDistance=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y)*uSize.y/uSize.x);
  float opticalDistance=min(edgeDistance,borderDistance);
  float glass=(1.-smoothstep(.012,${LOOP_GLASS_WIDTH.toFixed(3)},opticalDistance))*(.6+.4*envelope)*uOptics.y;
  float drive=clamp(uOptics.x,-1.,1.);
  float energy=abs(drive);
  float lensCenter=.5+.24*sin(uOptics.z)+drive*.06;
  float lens=(1.-smoothstep(0.,.24,abs(vUV.x-lensCenter)))*uOptics.y;
  vec2 sampleUV=(vUV-.5)*uUVScale+.5;
  // A persistent glass rim and a traveling lens pull/push the actual media UVs.
  sampleUV.x+=(uPassage.y*(1.-opened)*.008+drive*(glass*.022+lens*.014))*uUVScale.x;
  sampleUV.y+=(vUV.y-.5)*drive*glass*.010*uUVScale.y;
  // Tracking distortion moves all color channels together; no RGB fringe.
  float row=floor(vUV.y*uSize.y/4.);
  float signal=sin(row*1.913+opened*23.)*sin(row*.37-opened*11.);
  float tear=smoothstep(.82,.98,abs(signal))*sign(signal)*glass*energy*.0025;
  sampleUV.x+=tear*uUVScale.x;
  sampleUV=clamp(sampleUV,vec2(0.),vec2(1.));
  vec4 color=texture2D(uImage,vec2(sampleUV.x,1.-sampleUV.y));
  float shadow=(1.-smoothstep(0.,.10,edgeDistance))*envelope*.075;
  vec3 pigment=color.rgb;
  if(glass>.001){
    // Neutral glass keeps the source media colors, with only tonal scan detail.
    float scan=.5+.5*sin(vUV.y*uSize.y*3.14159265);
    pigment*=1.-scan*glass*energy*.065;
  }
  float glint=(1.-smoothstep(0.,.018,opticalDistance))*(.6+.4*envelope)*uOptics.y*.055;
  vec3 material=mix(pigment*(vShade-shadow),vec3(1.),glint);
  float alpha=color.a*edge*aperture*uOpacity*smoothstep(0.,${LOOP_RIM_FADE.toFixed(3)},vFacing);
  if(alpha<.001)discard;
  gl_FragColor=vec4(material*alpha,alpha);
}`;
