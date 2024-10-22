import { RequestData } from '../types';

export const fetchMultipleRequests = async (requests: RequestData[]) => {
    try {
        const fetchPromises = requests.map(async (req) => {
            const response = await fetch(req.url, {
                method: req.method,
                headers: req.headers || {},
                body: req.body || '',
            });
            const responseText = await response.text();
            return {
                request: `${req.method} ${req.url}`,
                headers: req.headers,
                response: responseText,
            };
        });

        return await Promise.all(fetchPromises);
    } catch (error) {
        console.error('Error fetching multiple requests:', error);
        throw error;
    }
};