import { ContentScriptTypes, RPCClient } from './rpc';
import { PresentationJSON } from '../../utils/types';

const client = new RPCClient();

class TLSN {
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
      metadata?: {
        [k: string]: string;
      };
    },
  ): Promise<PresentationJSON> {
    const resp = await client.call(ContentScriptTypes.notarize, {
      url,
      method: requestOptions?.method,
      headers: requestOptions?.headers,
      body: requestOptions?.body,
      maxSentData: proofOptions?.maxSentData,
      maxRecvData: proofOptions?.maxRecvData,
      notaryUrl: proofOptions?.notaryUrl,
      websocketProxyUrl: proofOptions?.websocketProxyUrl,
      metadata: proofOptions?.metadata,
    });

    return resp;
  }

  async runPlugin(url: string, params?: Record<string, string>) {
    const resp = await client.call(ContentScriptTypes.run_plugin_by_url, {
      url,
      params,
    });

    return resp;
  }

  async runPluginWithVerifier(
    url: string,
    verifierOptions: {
      verifierApiUrl: string;
      proxyApiUrl: string;
      headers?: { [key: string]: string };
    },
    params?: Record<string, string>,
  ) {
    const resp = await client.call(ContentScriptTypes.run_plugin_by_url, {
      url,
      params,
      skipConfirmation: true, // Signal to skip confirmation window
      verifierApiUrl: verifierOptions.verifierApiUrl,
      proxyApiUrl: verifierOptions.proxyApiUrl,
      headers: verifierOptions.headers,
    });

    return resp;
  }
}

const connect = async () => {
  return new TLSN();
};

// @ts-ignore
window.tlsn = {
  connect,
};

window.dispatchEvent(new CustomEvent('tlsn_loaded'));
