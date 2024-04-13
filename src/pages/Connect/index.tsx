import React, { useEffect, useState } from 'react';


export default function Connect() {

  const [inviteLink, setInviteLink] = useState('Waiting for server...');
  const [isConnected, setIsConnected]= useState(false);
  const [connectedToPeer, setConnectedToPeer] = useState(false);
  const [refresh, setRefresh] = useState(false);

  useEffect(() => {
      const socket = new WebSocket('wss://notary.pse.dev/rendezvous');
      socket.onopen = () => {
        console.log('Connected to websocket')
        setIsConnected(true);
      }
      console.log('Error connecting to websocket')
      setIsConnected(false);

    socket.onmessage = (e) => {
      console.log('Received message from peer')
      setConnectedToPeer(true);
    }
    const fetchInviteLink = async (): Promise<void> => {
      try {
        const res = await fetch('https://notary.pse.dev/invite');
        const inviteLink: string = await res.json();
        setInviteLink(`${inviteLink}`);
      } catch {
        setInviteLink('Error fetching invite link');
      }
    }
    fetchInviteLink();
  }, [refresh])

// receive some message from peer to check if connected

  return (
    <div className="flex flex-col justify-center items-center w-full">
      <h1>Peer to peer proving</h1>
      <div className="flex flex-col justify-center items-center w-full h-full">
        {isConnected ?
          <span className="fa-solid fa-plug"></span>
         :
          <span className="fa-solid fa-plug-circle-xmark"></span>
        }
      <textarea readOnly className="resize-none">
        {inviteLink}
      </textarea>
      <button>Copy button</button>
      <button onClick={(e) => setRefresh(!refresh)}>Refresh button</button>
      {connectedToPeer ?
      <span className="text-green-500">Connected to peer</span>
       :
      <span className="text-red-500">Waiting for connection to peer</span>
      }
      </div>
    </div>
  );
}
