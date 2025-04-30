import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { setActiveTab, setRequests } from '../../reducers/requests';
import { BackgroundActiontype } from '../Background/rpc';
import Options from '../../pages/Options';
import Request from '../../pages/Requests/Request';
import Home from '../../pages/Home';
import logo from '../../assets/img/icon-128.png';
import RequestBuilder from '../../pages/RequestBuilder';
import Notarize from '../../pages/Notarize';
import ProofViewer from '../../pages/ProofViewer';
import ProofUploader from '../../pages/ProofUploader';
import browser from 'webextension-polyfill';
import store from '../../utils/store';
import { isPopupWindow } from '../../utils/misc';
import { NotarizeApproval } from '../../pages/NotarizeApproval';
import { MenuIcon } from '../../components/Menu';
import { P2PHome } from '../../pages/PeerToPeer';
import { fetchP2PState } from '../../reducers/p2p';
import { RunPluginByUrlApproval } from '../../pages/RunPluginByUrlApproval';

const Popup = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isPopup, setIsPopup] = useState(isPopupWindow());
  useEffect(() => {
    fetchP2PState();
  }, []);

  useEffect(() => {
    (async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });

      dispatch(setActiveTab(tab || null));

      const logs = await browser.runtime.sendMessage({
        type: BackgroundActiontype.get_requests,
        data: tab?.id,
      });

      dispatch(setRequests(logs));

      await browser.runtime.sendMessage({
        type: BackgroundActiontype.get_prove_requests,
        data: tab?.id,
      });
    })();
  }, []);

  useEffect(() => {
    chrome.runtime.onMessage.addListener((request) => {
      switch (request.type) {
        case BackgroundActiontype.push_action: {
          if (
            request.data.tabId === store.getState().requests.activeTab?.id ||
            request.data.tabId === 'background'
          ) {
            store.dispatch(request.action);
          }
          break;
        }
        case BackgroundActiontype.change_route: {
          if (request.data.tabId === 'background') {
            navigate(request.route);
            break;
          }
        }
      }
    });
  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden lg:w-[600px] lg:h-[800px] lg:border lg:m-auto lg:mt-40 lg:bg-white lg:shadow">
      <div className="flex flex-nowrap flex-shrink-0 flex-row items-center relative gap-2 h-9 p-2 cursor-default justify-center bg-slate-300 w-full">
        <img
          className="absolute left-2 h-5 cursor-pointer"
          src={logo}
          alt="logo"
          onClick={() => navigate('/')}
        />
        <div className="flex flex-row flex-grow items-center justify-end gap-4">
          {!isPopup && (
            <>
              <MenuIcon />
            </>
          )}
        </div>
      </div>
      <Routes>
        <Route path="/requests/:requestId/*" element={<Request />} />
        <Route path="/notary/:requestId" element={<Notarize />} />
        <Route path="/verify/:requestId/*" element={<ProofViewer />} />
        <Route path="/verify" element={<ProofUploader />} />
        <Route path="/history" element={<Home tab="history" />} />
        <Route path="/requests" element={<Home tab="network" />} />
        <Route path="/custom/*" element={<RequestBuilder />} />
        <Route path="/options" element={<Options />} />
        <Route path="/home" element={<Home />} />
        <Route path="/notarize-approval" element={<NotarizeApproval />} />
        <Route
          path="/run-plugin-approval"
          element={<RunPluginByUrlApproval />}
        />
        <Route path="/p2p" element={<P2PHome />} />
        <Route path="*" element={<Navigate to="/home" />} />
      </Routes>
    </div>
  );
};

export default Popup;
