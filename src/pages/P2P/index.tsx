import React, { ReactElement, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { connectSession } from '../../reducers/p2p';

export default function P2P(): ReactElement {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(connectSession());
  }, []);

  return (
    <div className="flex flex-col flex-nowrap flex-grow gap-2 m-4">
      <button
        className="button button--primary mx-20 brea"
        onClick={() => navigate('/create-session')}
      >
        Create Session
      </button>
      <button
        className="button button--primary mx-20"
        onClick={() => navigate('/connect-session')}
      >
        Connect to Session
      </button>
    </div>
  );
}
