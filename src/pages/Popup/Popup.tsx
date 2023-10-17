import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import {
  setActiveTab,
  setRequests,
  useActiveTab,
  useActiveTabUrl,
} from '../../reducers/requests';
import { BackgroundActiontype } from '../Background/actionTypes';
import Requests from '../Requests';
import Options from '../../components/Options';
import Request from '../Requests/Request';
import Home from '../Home';
import logo from '../../assets/img/icon-128.png';
import RequestBuilder from '../RequestBuilder';

const Popup = () => {
  const dispatch = useDispatch();
  const activeTab = useActiveTab();
  const url = useActiveTabUrl();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });

      dispatch(setActiveTab(tab || null));

      const logs = await chrome.runtime.sendMessage({
        type: BackgroundActiontype.get_requests,
        data: tab?.id,
      });

      dispatch(setRequests(logs));
    })();
  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="flex flex-nowrap flex-shrink-0 flex-row items-center relative gap-2 h-9 p-2 cursor-default justify-center bg-slate-300 w-full">
        <img
          className="absolute left-2 h-5 cursor-pointer"
          src={logo}
          alt="logo"
          onClick={() => navigate('/')}
        />
        <div className="absolute right-2 flex flex-nowrap flex-row items-center gap-1 justify-center w-fit">
          <img
            src={activeTab?.favIconUrl}
            className="h-5 rounded-full"
            alt="logo"
          />
          <div className="text-xs">{url?.hostname}</div>
        </div>
      </div>
      <Routes>
        <Route path="/requests/:requestId/*" element={<Request />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/custom/*" element={<RequestBuilder />} />
        <Route path="/options" element={<Options />} />
        <Route path="/home" element={<Home />} />
        <Route path="*" element={<Navigate to="/home" />} />
      </Routes>
    </div>
  );
};

export default Popup;
