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

export default function ChatBox() {
  const messages = useChatMessages();
  const dispatch = useDispatch();
  const clientId = useClientId();
  const [text, setText] = useState('');
  const pairId = usePairId();
  const [showingPluginModal, showPluginModal] = useState(false);

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

  const onIProve = useCallback(async () => {
    await init();
    const prover = new Prover({
      id: 'test',
      server_dns: 'swapi.dev',
      max_sent_data: 1024,
      max_received_data: 1024,
    });
    const request = {
      method: 'GET',
      uri: 'https://swapi.dev/api',
      headers: {
        Accept: '*',
      },
    };
    await prover.setup(`${RENDEZVOUS_API}?clientId=${pairId}`);
    await prover.send_request(
      'wss://notary.pse.dev/proxy?token=swapi.dev',
      request,
    );
    const redact = {
      sent: [],
      received: [],
    };
    const resp = await prover.reveal(redact);
    console.log(resp, redact);
  }, []);

  const onIVerify = useCallback(async () => {
    await init();
    const verifier = new Verifier({
      id: 'test',
      max_sent_data: 1024,
      max_received_data: 1024,
    });
    await verifier.connect(`${RENDEZVOUS_API}?clientId=${pairId}`);
    await verifier.verify();
  }, [pairId]);

  const onRequestProof = useCallback(
    async (plugin: PluginParams) => {
      dispatch(
        requestProof({
          plugin,
          from: clientId,
          to: pairId,
        }),
      );
      showPluginModal(false);
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
