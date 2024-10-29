import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Chat.css';
import { useRequests } from '../../reducers/requests';
import { extractBodyFromResponse } from '../../utils/misc';

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
}

interface CapturedData {
    request: string;
    headers: Record<string, string>;
    response: string;
}

interface RequestData {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
}

interface TabInfo {
    url: string;
    title: string;
    favicon: string;
}

const Chat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const savedMessages = localStorage.getItem('chatMessages');
        return savedMessages ? JSON.parse(savedMessages) : [];
    });
    const [inputMessage, setInputMessage] = useState('');
    const [allRequests, setAllRequests] = useState<RequestData[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const [chatId, setChatId] = useState<string | null>(null);
    const requests = useRequests();
    const [capturedData, setCapturedData] = useState<CapturedData[]>([]);
    const [hasSetInitialTabInfo, setHasSetInitialTabInfo] = useState(false);

    useEffect(() => {
        localStorage.setItem('chatMessages', JSON.stringify(messages));
    }, [messages]);

    const getCurrentTabInfo = async (): Promise<TabInfo> => {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const currentTab = tabs[0];
                resolve({
                    url: currentTab.url || '',
                    title: currentTab.title || '',
                    favicon: currentTab.favIconUrl || ''
                });
            });
        });
    };

    const initializeChat = async () => {
        const storedChatId = localStorage.getItem('chatId');
        if (storedChatId) {
            setChatId(storedChatId);
            await connectWebSocket(storedChatId);
        } else {
            await fetchNewChatId();
        }
    };

    useEffect(() => {
        initializeChat();
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    // Effect to set initial tab info when connection is established
    useEffect(() => {
        const setInitialTabInfo = async () => {
            if (isConnected && messages.length === 0 && !hasSetInitialTabInfo) {
                const tabInfo = await getCurrentTabInfo();
                setInputMessage(`Current Page: ${tabInfo.title}\n website URL: ${tabInfo.url}`);
                setHasSetInitialTabInfo(true);

                // Send initial info to background script
                chrome.runtime.sendMessage({
                    type: 'TAB_INFO',
                    data: tabInfo
                });
            }
        };

        setInitialTabInfo();
    }, [isConnected, messages.length, hasSetInitialTabInfo]);

    const fetchNewChatId = async () => {
        try {
            const response = await fetch('http://localhost:8000/get_chat_id');
            const data = await response.json();
            const newChatId = data.chat_id;
            localStorage.setItem('chatId', newChatId);
            setChatId(newChatId);
            await connectWebSocket(newChatId);
        } catch (error) {
            console.error('Failed to fetch chat ID:', error);
        }
    };

    const captureRequestAndResponse = useCallback(async (req: RequestData) => {
        try {
            const response = await fetch(req.url, {
                method: req.method,
                headers: req.headers,
                body: req.body,
            });
            const responseText = await extractBodyFromResponse(response);
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            setCapturedData(prevData => [...prevData, {
                request: `${req.method} ${req.url}`,
                headers,
                response: responseText,
            }]);
        } catch (error) {
            console.error('Error capturing request and response:', error);
        }
    }, []);

    const fetchMultipleRequests = async (requests: RequestData[]) => {
        try {
            const fetchPromises = requests.map(async (req) => {
                if (req.headers === null || req.headers === undefined) {
                    req.headers = {};
                }
                if (req.body === null || req.body === undefined) {
                    req.body = '';
                }
                const response = await fetch(req.url, {
                    method: req.method,
                    headers: req.headers,
                });
                const responseText = await response.text();
                return {
                    request: `${req.method} ${req.url}`,
                    headers: req.headers,
                    response: responseText,
                };
            });

            const responses = await Promise.all(fetchPromises);
            setCapturedData(prevData => [...prevData, ...responses]);
            const response_message = responses.map(data => data.response).join('\n');
            setInputMessage(response_message);
        } catch (error) {
            console.error('Error fetching multiple requests:', error);
        }
    };

    const connectWebSocket = async (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socketRef.current = new WebSocket(`ws://localhost:8000/ws/${id}`);

            socketRef.current.onopen = () => {
                console.log('WebSocket connection established');
                setIsConnected(true);
                resolve();
            };

            socketRef.current.onmessage = (event) => {
                const botResponse: Message = {
                    id: Date.now(),
                    text: event.data,
                    sender: 'bot',
                };
                setMessages((prevMessages) => [...prevMessages, botResponse]);

                if (botResponse.text.includes("send_request_function")) {
                    const updatedRequests = requests.map(req => ({
                        method: req.method,
                        url: req.url,
                        headers: req.requestHeaders.reduce((acc: { [key: string]: string }, h: any) => {
                            if (h.name && h.value) acc[h.name] = h.value;
                            return acc;
                        }, {}),
                    }));

                    setAllRequests(updatedRequests);
                    const requestDetails = updatedRequests.map(req =>
                        `${req.method} ${req.url}\nHeaders: ${JSON.stringify(req.headers, null, 2)}`
                    ).join('\n\n');
                    setInputMessage(requestDetails);
                }

                if (botResponse.text.includes("send_response_function")) {
                    const regex = /"send_response_function"\s*:\s*(\[.*?\])/s;
                    const match = botResponse.text.match(regex);
                    if (match) {
                        const requestArrayString = match[1];
                        try {
                            const requestArray: RequestData[] = JSON.parse(requestArrayString);
                            fetchMultipleRequests(requestArray);
                        } catch (error) {
                            console.error("Error parsing JSON:", error);
                        }
                    }
                }
            };

            socketRef.current.onclose = () => {
                console.log('WebSocket connection closed');
                setIsConnected(false);
            };

            socketRef.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };
        });
    };

    useEffect(() => {
        if (capturedData.length > 0 && isConnected) {
            const capturedDataMessage = JSON.stringify(capturedData);
            socketRef.current?.send(capturedDataMessage);
            setCapturedData([]);
        }
    }, [capturedData, isConnected]);

    const sendMessage = () => {
        if (inputMessage.trim() === '' || !isConnected) return;

        const newMessage: Message = {
            id: Date.now(),
            text: inputMessage,
            sender: 'user',
        };
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        setInputMessage('');

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(inputMessage);
        } else {
            console.error('WebSocket is not connected');
        }
    };

    const clearChat = () => {
        setMessages([]);
        setAllRequests([]);
        setCapturedData([]);
        setHasSetInitialTabInfo(false);
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
                    <button
                        onClick={sendMessage}
                        className="send-button"
                        disabled={!isConnected}
                    >
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
            {!isConnected && <div className="connection-status">Disconnected</div>}
        </div>
    );
};

export default Chat;