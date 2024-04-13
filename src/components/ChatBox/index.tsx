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

      console.log('after sending')
    }
  }, [text, pairId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && text && pairId) {
      onSend();
      setText('');
    }
  }, [text]);

  return (
    <div className="flex flex-col flex-nowrap flex-grow gap-1 p-2">
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
      <div className="flex flex-col h-full gap-1">
        <div className="flex flex-col border border-slate-200 flex-grow overflow-y-auto">
          {messages.map((msg) => {
            return <div>{msg.text}</div>;
          })}
        </div>
        <div className="flex flex-row w-full gap-1">
          <input
            className="input border border-slate-200 focus:border-slate-400 flex-grow p-2"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            value={text}
            
          />
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
