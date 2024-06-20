import { ContentScriptTypes, RPCClient } from './rpc';

const client = new RPCClient();

class TLSN {
  async getHistory(method: string, url: string) {
    const resp = await client.call(ContentScriptTypes.get_history, {
      method,
      url,
    });
    return resp.result;
  }
}

const connect = async () => {
  const resp = await client.call(ContentScriptTypes.connect);

  if (resp.result) {
    return new TLSN();
  }
};

// @ts-ignore
window.tlsn = {
  connect,
};
