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
  useIncomingPairingRequests,
  useOutgoingPairingRequests,
  cancelPairRequest,
  useP2PError,
  setP2PError,
  acceptPairRequest,
  rejectPairRequest,
  usePairId,
  requestProof,
  useIncomingProofRequests,
  requestProofByHash,
  useOutgoingProofRequests,
  acceptProofRequest,
  rejectProofRequest,
  cancelProofRequest,
} from '../../reducers/p2p';
import { useDispatch } from 'react-redux';
import Modal, { ModalHeader } from '../../components/Modal/Modal';
import { Plugin, PluginList } from '../../components/PluginList';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { sha256 } from '../../utils/misc';

export function P2PHome(): ReactElement {
  const clientId = useClientId();

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
              'text-slate-400 bg-slate-100': !clientId,
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
      <ClientStatus />
      <div className="flex flex-row mx-2 flex-grow flex-shrink h-0 p-2">
        <div className="text-slate-400 text-center w-full font-semibold">
          No proofs history
        </div>
      </div>
    </div>
  );
}

function ClientStatus() {
  const clientId = useClientId();
  const error = useP2PError();
  const pairId = usePairId();
  const [incomingPairingRequest] = useIncomingPairingRequests();
  const [outgoingPairingRequest] = useOutgoingPairingRequests();

  let body = null;

  if (!clientId) {
    body = <ClientNotStarted />;
  } else if (pairId) {
    body = <Paired />;
  } else if (!incomingPairingRequest && !outgoingPairingRequest) {
    body = <PendingConnection />;
  } else if (incomingPairingRequest) {
    body = <IncomingRequest />;
  } else if (outgoingPairingRequest) {
    body = <OutgoingRequest />;
  }

  return (
    <div
      className={classNames(
        'flex flex-col items-center justify-center border border-slate-300',
        'flex-grow-0 flex-shrink rounded mx-2 bg-slate-100 py-4 gap-4',
      )}
    >
      {body}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

function Paired() {
  const pairId = usePairId();
  const [incomingProofRequest] = useIncomingProofRequests();
  const [outgoingPluginHash] = useOutgoingProofRequests();
  const [incomingPluginHash, setIncomingPluginHash] = useState('');
  const [showingModal, showModal] = useState(false);

  useEffect(() => {
    (async () => {
      if (!incomingProofRequest) {
        setIncomingPluginHash('');
        return;
      }
      const hash = await sha256(incomingProofRequest);
      setIncomingPluginHash(hash);
    })();
  }, [incomingProofRequest]);

  useEffect(() => {
    showModal(false);
  }, [outgoingPluginHash]);

  const accept = useCallback(() => {
    if (incomingPluginHash) acceptProofRequest(incomingPluginHash);
  }, [incomingPluginHash]);

  const reject = useCallback(() => {
    if (incomingPluginHash) rejectProofRequest(incomingPluginHash);
  }, [incomingPluginHash]);

  const cancel = useCallback(() => {
    if (outgoingPluginHash) cancelProofRequest(outgoingPluginHash);
  }, [outgoingPluginHash]);

  return (
    <div className="flex flex-col items-center gap-2 px-4 w-full">
      {showingModal && <PluginListModal onClose={() => showModal(false)} />}
      <div>
        <span>Paired with </span>
        <span className="font-semibold text-blue-500">{pairId}</span>
      </div>
      {incomingPluginHash ? (
        <>
          <div className="font-semibold text-orange-500">
            Your peer is requesting the following proof:
          </div>
          <Plugin
            className="w-full bg-white !cursor-default hover:!bg-white active:!bg-white hover:!border-slate-300"
            hash={incomingPluginHash}
            hex={incomingProofRequest}
            unremovable
          />
          <div className="flex flex-row gap-2">
            <button className="button" onClick={reject}>
              Decline
            </button>
            <button className="button button--primary" onClick={accept}>
              Accept
            </button>
          </div>
        </>
      ) : outgoingPluginHash ? (
        <>
          <div className="font-semibold text-orange-500">
            Sent request for following proof:
          </div>
          <Plugin
            className="w-full bg-white !cursor-default hover:!bg-white active:!bg-white hover:!border-slate-300"
            hash={outgoingPluginHash}
            onClick={() => null}
            unremovable
          />
          <button className="button" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : (
        <button
          className="button button--primary"
          onClick={() => showModal(true)}
        >
          Request Proof
        </button>
      )}
    </div>
  );
}

function PluginListModal({ onClose }: { onClose: () => void }) {
  const onRequestProof = useCallback(async (hash: string) => {
    requestProofByHash(hash);
  }, []);
  return (
    <Modal className="mx-4" onClose={onClose}>
      <ModalHeader onClose={onClose}>Choose a plugin to continue</ModalHeader>
      <PluginList className="m-2" onClick={onRequestProof} unremovable />
    </Modal>
  );
}

function IncomingRequest() {
  const [incomingRequest] = useIncomingPairingRequests();

  const accept = useCallback(() => {
    if (incomingRequest) acceptPairRequest(incomingRequest);
  }, [incomingRequest]);

  const reject = useCallback(() => {
    if (incomingRequest) rejectPairRequest(incomingRequest);
  }, [incomingRequest]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div>
        <span className="font-semibold text-blue-500">{incomingRequest}</span>
        <span> wants to pair with you.</span>
      </div>
      <div className="flex flex-row gap-2">
        <button className="button" onClick={reject}>
          Decline
        </button>
        <button className="button button--primary" onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  );
}

function OutgoingRequest() {
  const [outgoingRequest] = useOutgoingPairingRequests();

  const cancel = useCallback(() => {
    if (outgoingRequest) {
      cancelPairRequest(outgoingRequest);
    }
  }, [outgoingRequest]);

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="flex flex-row items-center gap-2 mx-2">
        <Icon
          className="animate-spin w-fit text-slate-500"
          fa="fa-solid fa-spinner"
          size={1}
        />
        <span>
          <span>Awaiting response from </span>
          <span className="font-semibold text-blue-500">{outgoingRequest}</span>
          <span>...</span>
        </span>
      </span>
      <button className="button" onClick={cancel}>
        Cancel
      </button>
    </div>
  );
}

function ClientNotStarted() {
  return (
    <div className="flex flex-col text-slate-500 font-semibold gap-2">
      Client has not started
      <button className="button button--primary" onClick={connectRendezvous}>
        Start Client
      </button>
    </div>
  );
}

function PendingConnection() {
  const dispatch = useDispatch();
  const [target, setTarget] = useState('');

  const onSend = useCallback(() => {
    dispatch(setP2PError(''));
    sendPairRequest(target);
  }, [target]);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    dispatch(setP2PError(''));
    setTarget(e.target.value);
  }, []);

  return (
    <div className="flex flex-col w-full items-center gap-2">
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
          value={target}
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
