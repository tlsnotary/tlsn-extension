import { ContentScriptTypes, RPCClient } from './rpc';

const client = new RPCClient();

const connect = async () => {
  const resp = await client.call(ContentScriptTypes.connect);
  console.log({ resp });
};

// @ts-ignore
window.tlsn = {
  connect,
};
