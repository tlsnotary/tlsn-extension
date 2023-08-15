export enum BackgroundActiontype {
  get_requests = 'get_requests',
  clear_requests = 'clear_requests',
  push_action = 'push_action',
}

export type BackgroundAction = {
  type: BackgroundActiontype,
  data?: any;
  meta?: any;
  error?: boolean;
}

export type RequestLog = {
  requestId: string;
  tabId: number;
  method: 'GET' | 'POST',
  type: string;
  url: string;
  initiator: string | null;
  requestHeaders: chrome.webRequest.HttpHeader[];
  requestBody?: string;
  responseHeaders?: chrome.webRequest.HttpHeader[];
}
