import React, { useEffect, useState } from 'react';
import { useActiveTab, useActiveTabUrl } from '../../reducers/requests';
import Modal, {
  ModalHeader,
  ModalContent,
  ModalFooter,
} from '../../components/Modal/Modal';
import { deleteConnection, getConnection } from '../../entries/Background/db';

const ConnectionDetailsModal = (props: {
  showConnectionDetails: boolean;
  setShowConnectionDetails: any;
}) => {
  const activeTab = useActiveTab();
  const activeTabOrigin = useActiveTabUrl();

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    (async () => {
      if (activeTabOrigin) {
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
      className="w-full h-[40%] max-w-lg mx-auto rounded-lg shadow-lg flex flex-col"
    >
      <ModalHeader className="w-full p-4 rounded-t-lg">
        <div className="flex flex-row items-center justify-center gap-2">
          <span className="text-lg font-semibold">Connections</span>
        </div>
      </ModalHeader>
      <ModalContent className="w-full flex-grow p-4 flex flex-row items-center justify-between">
        <div className="flex flex-row gap-2 items-center">
          {!!activeTab?.favIconUrl && (
            <img
              src={activeTab?.favIconUrl}
              className="h-5 rounded-full"
              alt="logo"
            />
          )}
          <span className="text-gray-700">{activeTabOrigin?.host}</span>
        </div>
        <div className="flex justify-end">
          <button
            className="button px-2 py-2 disabled:opacity-50"
            disabled={!connected}
            onClick={() => handleDisconnect()}
          >
            Disconnect
          </button>
        </div>
      </ModalContent>
      <ModalFooter className="flex justify-end gap-2 p-4 rounded-b-lg">
        <button
          className="button"
          onClick={() => props.setShowConnectionDetails(false)}
        >
          Exit
        </button>
      </ModalFooter>
    </Modal>
  );
};

export default ConnectionDetailsModal;
