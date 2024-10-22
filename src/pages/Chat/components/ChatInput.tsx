import React from 'react';

interface ChatInputProps {
    inputMessage: string;
    setInputMessage: (message: string) => void;
    sendMessage: () => void;
    clearChat: () => void;
    isConnected: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
    inputMessage,
    setInputMessage,
    sendMessage,
    clearChat,
    isConnected
}) => (
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
            <button onClick={sendMessage} className="send-button" disabled={!isConnected}>
                Send
            </button>
            <button
                onClick={clearChat}
                className="clear-button"
                style={{ backgroundColor: '#f44336', color: 'white', border: 'none' }}
            >
                Clear Chat
            </button>
        </div>
    </div>
);

export default ChatInput;
