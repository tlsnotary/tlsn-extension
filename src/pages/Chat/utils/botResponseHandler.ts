import { RequestData } from '../types';

export const handleBotResponse = async (
    messageText: string,
    setInputMessage: (message: string) => void,
    fetchMultipleRequests: (requests: RequestData[]) => Promise<void>
) => {
    if (messageText.includes("send_request_function")) {
        // Handle request function logic
    }

    if (messageText.includes("send_response_function")) {
        const regex = /"send_response_function"\s*:\s*(\[.*?\])/s;
        const match = messageText.match(regex);
        if (!match) {
            console.error("No JSON-like content found in the message");
            return;
        }

        try {
            const requestArray: RequestData[] = JSON.parse(match[1]);
            await fetchMultipleRequests(requestArray);
        } catch (error) {
            console.error("Error parsing JSON:", error);
        }
    }
};