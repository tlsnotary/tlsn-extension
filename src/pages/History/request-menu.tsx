import React, {
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import classNames from 'classnames';
import Icon from '../../components/Icon';
import {
  addRequestCid,
  deleteRequestHistory,
  useRequestHistory,
} from '../../reducers/history';
import { download, upload } from '../../utils/misc';
import Modal, { ModalContent } from '../../components/Modal/Modal';
import { EXPLORER_API } from '../../utils/constants';
import copy from 'copy-to-clipboard';
import { setNotaryRequestCid } from '../../entries/Background/db';
import { useDispatch } from 'react-redux';
import { getNotaryApi, getProxyApi } from '../../utils/storage';
import { BackgroundActiontype } from '../../entries/Background/rpc';

export default function RequestMenu({
  requestId,
  showMenu,
}: {
  showMenu: (opened: boolean) => void;
  requestId: string;
}): ReactElement {
  const dispatch = useDispatch();
  const request = useRequestHistory(requestId);
  const [showingShareConfirmation, setShowingShareConfirmation] =
    useState(false);

  const onRetry = useCallback(async () => {
    const notaryUrl = await getNotaryApi();
    const websocketProxyUrl = await getProxyApi();
    chrome.runtime.sendMessage<any, string>({
      type: BackgroundActiontype.retry_prove_request,
      data: {
        id: requestId,
        notaryUrl,
        websocketProxyUrl,
      },
    });
  }, [requestId]);

  const onDelete = useCallback(async () => {
    dispatch(deleteRequestHistory(requestId));
  }, [requestId]);

  if (!request) return <></>;

  const { status } = request;

  return (
    <>
      {showingShareConfirmation && (
        <ShareConfirmationModal
          requestId={requestId}
          setShowingShareConfirmation={setShowingShareConfirmation}
          showMenu={showMenu}
        />
      )}
      <div
        className="fixed top-0 left-0 w-screen h-screen z-10 cursor-default"
        onClick={(e) => {
          e.stopPropagation();
          showMenu(false);
        }}
      />
      <div className="absolute top-[100%] right-0 rounded-md z-20">
        <div className="flex flex-col bg-slate-200 w-40 shadow rounded-md py">
          {status === 'success' && (
            <>
              <RequestMenuRow
                fa="fa-solid fa-download"
                className="border-b border-slate-300"
                onClick={(e) => {
                  e.stopPropagation();
                  showMenu(false);
                  download(`${request.id}.json`, JSON.stringify(request.proof));
                }}
              >
                Download
              </RequestMenuRow>
              <RequestMenuRow
                fa="fa-solid fa-upload"
                className="border-b border-slate-300"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowingShareConfirmation(true);
                }}
              >
                Share
              </RequestMenuRow>
            </>
          )}
          {status === 'error' && (
            <RequestMenuRow
              fa="fa-solid fa-arrows-rotate"
              className="border-b border-slate-300"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
                showMenu(false);
              }}
            >
              Retry
            </RequestMenuRow>
          )}
          <RequestMenuRow
            fa="fa-solid fa-trash"
            className="border-b border-slate-300 !text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              showMenu(false);
            }}
          >
            Delete
          </RequestMenuRow>
        </div>
      </div>
    </>
  );
}

function RequestMenuRow(props: {
  fa: string;
  children?: ReactNode;
  onClick?: MouseEventHandler;
  className?: string;
}): ReactElement {
  return (
    <div
      className={classNames(
        'flex flex-row items-center py-3 px-4 gap-2 hover:bg-slate-300 cursor-pointer text-slate-800 hover:text-slate-900 font-semibold',
        props.className,
      )}
      onClick={props.onClick}
    >
      <Icon size={0.875} fa={props.fa} />
      {props.children}
    </div>
  );
}

function ShareConfirmationModal({
  setShowingShareConfirmation,
  requestId,
  showMenu,
}: {
  showMenu: (opened: boolean) => void;
  setShowingShareConfirmation: (showing: boolean) => void;
  requestId: string;
}): ReactElement {
  const dispatch = useDispatch();
  const request = useRequestHistory(requestId);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    try {
      const data = await upload(
        `${request?.id}.json`,
        JSON.stringify(request?.proof),
      );
      await setNotaryRequestCid(requestId, data);
      dispatch(addRequestCid(requestId, data));
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }, [requestId, request, request?.cid]);

  const onClose = useCallback(() => {
    setShowingShareConfirmation(false);
    showMenu(false);
  }, [showMenu]);

  return !request ? (
    <></>
  ) : (
    <Modal
      className="flex flex-col items-center text-base cursor-default justify-center !w-auto mx-4 my-[50%] p-4 gap-4"
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <ModalContent className="flex flex-col w-full gap-4 items-center text-base justify-center">
        {!request.cid ? (
          <p className="text-slate-500 text-center">
            {uploadError ||
              'This will make your proof publicly accessible by anyone with the CID'}
          </p>
        ) : (
          <input
            className="input w-full bg-slate-100 border border-slate-200"
            readOnly
            value={`${EXPLORER_API}/ipfs/${request.cid}`}
            onFocus={(e) => e.target.select()}
          />
        )}
      </ModalContent>
      <div className="flex flex-row gap-2 justify-center">
        {!request.cid ? (
          <>
            {!uploadError && (
              <button
                onClick={handleUpload}
                className="button button--primary flex flex-row items-center justify-center gap-2 m-0"
                disabled={uploading}
              >
                {uploading && (
                  <Icon
                    className="animate-spin"
                    fa="fa-solid fa-spinner"
                    size={1}
                  />
                )}
                I understand
              </button>
            )}
            <button
              className="m-0 w-24 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 font-bold"
              onClick={onClose}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => copy(`${EXPLORER_API}/ipfs/${request.cid}`)}
              className="m-0 w-24 bg-slate-600 text-slate-200 hover:bg-slate-500 hover:text-slate-100 font-bold"
            >
              Copy
            </button>
            <button
              className="m-0 w-24 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 font-bold"
              onClick={onClose}
            >
              Close
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
