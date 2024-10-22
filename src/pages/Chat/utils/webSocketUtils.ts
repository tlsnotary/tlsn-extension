export const initializeWebSocket = (id: string, setIsConnected: (connected: boolean) => void) => {
    return new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(`ws://localhost:8000/ws/${id}`);

        socket.onopen = () => {
            console.log('WebSocket connection established');
            setIsConnected(true);
            resolve(socket);
        };

        socket.onclose = () => {
            console.log('WebSocket connection closed');
            setIsConnected(false);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            reject(error);
        };
    });
};