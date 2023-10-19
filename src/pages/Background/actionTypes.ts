export enum BackgroundActiontype {
  get_requests = 'get_requests',
  clear_requests = 'clear_requests',
  push_action = 'push_action',
  get_prove_requests = 'get_prove_requests',
  prove_request_start = 'prove_request_start',
  process_prove_request = 'process_prove_request',
  finish_prove_request = 'finish_prove_request',
}

export type BackgroundAction = {
  type: BackgroundActiontype;
  data?: any;
  meta?: any;
  error?: boolean;
};

export type RequestLog = {
  requestId: string;
  tabId: number;
  method: string;
  type: string;
  url: string;
  initiator: string | null;
  requestHeaders: chrome.webRequest.HttpHeader[];
  requestBody?: string;
  formData?: {
    [k: string]: string[];
  };
  responseHeaders?: chrome.webRequest.HttpHeader[];
};

export type RequestHistory = {
  id: string;
  url: string;
  method: string;
  headers: { [key: string]: string };
  body: string;
  maxTranscriptSize: string;
  notaryUrl: string;
  websocketProxyUrl: string;
  status: 'pending' | 'success' | 'error';
  responseJson?: any;
  responseText?: string; 
  responseBlob?: any;
  error?: any;
}
