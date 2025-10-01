import Host from '../../../plugin-sdk/src/index';
import { v4 as uuidv4 } from 'uuid';

type SessionState = {
  id: string;
  pluginUrl: string;
  plugin?: string;
};

export class SessionManager {
  private host: Host;
  private sessions: Map<string, SessionState> = new Map();

  constructor() {
    this.host = new Host();
    this.setupDefaultCapabilities();
  }

  private setupDefaultCapabilities() {
    // Add basic math operations
    this.host.addCapability('add', (a: number, b: number) => a + b);
    this.host.addCapability('subtract', (a: number, b: number) => a - b);
    this.host.addCapability('multiply', (a: number, b: number) => a * b);
    this.host.addCapability('divide', (a: number, b: number) => {
      if (b === 0) throw new Error('Division by zero');
      return a / b;
    });

    // Add console logging
    this.host.addCapability('log', (...args: any[]) => {
      console.log('[Plugin]', ...args);
      return undefined;
    });

    // Add basic string operations
    this.host.addCapability('concat', (...args: string[]) => args.join(''));
    this.host.addCapability('uppercase', (str: string) => str.toUpperCase());
    this.host.addCapability('lowercase', (str: string) => str.toLowerCase());

    // Add utility functions
    this.host.addCapability('random', () => Math.random());
    this.host.addCapability('timestamp', () => Date.now());
  }

  async executePlugin(code: string): Promise<any> {
    const result = await this.host.run(code);
    return result;
  }

  startSession(pluginUrl: string): void {
    const uuid = uuidv4();
    this.sessions.set(uuid, { id: uuid, pluginUrl });
  }
}
