import { ContentScriptTypes, RPCClient } from './rpc';
import { RequestHistory } from '../Background/rpc';
import { Proof } from 'tlsn-js/build/types';
import { PluginConfig, PluginMetadata } from '../../utils/misc';

const client = new RPCClient();

class TLSN {
  async getHistory(
    method: string,
    url: string,
    metadata?: {
      [key: string]: string;
    },
  ): Promise<
    (Pick<
      RequestHistory,
      'id' | 'method' | 'notaryUrl' | 'url' | 'websocketProxyUrl'
    > & { time: Date })[]
  > {
    const resp = await client.call(ContentScriptTypes.get_history, {
      method,
      url,
      metadata,
    });

    return resp || [];
  }

  async getProof(id: string): Promise<Proof | null> {
    const resp = await client.call(ContentScriptTypes.get_proof, {
      id,
    });

    return resp || null;
  }

  async notarize(
    url: string,
    requestOptions?: {
      method?: string;
      headers?: { [key: string]: string };
      body?: string;
    },
    proofOptions?: {
      notaryUrl?: string;
      websocketProxyUrl?: string;
      maxSentData?: number;
      maxRecvData?: number;
      maxTranscriptSize?: number;
      metadata?: {
        [k: string]: string;
      };
    },
  ): Promise<Proof> {
    const resp = await client.call(ContentScriptTypes.notarize, {
      url,
      method: requestOptions?.method,
      headers: requestOptions?.headers,
      body: requestOptions?.body,
      maxSentData: proofOptions?.maxSentData,
      maxRecvData: proofOptions?.maxRecvData,
      maxTranscriptSize: proofOptions?.maxTranscriptSize,
      notaryUrl: proofOptions?.notaryUrl,
      websocketProxyUrl: proofOptions?.websocketProxyUrl,
      metadata: proofOptions?.metadata,
    });

    return resp;
  }

  async installPlugin(
    url: string,
    metadata?: { [k: string]: string },
  ): Promise<string> {
    const resp = await client.call(ContentScriptTypes.install_plugin, {
      url,
      metadata,
    });

    return resp;
  }

  async getPlugins(
    url: string,
    origin?: string,
    metadata?: {
      [key: string]: string;
    },
  ): Promise<(PluginConfig & { hash: string; metadata: PluginMetadata })[]> {
    const resp = await client.call(ContentScriptTypes.get_plugins, {
      url,
      origin,
      metadata,
    });

    return resp;
  }

  async runPlugin(hash: string) {
    const resp = await client.call(ContentScriptTypes.run_plugin, {
      hash,
    });

    return resp;
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
