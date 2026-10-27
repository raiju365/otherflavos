// Native-animation geometry/lifecycle fixture; no rendered-device FPS claim.
import assert from 'node:assert/strict';
import { createMobileHeaderMotion, headerFlip } from '../src/mobile-header-motion.js';

const rect = (left, top, width, height) => ({ left, top, width, height });
const compact = { height: 134, photo: rect(22,20,84,105), name: rect(126,40,190,40),
  nameBox: rect(126,38,220,44), meta: rect(126,86,160,20) };
const large = { height: 248, photo: rect(144,20,102,127.5), name: rect(89,167,212,48),
  nameBox: rect(22,164,346,49), meta: rect(110,218,170,22) };
let layout = compact;
const jobs = [], passed = [];
const check = (name, fn) => { fn(); passed.push(name); };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const node = key => ({ style: {}, ownerDocument: { timeline: { currentTime: 50 } },
  getBoundingClientRect() { return key === 'header' ? rect(22,12,346,layout.height) : layout[key]; },
  animate(frames, options) {
    let resolve, reject;
    const job = { key, frames, options, cancelled: false, startTime: null,
      finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
      finish() { resolve(); }, cancel() { this.cancelled = true; reject(Error('cancel')); } };
    jobs.push(job); return job;
  },
});
const header=node('header'), photo=node('photo'), name=node('nameBox'), meta=node('meta');
header.querySelector = selector => ({ '.figure-wrap': photo, '.identity h1': name, '.identity-meta': meta })[selector];
globalThis.document = { hidden: false, documentElement: { dataset: { entry: 'ready' } },
  querySelector: () => header,
  createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => layout.name }),
};
globalThis.window = { scrollY: 0 };
const desktop={matches:false}, reduced={matches:false};
const motion = createMobileHeaderMotion({desktop,reduced});
const from = motion.capture(); layout=large; motion.play(from);
check('header height and real portrait/name/meta share one finite native clock',()=>{
  assert.equal(jobs.length,4);
  assert.ok(jobs.every(job=>job.startTime===50&&job.options.duration===420));
});
check('height connects the old and new layouts so the tabs travel with the header',()=>{
  assert.deepEqual(jobs[0].frames,[{height:'134px'},{height:'248px'}]);
});
check('text alignment uses actual glyph bounds rather than the full heading column',()=>{
  const value=headerFlip(compact.name,large.name,large.nameBox);
  const [x,y,sx,sy]=value.match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.ok(Math.abs(large.nameBox.left+x+sx*(large.name.left-large.nameBox.left)-compact.name.left)<.002);
  assert.ok(Math.abs(large.nameBox.top+y+sy*(large.name.top-large.nameBox.top)-compact.name.top)<.002);
  assert.equal(jobs[2].frames[0].transform,value);
});
const first=[...jobs];
layout={...large,height:190,photo:rect(96,20,94,117.5),name:rect(108,110,200,44),meta:rect(117,157,166,21)};
const interrupted=motion.capture();
check('interruption samples the presented geometry before cancelling old effects',()=>{
  assert.equal(interrupted.height,190);assert.equal(interrupted.photo.left,96);
  assert.ok(first.every(job=>job.cancelled));
});
layout=compact; motion.play(interrupted);
first.forEach(job=>job.finish()); await tick();
check('obsolete completion cannot cancel a newer reverse transition',()=>assert.ok(jobs.slice(-4).every(job=>!job.cancelled)));
jobs.slice(-4).forEach(job=>job.finish());await tick();
check('completion removes effects and leaves the real CSS layout in charge',()=>assert.ok(jobs.every(job=>job.cancelled)));
const count=jobs.length;
motion.play(motion.capture());
check('identical Now and Projects geometry adds no resize animation',()=>assert.equal(jobs.length,count));
const prepared=motion.capture(); layout=large; motion.play(prepared); motion.settle();
check('resize/visibility settling cancels every running effect',()=>assert.ok(jobs.every(job=>job.cancelled)));
desktop.matches=true;
check('desktop layout stays outside this motion owner',()=>assert.equal(motion.capture(),null));
desktop.matches=false;reduced.matches=true;
check('reduced motion leaves the new layout immediate',()=>assert.equal(motion.capture(),null));
reduced.matches=false;document.documentElement.dataset.entry='loading';
check('entry keeps ownership of the portrait/type entrance',()=>assert.equal(motion.capture(),null));
document.documentElement.dataset.entry='ready';window.scrollY=100;
check('a scrolled-away header is not animated back through the viewport',()=>assert.equal(motion.capture(),null));
window.scrollY=0;const last=motion.capture();layout=compact;motion.play(last);motion.destroy();
check('abort cancels effects and prevents restarting',()=>{
  assert.ok(jobs.every(job=>job.cancelled));assert.equal(motion.capture(),null);
});
document.querySelector=()=>null;
check('an optional missing header cannot break navigation startup',()=>{
  const empty=createMobileHeaderMotion({desktop,reduced});assert.equal(empty.capture(),null);assert.doesNotThrow(()=>empty.play(null));
});
await tick();
console.log(JSON.stringify({mode:'Native-animation fixture; visual browser review required',passed:passed.length,checks:passed},null,2));
