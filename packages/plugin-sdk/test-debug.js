import { Host } from './src/index.ts';

const host = new Host({
  onProve: () => Promise.resolve(''),
  onRenderPluginUi: () => {},
  onCloseWindow: () => {},
  onOpenWindow: () => Promise.resolve({ type: 'WINDOW_OPENED', payload: { windowId: 1, uuid: 'test', tabId: 1 } }),
});

const sandbox = await host.createEvalCode({ add: (a, b) => a + b });
const result = await sandbox.eval('env.add(1, 2)');
console.log('Result:', result, 'Type:', typeof result);
sandbox.dispose();
