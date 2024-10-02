import React, { useState, useEffect } from 'react';
import axios from 'axios';

import './Chat.css';

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
}

const Chat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const savedMessages = localStorage.getItem('chatMessages');
        return savedMessages ? JSON.parse(savedMessages) : [];
    });
    const [inputMessage, setInputMessage] = useState('');

    useEffect(() => {
        localStorage.setItem('chatMessages', JSON.stringify(messages));
    }, [messages]);

    const sendMessage = async () => {
        if (inputMessage.trim() === '') return;

        const newMessage: Message = {
            id: Date.now(),
            text: inputMessage,
            sender: 'user',
        };

        setMessages([...messages, newMessage]);
        setInputMessage('');

        console.log('User message:', newMessage.text);

        try {
            // Send message to backend API
            const response = await axios.post('http://localhost:8080/echo', {
                message: inputMessage,
            });

            // Add bot response to messages
            const botResponse: Message = {
                id: Date.now() + 1,
                text: response.data.message, // Assuming the API returns a 'msg' field
                sender: 'bot',
            };

            setMessages((prevMessages) => [...prevMessages, botResponse]);
            console.log('Bot response:', botResponse.text);
        } catch (error) {
            console.error('Error sending message:', error);
            // Handle error (e.g., show error message to user)
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    return (
        <div className="chat-container">
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
            <div className="chat-input">
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="chat-input-field"
                />
                <div className="chat-buttons">
                    <button onClick={sendMessage} className="send-button">Send</button>
                    <button onClick={clearChat} className="clear-button" style={{ backgroundColor: '#f44336', color: 'white', border: 'none' }}>Clear Chat</button>
                </div>
            </div>
        </div>
    );
};

export default Chat;
