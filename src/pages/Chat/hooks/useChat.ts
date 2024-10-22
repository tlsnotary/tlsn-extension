import { useState, useEffect } from 'react';
import { Message } from '../types';
import { useWebSocket } from './useWebSocket';
import { useRequests } from '../../../reducers/requests';
import { useCapturedData } from './useCapturedData';
import { handleBotResponse } from '../utils/botResponseHandler';

export const useChat = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const savedMessages = localStorage.getItem('chatMessages');
        return savedMessages ? JSON.parse(savedMessages) : [];
    });
    const [inputMessage, setInputMessage] = useState('');
    const { isConnected, sendWebSocketMessage } = useWebSocket();
    const requests = useRequests();
    const { capturedData, handleCapturedData } = useCapturedData();

    useEffect(() => {
        localStorage.setItem('chatMessages', JSON.stringify(messages));
    }, [messages]);

    const sendMessage = () => {
        if (inputMessage.trim() === '' || !isConnected) return;

        const newMessage: Message = {
            id: Date.now(),
            text: inputMessage,
            sender: 'user',
        };
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        setInputMessage('');
        sendWebSocketMessage(inputMessage);
    };

    const clearChat = () => {
        setMessages([]);
        handleCapturedData([]);
    };

    return {
        messages,
        inputMessage,
        setInputMessage,
        isConnected,
        sendMessage,
        clearChat
    };
};