import React, { useCallback, useEffect, useState } from 'react';
import {
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

export default function ChatBox() {
  const messages = useChatMessages();
  const dispatch = useDispatch();
  const clientId = useClientId();
  const [text, setText] = useState('');
  const pairId = usePairId();

  const onSend = useCallback(() => {
    if (text && pairId) {
      dispatch(
        sendChat({
          text,
          from: clientId,
          to: pairId,
        }),
      );

      setText('');

      console.log('after sending');
    }
  }, [text, pairId]);

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
    await prover.setup(`ws://0.tcp.ngrok.io:14339?clientId=${pairId}`);
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
    await verifier.connect(`ws://0.tcp.ngrok.io:14339?clientId=${pairId}`);
    await verifier.verify();
  }, [pairId]);

  const isClient = (msg: any) => {
    return msg.from === clientId;
  };

  return (
    <div className="flex flex-col flex-nowrap flex-grow gap-1 p-2 flex-shrink h-0 ">
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
        <div className="flex flex-col border gap-1 border-slate-200 flex-grow overflow-y-auto">
          {messages.map((msg) => {
            return (
              <div
                className={`rounded-lg p-2 max-w-[50%] break-all ${isClient(msg) ? 'mr-auto  bg-blue-600' : 'ml-auto bg-slate-300'}`}
              >
                <div
                  className={`${isClient(msg) ? 'text-white' : 'text-black'}`}
                >
                  {msg.text}
                </div>
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
            disabled={!pairId}
            onClick={onIProve}
          >
            Prove
          </button>
          <button
            className={classNames('button', {
              'button--primary': !!pairId,
            })}
            disabled={!pairId}
            onClick={onIVerify}
          >
            Verify
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
