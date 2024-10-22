import React from 'react';
import { Message } from '../types';

interface ChatWindowProps {
    messages: Message[];
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages }) => (
    <div className="chat-window">
        {messages.map((message) => (
            <div
                key={message.id}
                className={`message ${message.sender === 'user' ? 'user' : 'bot'}`}
            >
                {message.text}
            </div>
        ))}
    </div>
);

export default ChatWindow;