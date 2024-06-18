import { ContentScriptTypes, RPCClient } from './rpc';

const client = new RPCClient();

class TLSN {
  async getHistory() {
    const resp = await client.call(ContentScriptTypes.get_history);
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
