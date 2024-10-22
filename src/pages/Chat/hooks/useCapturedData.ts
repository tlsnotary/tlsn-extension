import { useState, useCallback } from 'react';
import { CapturedData, RequestData } from '../types';
import { extractBodyFromResponse } from '../../../utils/misc';

export const useCapturedData = () => {
    const [capturedData, setCapturedData] = useState<CapturedData[]>([]);

    const handleCapturedData = useCallback((data: CapturedData[]) => {
        setCapturedData(data);
    }, []);

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

    return { capturedData, handleCapturedData, captureRequestAndResponse };
};
