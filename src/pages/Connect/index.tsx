import React, { useEffect, useState, useCallback} from 'react';
import { sendPairRequest } from '../../reducers/p2p';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { usePairId } from '../../reducers/p2p';


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
      console.log('Connecting to peer', peerId)
      dispatch(sendPairRequest(peerId));
      setLoading(true);
    } else {
      console.log('No peer ID provided');
    }
  }, [peerId]);


  return (
    <div className="flex flex-col justify-center items-center">
      <h1>Enter peer ID to connect to</h1>
      <input
        type="text"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
        onKeyDown={connect}
      />
      <button disabled={!peerId} onClick={connect}>Connect</button>
    </div>
  );
}
