import Host from '@tlsn/plugin-sdk';
import { v4 as uuidv4 } from 'uuid';

type SessionState = {
  id: string;
  pluginUrl: string;
  plugin?: string;
};

export class SessionManager {
  private host: Host = new Host();
  private sessions: Map<string, SessionState> = new Map();

  register(pluginUrl: string): void {
    const uuid = uuidv4();
    this.host.loadPlugin(uuid, pluginUrl);
    this.sessions.set(uuid, { id: uuid, pluginUrl });
  }
}
