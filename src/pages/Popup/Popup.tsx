import React, {useEffect, useState} from 'react';
import logo from '../../assets/img/icon-128.png';
import './Popup.scss';
import {BackgroundActiontype, RequestLog} from "../Background/actionTypes";

const Popup = () => {
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [selectedRequest, selectRequest] = useState<RequestLog | null>(null);

  useEffect(() => {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

      setActiveTab(tab || null);

      const logs = await chrome.runtime.sendMessage({
        type: BackgroundActiontype.get_requests,
        data: tab.id,
      });

      setRequests(logs);
    })();

  }, []);

  const url = activeTab?.url ? new URL(activeTab.url) : null;
  return (
    <div className="flex flex-col w-full h-full">
      <header className="flex flex-row items-center justify-center border-b border-slate-200">
        <img src={logo} className="w-8 m-4" alt="logo" />
      </header>
      <div className="flex flex-nowrap flex-row gap-2 p-2 justify-center bg-slate-100">
        <img src={activeTab?.favIconUrl} className="h-5 rounded-full" alt="logo" />
        <div className="text-sm">{url?.origin}</div>
      </div>
      {selectedRequest && (
        <table className="border border-slate-300 border-collapse table-fixed">
          <tbody className="">
            <tr>
              <td className="font-bold align-top py-1 px-2">
                {selectedRequest.method}
              </td>
              <td className="break-all py-1 px-2">{selectedRequest.url}</td>
            </tr>
          {selectedRequest.requestHeaders.map(h => (
            <tr>
              <td className="font-bold align-top py-1 px-2">
                {h.name}
              </td>
              <td className="break-all py-1 px-2">{h.value}</td>
            </tr>
          ))}
          </tbody>
        </table>
      )}
      {
        !!requests.length && (
          <div className="flex flex-col flex-nowrap">
            <table className="border border-slate-300 border-collapse table-auto">
              <thead className="bg-slate-200">
                <tr>
                  <td className="border border-slate-300 py-1 px-2">Method</td>
                  <td className="border border-slate-300 py-1 px-2">Name</td>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr onClick={() => selectRequest(r)} className="cursor-pointer hover:bg-slate-100">
                    <td className="border border-slate-200 py-1 px-2">{r.method}</td>
                    <td className="border border-slate-200 py-1 px-2">{new URL(r.url).pathname}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

    </div>
  );
};

export default Popup;
