export interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
}

export interface CapturedData {
    request: string;
    headers: Record<string, string>;
    response: string;
}

export interface RequestData {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
}