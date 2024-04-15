import React, { useCallback, useState } from 'react';
import {
  Chat,
  requestProof,
  RequestProofMessage,
  sendChat,
  useChatMessages,
  useClientId,
  usePairId,
} from '../../reducers/p2p';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';
import Icon from '../Icon';
import init, {
  Prover,
  Verifier,
} from '../../../tlsn/tlsn/tlsn-wasm/pkg/tlsn_wasm';
import { RENDEZVOUS_API } from '../../utils/constants';
import PluginModal from '../PluginModal';
import PluginDisplayBox, { PluginParams } from '../PluginDisplayBox';
import { get, PROXY_API_LS_KEY } from '../../utils/storage';
import { urlify } from '../../utils/misc';
import { useRequests } from '../../reducers/requests';

export default function ChatBox() {
  const messages = useChatMessages();
  const dispatch = useDispatch();
  const clientId = useClientId();
  const [text, setText] = useState('');
  const pairId = usePairId();
  const [showingPluginModal, showPluginModal] = useState(false);
  const requests = useRequests();

  const onSend = useCallback(() => {
    if (text && pairId) {
      dispatch(
        sendChat({
          text,
          from: clientId,
          to: pairId,
        }),
      );
    }
  }, [text, pairId, clientId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && text && pairId) {
        onSend();
        setText('');
      }
    },
    [text],
  );

  const onIProve = useCallback(
    async (config: {
      method: string;
      uri: string;
      headers: { [key: string]: string };
    }) => {
      await init();
      const websocketProxyUrl = await get(
        PROXY_API_LS_KEY,
        'wss://notary.pse.dev/proxy',
      );
      const hostname = urlify(config.uri)?.hostname || '';
      const prover = new Prover({
        id: 'p2p_proof',
        server_dns: hostname,
        // max_sent_data: 1024,
        // max_received_data: 1024,
      });
      await prover.setup(`${RENDEZVOUS_API}?clientId=${clientId}:proof`);
      await prover.send_request(
        `${websocketProxyUrl}?token=${hostname}`,
        config,
      );
      const redact = {
        sent: [],
        received: [],
      };
      const resp = await prover.reveal(redact);
      console.log(resp, redact);
    },
    [clientId, pairId],
  );

  const onNotarize = useCallback(
    async (url: string) => {
      const reqs = requests.filter((req) => {
        return req?.url?.includes(url);
      });
      const req = reqs[0];
      const hostname = urlify(req.url)?.hostname || '';
      const headers: { [k: string]: string } = req.requestHeaders.reduce(
        (acc: any, h) => {
          acc[h.name] = h.value;
          return acc;
        },
        { Host: hostname },
      );
      headers['Accept-Encoding'] = 'identity';
      headers['Connection'] = 'close';
      onIProve({
        method: req.method,
        uri: req.url,
        headers: headers,
      });
    },
    [onIProve],
  );

  const onRequestProof = useCallback(
    async (plugin: PluginParams) => {
      await init();
      const verifier = new Verifier({
        id: 'p2p_proof',
        // max_sent_data: 1024,
        // max_received_data: 1024,
      });
      await verifier.connect(`${RENDEZVOUS_API}?clientId=${clientId}:proof`);
      dispatch(
        requestProof({
          plugin,
          from: clientId,
          to: pairId,
        }),
      );
      showPluginModal(false);
      const res = await verifier.verify();
      console.log(res);
      dispatch(
        sendChat({
          text: JSON.stringify(res),
          from: clientId,
          to: pairId,
        }),
      );
    },
    [clientId, pairId],
  );

  const isClient = (msg: any) => {
    return msg.from === clientId;
  };

  return (
    <div className="flex flex-col flex-nowrap flex-grow gap-1 p-2 flex-shrink h-0 ">
      {showingPluginModal && (
        <PluginModal
          onClose={() => showPluginModal(false)}
          onSelect={onRequestProof}
        />
      )}
      <div className="flex flex-row gap-1 font-semibold text-xs align-center">
        <div>Client ID:</div>
        {clientId ? (
          <div className="text-green-500">{clientId}</div>
        ) : (
          <Icon
            className="animate-spin text-gray-500"
            fa="fa-solid fa-spinner"
            size={1}
          />
        )}
      </div>
      <div className="flex flex-row gap-1 font-semibold text-xs align-center">
        <div>Peer ID:</div>
        {pairId ? (
          <div className="text-red-500">{pairId}</div>
        ) : (
          <div className="flex flex-row gap-1">
            <span className="text-slate-500">Waiting for Peer</span>
            <Icon
              className="animate-spin text-slate-500 w-fit"
              fa="fa-solid fa-spinner"
              size={1}
            />
          </div>
        )}
      </div>
      <div className="flex flex-col flex-grow flex-shrink h-0 gap-1">
        <div className="flex flex-col border gap-1 border-slate-200 flex-grow overflow-y-auto p-2">
          {messages.map((msg: Chat | RequestProofMessage) => {
            return (
              <div
                className={classNames(`p-2 max-w-[50%] break-all`, {
                  'mr-auto bg-blue-600  rounded-t-lg rounded-br-lg':
                    isClient(msg),
                  'ml-auto bg-slate-300 rounded-b-lg rounded-tl-lg':
                    !isClient(msg),
                })}
              >
                {typeof msg.text === 'string' && (
                  <div
                    className={`${isClient(msg) ? 'text-white' : 'text-black'}`}
                  >
                    {msg.text}
                  </div>
                )}
                {typeof msg.plugin !== 'undefined' && (
                  <div
                    className={`${isClient(msg) ? 'text-white' : 'text-black'}`}
                  >
                    <PluginDisplayBox
                      {...msg.plugin}
                      hideAction={isClient(msg)}
                      onNotarize={() => onNotarize(msg.plugin.url)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-row w-full gap-1">
          <input
            className="input border border-slate-200 focus:border-slate-400 flex-grow p-2"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            value={text}
            autoFocus
          />
          <button
            className={classNames('button', {
              'button--primary': !!pairId,
            })}
            // disabled={!pairId}
            onClick={() => showPluginModal(true)}
          >
            Request Proof
          </button>
          <button
            className={classNames('button', {
              'button--primary': !!text && !!pairId,
            })}
            disabled={!text || !pairId}
            onClick={onSend}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
