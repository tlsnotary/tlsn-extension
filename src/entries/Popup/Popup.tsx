import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import {
  setActiveTab,
  setRequests,
  useActiveTab,
  useActiveTabUrl,
} from '../../reducers/requests';
import { BackgroundActiontype } from '../Background/rpc';
import Requests from '../../pages/Requests';
import Options from '../../pages/Options';
import Request from '../../pages/Requests/Request';
import Home from '../../pages/Home';
import logo from '../../assets/img/icon-128.png';
import RequestBuilder from '../../pages/RequestBuilder';
import Notarize from '../../pages/Notarize';
import ProofViewer from '../../pages/ProofViewer';
import History from '../../pages/History';
import ProofUploader from '../../pages/ProofUploader';
import browser from 'webextension-polyfill';
import store from '../../utils/store';
import PluginUploadInfo from '../../components/PluginInfo';
import { ConnectionApproval } from '../../pages/ConnectionApproval';
import { GetHistoryApproval } from '../../pages/GetHistoryApproval';
import { GetProofApproval } from '../../pages/GetProofApproval';
import { NotarizeApproval } from '../../pages/NotarizeApproval';
import { InstallPluginApproval } from '../../pages/InstallPluginApproval';
import { GetPluginsApproval } from '../../pages/GetPluginsApproval';
import { RunPluginApproval } from '../../pages/RunPluginApproval';
import Modal, {
  ModalHeader,
  ModalContent,
  ModalFooter,
} from '../../components/Modal/Modal';
import { deleteConnection, getConnection } from '../Background/db';

const Popup = () => {
  const dispatch = useDispatch();
  const activeTab = useActiveTab();
  const url = useActiveTabUrl();
  const navigate = useNavigate();

  const [showConnectionDetails, setShowConnectionDetails] = useState(false);

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
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="flex flex-nowrap flex-shrink-0 flex-row items-center relative gap-2 h-9 p-2 cursor-default justify-center bg-slate-300 w-full">
        <img
          className="absolute left-2 h-5 cursor-pointer"
          src={logo}
          alt="logo"
          onClick={() => navigate('/')}
        />
        <div
          className="absolute right-2 flex flex-nowrap flex-row items-center gap-1 justify-center w-fit"
          onClick={() => setShowConnectionDetails(true)}
        >
          {!!activeTab?.favIconUrl && (
            <img
              src={activeTab?.favIconUrl}
              className="h-5 rounded-full"
              alt="logo"
            />
          )}
          <div className="text-xs">{url?.hostname}</div>
        </div>
        {showConnectionDetails && (
          <ConnectionDetails
            showConnectionDetails={showConnectionDetails}
            setShowConnectionDetails={setShowConnectionDetails}
          />
        )}
      </div>
      <Routes>
        <Route path="/requests/:requestId/*" element={<Request />} />
        <Route path="/notary/:requestId" element={<Notarize />} />
        <Route path="/verify/:requestId/*" element={<ProofViewer />} />
        <Route path="/verify" element={<ProofUploader />} />
        <Route path="/history" element={<History />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/custom/*" element={<RequestBuilder />} />
        <Route path="/options" element={<Options />} />
        <Route path="/home" element={<Home />} />
        <Route path="/plugininfo" element={<PluginUploadInfo />} />
        <Route path="/connection-approval" element={<ConnectionApproval />} />
        <Route path="/get-history-approval" element={<GetHistoryApproval />} />
        <Route path="/get-proof-approval" element={<GetProofApproval />} />
        <Route path="/notarize-approval" element={<NotarizeApproval />} />
        <Route path="/get-plugins-approval" element={<GetPluginsApproval />} />
        <Route path="/run-plugin-approval" element={<RunPluginApproval />} />
        <Route
          path="/install-plugin-approval"
          element={<InstallPluginApproval />}
        />
        <Route path="*" element={<Navigate to="/home" />} />
      </Routes>
    </div>
  );
};

const ConnectionDetails = (props: {
  showConnectionDetails: boolean;
  setShowConnectionDetails: any;
}) => {
  const activeTab = useActiveTab();
  const activeTabOrigin = useActiveTabUrl();

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    (async () => {
      if (activeTabOrigin) {
        console.log(activeTabOrigin);
        const isConnected: boolean | null = await getConnection(
          activeTabOrigin?.origin,
        );
        isConnected ? setConnected(true) : setConnected(false);
      }
    })();
  }, []);

  const handleDisconnect = async () => {
    await deleteConnection(activeTabOrigin?.origin as string);
    setConnected(false);
  };

  return (
    <Modal
      onClose={() => props.setShowConnectionDetails(false)}
      className="w-full h-[50%]"
    >
      <ModalHeader className="w-full">
        <div className="flex flex-row items-center justify-center gap-2">
          {!!activeTab?.favIconUrl && (
            <img
              src={activeTab?.favIconUrl}
              className="h-5 rounded-full"
              alt="logo"
            />
          )}
          <span>{activeTabOrigin?.host}</span>
        </div>
      </ModalHeader>
      <ModalContent className="w-full flex flex-row">
        <div className="flex flex-row gap-2 p-4">
          {!!activeTab?.favIconUrl && (
            <img
              src={activeTab?.favIconUrl}
              className="h-5 rounded-full"
              alt="logo"
            />
          )}
          <span>{activeTabOrigin?.host}</span>
        </div>
        <div className="w-full flex justify-end p-4">
          <button className="button" disabled={!connected} onClick={() => handleDisconnect()}>
            Disconnect
          </button>
        </div>
      </ModalContent>
      <ModalFooter className="flex justify-end gap-2 p-4">
        <button className="button" onClick={() => props.setShowConnectionDetails(false)}>
          Exit
        </button>
      </ModalFooter>
    </Modal>
  );
};
export default Popup;
