/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { type SandboxOptions, loadQuickJs } from "@sebastianwessel/quickjs";
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";

export class Host {

  private capabilities: Map<string, (...args: any[]) => any> = new Map();

  addCapability(name: string, handler: (...args: any[]) => any): void {
    this.capabilities.set(name, handler);
  }

  async run(code: string): Promise<any> {
    console.log('running code', code);
    const { runSandboxed } = await loadQuickJs(variant);
    console.log('loaded quickjs');

    const options: SandboxOptions = {
      allowFetch: false,
      allowFs: false,
      env: {
        ...Object.fromEntries(this.capabilities),
      },
    };

    const result = await runSandboxed(async ({ evalCode }) => {
      return evalCode(code);
    }, options);


    if (!result.ok) {
      const err = new Error(result.error.message);
      err.name = result.error.name;
      err.stack = result.error.stack;
      throw err;
    }

    return result.data;
  }
}

// Default export
export default Host;
