import assert from 'node:assert/strict';
import {setMaxListeners} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {renderNowShowcase,initNowShowcase} from '../src/now-showcase.js';
import {projects} from '../src/data.js';
const passed=[],check=(name,fn)=>{fn();passed.push(name);};
const markup=renderNowShowcase(projects);
check('render exposes all real project choices, one pressed state and two dialog openers',()=>{
 assert.equal((markup.match(/data-now-select=/g)||[]).length,projects.length);
 assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1);
 assert.equal((markup.match(/data-project="0"/g)||[]).length,2);
 assert.ok(markup.includes('Placeholder preview'));assert.ok(!markup.includes('preview-open'));
});
check('empty and singular input remain supported and untrusted copy is escaped',()=>{
 assert.ok(renderNowShowcase([]).includes('Projects will appear here'));
 assert.ok(renderNowShowcase({...projects[0],name:'<script>',image:'javascript:alert(1)'}).includes('&lt;script&gt;'));
 assert.ok(!renderNowShowcase({...projects[0],image:'javascript:alert(1)'}).includes('src="javascript:'));
});
class Element extends EventTarget {
 hidden=false;attributes={};style={};dataset={};textContent='';focused=false;
 setAttribute(key,value){this.attributes[key]=value;}
 focus(){this.focused=true;}
 animate(frames,options){let resolve,reject;const effect={frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b;}),cancel(){this.cancelled=true;reject(Error('cancelled'));},finish(){resolve();}};effects.push(effect);return effect;}
}
let effects=[];
globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;document.documentElement={dataset:{entry:'ready'}};
const queries=[];globalThis.matchMedia=()=>{const q=new EventTarget();q.matches=false;queries.push(q);return q;};
globalThis.getComputedStyle=()=>({clipPath:'inset(0px)',opacity:'.6',transform:'matrix(1, 0, 0, 1, 2, 0)'});
const choices=projects.map(()=>new Element()),slides=projects.map((_,i)=>Object.assign(new Element(),{hidden:!!i})),titles=projects.map((_,i)=>Object.assign(new Element(),{hidden:!!i})),openers=[new Element(),new Element()];
const nodes=Object.fromEntries(['.now-kind','[data-now-count]','.now-status','.now-announcement'].map(key=>[key,new Element()]));
const root={querySelectorAll:key=>({'[data-now-select]':choices,'[data-now-slide]':slides,'[data-now-title]':titles,'[data-project]':openers})[key],querySelector:key=>nodes[key],closest:()=>null};
const abort=new AbortController();setMaxListeners(0,abort.signal);initNowShowcase({root,projects,signal:abort.signal});
const emit=(target,type,properties={})=>{const event=new Event(type,{cancelable:true});Object.entries(properties).forEach(([key,value])=>Object.defineProperty(event,key,{value}));target.dispatchEvent(event);return event;};
emit(choices[1],'click');
check('selection updates both openers, metadata and accessible state immediately',()=>{
 assert.ok(openers.every(opener=>opener.dataset.project==='1'));
 assert.equal(choices[1].attributes['aria-pressed'],'true');assert.equal(nodes['.now-kind'].textContent,projects[1].type);
 assert.equal(nodes['[data-now-count]'].textContent,'02');assert.equal(titles.filter(t=>!t.hidden).length,1);
 assert.equal(slides[1].attributes['aria-hidden'],'false');assert.equal(slides[0].attributes['aria-hidden'],'true');
});
check('selection uses finite inner slide effects without transforming the outer frame',()=>{assert.equal(effects.length,3);assert.equal(effects[1].options.duration,560);assert.ok(effects[1].frames[0].clipPath.includes('100%'));});
const previous=[...effects];emit(choices[0],'click');
check('rapid reversal samples the current mask and cancels prior effects',()=>{
 assert.ok(previous.every(effect=>effect.cancelled));assert.equal(effects.at(-2).frames[0].opacity,'.6');assert.ok(openers.every(opener=>opener.dataset.project==='0'));
});
const current=effects.at(-2);current.finish();await Promise.resolve();await Promise.resolve();
check('completion settles one visible image and releases filled effects',()=>{assert.equal(slides.filter(slide=>!slide.hidden).length,1);assert.equal(slides[0].hidden,false);assert.ok(effects.at(-1).cancelled);});
const key=emit(choices[0],'keydown',{key:'End'});
check('End previews and focuses the last project without moving page scroll',()=>{assert.ok(key.defaultPrevented);assert.equal(choices.at(-1).focused,true);assert.equal(openers[0].dataset.project,'2');});
emit(document,'portfolio:sectionstart');
check('outer section transition settles selection before its own media reveal',()=>assert.equal(slides.filter(slide=>!slide.hidden).length,1));
queries[0].matches=true;emit(queries[0],'change');const count=effects.length;emit(choices[1],'click');
check('reduced motion updates the whole preview without native effects',()=>{assert.equal(effects.length,count);assert.equal(slides[1].hidden,false);assert.equal(openers[1].dataset.project,'1');});
queries[0].matches=false;emit(queries[0],'change');emit(choices[0],'click');emit(window,'resize');
check('resize and hidden-page interruptions leave one usable current image',()=>{assert.equal(slides.filter(slide=>!slide.hidden).length,1);document.hidden=true;emit(document,'visibilitychange');assert.equal(slides[0].hidden,false);});
abort.abort();const chosen=openers[0].dataset.project;emit(choices[2],'click');
check('abort removes selection listeners and cannot start new effects',()=>assert.equal(openers[0].dataset.project,chosen));
mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
writeFileSync(new URL('../artifacts/now-showcase-results.json',import.meta.url),JSON.stringify({checks:passed.length,passed,limits:'DOM/animation fixtures only; layout and perceived transitions require browser review.'},null,2));
console.log(`${passed.length} Now showcase checks passed`);
