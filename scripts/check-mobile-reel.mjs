import assert from 'node:assert/strict';
import {reelPose,loopPose,projectLoopPoint,hitLoopCard,loopSlot} from '../src/project-loop-model.js';

let samples=0;
for(const [width,height] of [[320,304],[390,510],[411,522],[667,205],[768,740]]) {
  for(const relative of [-1,-.7,-.35,0,.35,.7,1]) {
    const pose=reelPose(relative,width,height);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(Math.abs(pose.width/pose.height-1.6)<1e-12);
    assert.equal(pose.x,0);
    assert.equal(pose.vertical,1);
    const center=projectLoopPoint(pose,.5,.5,width,height);
    assert.ok(Math.abs(center.x-width/2)<1e-9,'reel must stay on the vertical centerline');
    if(relative)assert.equal(Math.sign(center.y-height/2),Math.sign(relative));
    for(const u of [.2,.5,.8])for(const v of [.2,.5,.8]) {
      const point=projectLoopPoint(pose,u,v,width,height);
      assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
      if(point.frontFacing>.1)assert.ok(hitLoopCard(pose,point.x,point.y,width,height),'visible reel media must remain tappable');
      samples++;
    }
    if(relative===0)for(const u of [0,1])for(const v of [0,1]) {
      const point=projectLoopPoint(pose,u,v,width,height);
      assert.ok(point.x>0&&point.x<width&&point.y>0&&point.y<height,'centered card fits the viewport');
    }
  }
  // Moving toward the next project moves the old card upward; reversing
  // retraces that same cylinder without any horizontal translation.
  const old=projectLoopPoint(reelPose(-.4,width,height),.5,.5,width,height);
  const next=projectLoopPoint(reelPose(.6,width,height),.5,.5,width,height);
  assert.ok(old.y<height/2&&next.y>height/2);
  assert.deepEqual(loopSlot(0,15,3),{logical:15,project:0,relative:0});
  assert.equal(reelPose(0,width,height,0,true).opticsEnabled,0);
}
const desktop=loopPose(.5,1200,700);
assert.ok(desktop.x>0);assert.equal(desktop.vertical,undefined);
console.log(`${samples} mobile reel projection/picking samples passed; desktop remains horizontal`);
