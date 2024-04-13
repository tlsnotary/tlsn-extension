import React, { ReactElement } from 'react';
import { useNavigate } from 'react-router';

type Props = {};

export default function P2P(props: Props): ReactElement {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col flex-nowrap flex-grow gap-2 m-4">
      <button
        className="button button--primary mx-20"
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
