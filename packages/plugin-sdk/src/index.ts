/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { SandboxEvalCode, type SandboxOptions, loadQuickJs } from "@sebastianwessel/quickjs";
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";

export class Host {

  private capabilities: Map<string, (...args: any[]) => any> = new Map();

  addCapability(name: string, handler: (...args: any[]) => any): void {
    this.capabilities.set(name, handler);
  }

  async createEvalCode(capabilities?: {[method: string]: (...args: any[]) => any}): Promise<{
    evalCode: SandboxEvalCode;
    dispose: () => void;
  }> {
    const { runSandboxed } = await loadQuickJs(variant);

    const options: SandboxOptions = {
      allowFetch: false,
      allowFs: false,
      env: {
        ...Object.fromEntries(this.capabilities),
        ...(capabilities || {}),
      },
    };

    let evalCode: SandboxEvalCode | null = null;
    let disposeCallback: (() => void) | null = null;

    // Start sandbox and keep it alive
    // Don't await this - we want it to keep running
    runSandboxed(async (sandbox) => {
      evalCode = sandbox.evalCode;

      // Keep the sandbox alive until dispose is called
      // The runtime won't be disposed until this promise resolves
      return new Promise<void>((resolve) => {
        disposeCallback = resolve;
      });
    }, options);

    // Wait for evalCode to be ready
    while (!evalCode) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Return evalCode and dispose function
    return {
      evalCode: evalCode,
      dispose: () => {
        if (disposeCallback) {
          disposeCallback();
          disposeCallback = null;
        }
      }
    };
  }

  async run(code: string, capabilities?: {[method: string]: (...args: any[]) => any}): Promise<any> {
    const { runSandboxed } = await loadQuickJs(variant);

    const options: SandboxOptions = {
      allowFetch: false,
      allowFs: false,
      env: {
        ...Object.fromEntries(this.capabilities),
        ...(capabilities || {}),
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
