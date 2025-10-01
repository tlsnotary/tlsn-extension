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
  }

  startSession(pluginUrl: string): void {
    const uuid = uuidv4();
    this.sessions.set(uuid, { id: uuid, pluginUrl });
  }
}
