import { ContentScriptTypes, RPCClient } from './rpc';
import { RequestHistory } from '../Background/rpc';
import { Proof } from 'tlsn-js/build/types';

const client = new RPCClient();

class TLSN {
  async getHistory(
    method: string,
    url: string,
  ): Promise<
    (Pick<
      RequestHistory,
      'id' | 'method' | 'notaryUrl' | 'url' | 'websocketProxyUrl'
    > & { time: Date })[]
  > {
    const resp = await client.call(ContentScriptTypes.get_history, {
      method,
      url,
    });

    return resp || [];
  }

  async getProof(id: string): Promise<Proof | null> {
    const resp = await client.call(ContentScriptTypes.get_proof, {
      id,
    });

    return resp || null;
  }
}

const connect = async () => {
  const resp = await client.call(ContentScriptTypes.connect);

  if (resp) {
    return new TLSN();
  }
};

// @ts-ignore
window.tlsn = {
  connect,
};
