import React, {useEffect, useState} from 'react';
import {Route, Routes, Navigate} from "react-router";
import {useDispatch} from "react-redux";
import {setRequests} from "../../reducers/requests";
import {BackgroundActiontype} from "../Background/actionTypes";
import Requests from "../Requests";
import Request from "../Requests/Request";

const Popup = () => {
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const dispatch = useDispatch();

  useEffect(() => {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

      setActiveTab(tab || null);

      const logs = await chrome.runtime.sendMessage({
        type: BackgroundActiontype.get_requests,
        data: tab.id,
      });

      dispatch(setRequests(logs));
    })();

  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <Routes>
        <Route
          path="/requests/:requestId/*"
          element={(
            <Request activeTab={activeTab} />
          )}
        />
        <Route
          path="/requests"
          element={(
            <Requests activeTab={activeTab} />
          )}
        />
        <Route
          path="/"
          element={(
            <Navigate to="/requests" />
          )}
        />
      </Routes>
    </div>
  );
};

export default Popup;
