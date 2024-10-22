import { useState, useRef, useEffect } from 'react';
import { initializeWebSocket } from '../utils/webSocketUtils';

export const useWebSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const [chatId, setChatId] = useState<string | null>(null);

    useEffect(() => {
        const initialize = async () => {
            const storedChatId = localStorage.getItem('chatId');
            if (storedChatId) {
                setChatId(storedChatId);
                await connectWebSocket(storedChatId);
            } else {
                await fetchNewChatId();
            }
        };

        initialize();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    const connectWebSocket = async (id: string) => {
        socketRef.current = await initializeWebSocket(id, setIsConnected);
    };

    const sendWebSocketMessage = (message: string) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(message);
        } else {
            console.error('WebSocket is not connected');
        }
    };

    return { isConnected, sendWebSocketMessage };
};
