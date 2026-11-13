import { createRailFlow } from './rail-flow.js';

let flow;
self.onmessage = ({ data }) => {
  if (data.canvas) {
    flow = createRailFlow(data.canvas);
    if (!flow) throw new Error('Rail canvas unavailable');
  }
  flow?.setRunning(data.running);
};
