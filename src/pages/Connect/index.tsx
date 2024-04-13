import React, { useEffect, useState, useCallback } from 'react';
import { sendPairRequest } from '../../reducers/p2p';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { usePairId } from '../../reducers/p2p';
import Icon from '../../components/Icon';

export default function Connect() {
  const dispatch = useDispatch();
  const [peerId, setPeerId] = useState('');
  const [loading, setLoading] = useState(false);

  const pairId = usePairId();
  const navigate = useNavigate();

  useEffect(() => {
    if (pairId && loading) {
      console.log('Connected to peer', pairId);
      setLoading(false);
      navigate('/create-session');
    }
  }, [pairId]);

  const connect = useCallback(() => {
    if (peerId) {
      console.log('Connecting to peer', peerId);
      dispatch(sendPairRequest(peerId));
      setLoading(true);
    } else {
      console.log('No peer ID provided');
    }
  }, [peerId]);

  return (
    <div className="flex flex-col justify-center items-center bg-slate-200 p-4 rounded border-slate-400 m-4 gap-2">
      <h1 className="text-base font-semibold">Enter peer ID to connect to</h1>
      <input
        className="input border border-slate-200 focus:border-slate-400 w-full"
        type="text"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') connect();
        }}
        autoFocus
      />
      <button
        className="button button--primary"
        disabled={!peerId || loading}
        onClick={connect}
      >
        {loading ? (
          <Icon
            className="animate-spin text-white"
            fa="fa-solid fa-spinner"
            size={1}
          />
        ) : (
          'Connect'
        )}
      </button>
    </div>
  );
}
