import React, { useEffect, useState, useCallback } from 'react';

interface Messages {
  from: string;
  to: string;
  text: string;
  id: number;
}

export default function Connect() {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedToPeer, setConnectedToPeer] = useState(false);
  const [messages, setMessages] = useState<Messages[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [input, setInput] = useState('');
  const [peerId, setPeerId] = useState('');


  useEffect(() => {
    const socket = new WebSocket('ws://0.tcp.ngrok.io:14339');
    socket.onopen = () => {
      console.log('Connected to websocket');
      setIsConnected(true);
    };
    socket.onmessage = async (event) => {
      const message = JSON.parse(await event.data.text());
      console.log(message);
      switch (message.method) {
        case 'client_connect':
          setConnectedToPeer(true);
          setPeerId(message.peer_id);
          break;
        case 'chat':
          setMessages([...messages, message]);
          break;
        default:
          console.log('Unknown message type');
          break;
      }
    };
    socket.onerror = () => {
      console.log('Error connecting to websocket');
      setIsConnected(false);
    };

    setSocket(socket);

    return () => {
      socket.close();
    };
  }, []);

  const fetchInviteLink = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('https://notary.pse.dev/invite');
      const inviteLink: string = await res.json();
      setInviteLink(`${inviteLink}`);
    } catch {
      setInviteLink('Error fetching invite link');
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
    },
    [input],
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    },
    [input],
  );

  const sendMessage = () => {
    if (socket) {
      const message: Messages = {
        text: input,
        from: 'me',
        to: peerId,
        id: Math.random(),
      };
      socket.send(JSON.stringify(message));
      setMessages([...messages, message]);
      setInput('');
    }
  };
  return (
    <div className="flex flex-col justify-center items-center w-full">
      <h1>Peer to peer proving</h1>
      <div className="flex flex-col justify-center items-center w-full h-full">
        {isConnected ? (
          <span className="fa-solid fa-plug"></span>
        ) : (
          <span className="fa-solid fa-plug-circle-xmark"></span>
        )}
        {connectedToPeer ? (
          <div>
            <span className="text-green-500">Connected to peer</span>
            <div  className="border border-solid border-gray-300">
              <strong>Peer ID:</strong>
              {peerId}
            {messages.map((message, index) => (
              <div key={index}>
                <strong>{message.from} :</strong>
                {message.text}
              </div>
            ))}
            </div>
            <input
            className="border border-solid border-gray-300"
              type="text"
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              value={input}
            />
          </div>
        ) : (
          <div>
            {inviteLink ? (
              <div>
                <textarea readOnly className="resize-none">
                  {inviteLink}
                </textarea>
                <button>Copy button</button>
                <button onClick={(e) => setRefresh(!refresh)}>
                  Refresh button
                </button>
              </div>
            ) : (
              <button onClick={fetchInviteLink}>Generate Invite Link</button>
            )}
            <span className="text-red-500">Waiting for connection to peer</span>
          </div>
        )}
      </div>
    </div>
  );
}
