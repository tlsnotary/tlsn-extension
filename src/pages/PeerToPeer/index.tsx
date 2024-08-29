import React, {
  ChangeEvent,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import Icon from '../../components/Icon';
import classNames from 'classnames';
import {
  connectRendezvous,
  disconnectRendezvous,
  fetchP2PState,
  sendPairRequest,
  useClientId,
  useConnected,
  useIncomingPairingRequests,
  usePairId,
} from '../../reducers/p2p';

export function P2PHome(): ReactElement {
  const clientId = useClientId();
  const pairId = usePairId();
  const incomingPairingRequests = useIncomingPairingRequests();

  useEffect(() => {
    fetchP2PState();
  }, []);

  const toggleConnection = useCallback(async () => {
    if (!clientId) {
      connectRendezvous();
    } else {
      disconnectRendezvous();
    }
  }, [clientId]);

  console.log(incomingPairingRequests);
  return (
    <div className="flex flex-col h-full cursor-default gap-2 my-2">
      <div className="flex flex-row border border-slate-300 rounded mx-2">
        <div className="bg-slate-200 px-2 py-1 flex-grow-0 border-r border-slate-300">
          Client ID
        </div>
        <input
          className={classNames(
            'flex-grow outline-0 px-2 py-1 cursor-default font-semibold',
            {
              'text-slate-500': !clientId,
              'text-green-500 cursor-pointer': clientId,
            },
          )}
          onClick={(e) => {
            // @ts-ignore
            if (e.target.select && clientId) e.target.select();
          }}
          value={clientId ? clientId : '--'}
          readOnly
        />
        <button
          className="flex-grow-0 px-2 py-1 button border-l border-slate-300"
          onClick={toggleConnection}
        >
          {clientId ? 'Stop' : 'Start'}
        </button>
      </div>
      <div className="flex flex-col items-center justify-center border border-slate-300 flex-grow-0 flex-shrink rounded mx-2 bg-slate-100 gap-2">
        {!!clientId && !pairId && <PendingConnection />}
        {!clientId && (
          <div className="text-slate-500 font-semibold py-4">
            Client has not started
          </div>
        )}
        {!!clientId && !!incomingPairingRequests.length && (
          <div>{incomingPairingRequests[0]}</div>
        )}
      </div>
    </div>
  );
}

function PendingConnection() {
  const [target, setTarget] = useState('');

  const onSend = useCallback(() => {
    sendPairRequest(target);
  }, [target]);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setTarget(e.target.value);
  }, []);

  return (
    <div className="flex flex-col w-full py-4 items-center gap-2">
      <div className="flex flex-row justify-center gap-2">
        <Icon
          className="animate-spin w-fit text-slate-500"
          fa="fa-solid fa-spinner"
          size={1}
        />
        <div className="text-slate-500 font-semibold">
          Waiting for pairing request...
        </div>
      </div>
      <div className="text-slate-500">or</div>
      <div className="w-full flex flex-row px-2 items-center">
        <input
          className="flex-grow flex-shrink w-0 outline-0 px-2 py-1 cursor-default"
          placeholder="Enter Peer ID to send pairing request"
          onChange={onChange}
        />
        <button
          className="button button--primary w-fit h-full"
          onClick={onSend}
        >
          Send Pairing Request
        </button>
      </div>
    </div>
  );
}
