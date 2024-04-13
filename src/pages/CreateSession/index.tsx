import type {} from 'redux-thunk/extend-redux';
import React, { ReactElement, useEffect } from 'react';
import {
  connectSession,
  useClientId,
  useConnected,
  useSocket,
} from '../../reducers/p2p';
import { useDispatch } from 'react-redux';
import Icon from '../../components/Icon';
import ChatBox from '../../components/ChatBox';

export default function CreateSession(): ReactElement {
  const clientId = useClientId();
  const dispatch = useDispatch();
  const connected = useConnected();

  useEffect(() => {
    dispatch(connectSession());
  }, []);

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
      {connected && <ChatBox />}
    </div>
  );
}
