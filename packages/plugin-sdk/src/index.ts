/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { getQuickJS } from "quickjs-emscripten"

export class Host {
  private quickJsInstance: Awaited<ReturnType<typeof getQuickJS>> | null = null;
  private capabilities: Map<string, (...args: any[]) => any> = new Map();

  async waitForQuickJS(): Promise<Awaited<ReturnType<typeof getQuickJS>>> {
    if (this.quickJsInstance) {
      return Promise.resolve(this.quickJsInstance);
    }
    this.quickJsInstance = await getQuickJS();
    return this.quickJsInstance;
  }

  addCapability(name: string, handler: (...args: any[]) => any): void {
    this.capabilities.set(name, handler);
  }

  async run(code: string): Promise<any> {
    const QuickJS = await this.waitForQuickJS();
    const vm = QuickJS.newContext()

    // Register capabilities as functions in QuickJS context
    for (const [name, handler] of this.capabilities) {
      const fnHandle = vm.newFunction(name, (...args) => {
        // Convert QuickJS handles to JS values
        const jsArgs = args.map(arg => vm.dump(arg));

        // Call the handler with JS values
        try {
          const result = handler(...jsArgs);
          // Convert result back to QuickJS handle based on type
          if (result === undefined || result === null) {
            return vm.undefined;
          } else if (typeof result === 'boolean') {
            return result ? vm.true : vm.false;
          } else if (typeof result === 'number') {
            return vm.newNumber(result);
          } else if (typeof result === 'string') {
            return vm.newString(result);
          } else {
            // For complex objects, serialize and deserialize
            const jsonStr = JSON.stringify(result);
            return vm.unwrapResult(vm.evalCode(`(${jsonStr})`));
          }
        } catch (error) {
          // Throw the error as a QuickJS error
          const errorMsg = error instanceof Error ? error.message : String(error);
          return vm.unwrapResult(vm.evalCode(`throw new Error(${JSON.stringify(errorMsg)})`));
        }
      });
      vm.setProp(vm.global, name, fnHandle);
      fnHandle.dispose();
    }

    try {
      const evalResult = vm.evalCode(code);
      if (evalResult.error) {
        // Extract the error message from QuickJS handle before disposing
        const errorMessage = vm.dump(evalResult.error);
        evalResult.error.dispose();
        vm.dispose();

        // Create and throw a proper JavaScript Error
        const error = new Error(typeof errorMessage === 'object' && errorMessage.message
          ? errorMessage.message
          : String(errorMessage));
        throw error;
      }

      const result = evalResult.value;
      const jsResult = vm.dump(result);
      result.dispose();
      vm.dispose();
      return jsResult;
    } catch (error) {
      // Clean up on any error
      if (vm) {
        try {
          vm.dispose();
        } catch {}
      }
      throw error;
    }
  }
}

// Default export
export default Host;
