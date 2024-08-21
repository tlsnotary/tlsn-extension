import React, { useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import {
  useActiveTabUrl,
  setConnection,
  useIsConnected,
} from '../../reducers/requests';
import Modal, { ModalHeader, ModalContent } from '../../components/Modal/Modal';
import { deleteConnection, getConnection } from '../../entries/Background/db';

const ConnectionDetailsModal = (props: {
  showConnectionDetails: boolean;
  setShowConnectionDetails: (show: boolean) => void;
}) => {
  const dispatch = useDispatch();
  const activeTabOrigin = useActiveTabUrl();
  const connected = useIsConnected();

  useEffect(() => {
    (async () => {
      if (activeTabOrigin) {
        const isConnected: boolean | null = await getConnection(
          activeTabOrigin.origin,
        );
        dispatch(setConnection(!!isConnected));
      }
    })();
  }, [activeTabOrigin, dispatch]);

  const handleDisconnect = useCallback(async () => {
    if (activeTabOrigin?.origin) {
      await deleteConnection(activeTabOrigin.origin);
      props.setShowConnectionDetails(false);
      dispatch(setConnection(false));
    }
  }, [activeTabOrigin?.origin, dispatch, props]);

  return (
    <Modal
      onClose={() => props.setShowConnectionDetails(false)}
      className="flex flex-col gap-2 items-center text-base cursor-default justify-center mx-4 min-h-24"
    >
      <ModalHeader
        className="w-full rounded-t-lg pb-0 border-b-0"
        onClose={() => props.setShowConnectionDetails(false)}
      >
        <span className="text-lg font-semibold">
          {activeTabOrigin?.hostname || 'Connections'}
        </span>
      </ModalHeader>
      <ModalContent className="w-full gap-2 flex-grow flex flex-col items-center justify-between px-4 pt-0 pb-4">
        <div className="flex flex-row gap-2 items-start w-full text-xs font-semibold text-slate-800">
          {connected
            ? 'TLSN Extension is connected to this site.'
            : 'TLSN Extension is not connected to this site. To connect to this site, find and click the connect button.'}
        </div>
        {connected && (
          <button
            className="button disabled:opacity-50 self-end"
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ConnectionDetailsModal;
