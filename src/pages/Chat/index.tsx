import React from 'react';
import './Chat.css';
import { useChat } from './hooks/useChat';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import ConnectionStatus from './components/ConnectionStatus';

const Chat: React.FC = () => {
    const {
        messages,
        inputMessage,
        setInputMessage,
        isConnected,
        sendMessage,
        clearChat
    } = useChat();

    return (
        <div className="chat-container">
            <ChatWindow messages={messages} />
            <ChatInput
                inputMessage={inputMessage}
                setInputMessage={setInputMessage}
                sendMessage={sendMessage}
                clearChat={clearChat}
                isConnected={isConnected}
            />
            {!isConnected && <ConnectionStatus />}
        </div>
    );
};

export default Chat;