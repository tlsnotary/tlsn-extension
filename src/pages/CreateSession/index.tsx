import type {} from 'redux-thunk/extend-redux';
import React, { ReactElement, useEffect } from 'react';
import { connectSession, useClientId, useSocket } from '../../reducers/p2p';
import { useDispatch } from 'react-redux';

type Props = {};

export default function CreateSession(props: Props): ReactElement {
  const clientId = useClientId();
  const socket = useSocket();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(connectSession());
  }, []);

  return (
    <div className="flex flex-col flex-nowrap flex-grow gap-1 p-2">
      <div className="flex flex-row gap-2 font-semibold text-xs">
        <div>Client ID:</div>
        <div className="text-green-700">{clientId}</div>
      </div>
    </div>
  );
}
