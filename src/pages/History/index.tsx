import React, { ReactElement, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import {
  useHistoryOrder,
  useRequestHistory,
  deleteRequestHistory,
} from '../../reducers/history';
import Icon from '../../components/Icon';
import {
  get,
  NOTARY_API_LS_KEY,
  PROXY_API_LS_KEY,
  getNotaryApi,
  getProxyApi,
} from '../../utils/storage';
import { urlify, download, upload } from '../../utils/misc';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import Modal, { ModalContent } from '../../components/Modal/Modal';
import classNames from 'classnames';
import copy from 'copy-to-clipboard';
import { EXPLORER_API } from '../../utils/constants';

export default function History(): ReactElement {
  const history = useHistoryOrder();

  return (
    <div className="flex flex-col flex-nowrap overflow-y-auto">
      {history.map((id) => {
        return <OneRequestHistory key={id} requestId={id} />;
      })}
    </div>
  );
}

function OneRequestHistory(props: { requestId: string }): ReactElement {
  const dispatch = useDispatch();
  const request = useRequestHistory(props.requestId);
  const [showingError, showError] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showingShareConfirmation, setShowingShareConfirmation] =
    useState(false);
  const [cid, setCid] = useState('');
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();
  const { status } = request || {};
  const requestUrl = urlify(request?.url || '');

  const onRetry = useCallback(async () => {
    const notaryUrl = await getNotaryApi();
    const websocketProxyUrl = await getProxyApi();
    chrome.runtime.sendMessage<any, string>({
      type: BackgroundActiontype.retry_prove_request,
      data: {
        id: props.requestId,
        notaryUrl,
        websocketProxyUrl,
      },
    });
  }, [props.requestId]);

  const onView = useCallback(() => {
    chrome.runtime.sendMessage<any, string>({
      type: BackgroundActiontype.verify_prove_request,
      data: request,
    });
    navigate('/verify/' + request?.id);
  }, [request]);

  const onDelete = useCallback(async () => {
    dispatch(deleteRequestHistory(props.requestId));
  }, [props.requestId]);

  const onShowError = useCallback(async () => {
    showError(true);
  }, [request?.error, showError]);

  const closeAllModal = useCallback(() => {
    setShowingShareConfirmation(false);
    showError(false);
  }, [setShowingShareConfirmation, showError]);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    try {
      const data = await upload(
        `${request?.id}.json`,
        JSON.stringify(request?.proof),
      );
      setCid(data);
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }, []);

  return (
    <div className="flex flex-row flex-nowrap border rounded-md p-2 gap-1 hover:bg-slate-50 cursor-pointer">
      <ShareConfirmationModal />
      <ErrorModal />
      <div className="flex flex-col flex-nowrap flex-grow flex-shrink w-0">
        <div className="flex flex-row items-center text-xs">
          <div className="bg-slate-200 text-slate-400 px-1 py-0.5 rounded-sm">
            {request?.method}
          </div>
          <div className="text-black font-bold px-2 py-1 rounded-md overflow-hidden text-ellipsis">
            {requestUrl?.pathname}
          </div>
        </div>
        <div className="flex flex-row">
          <div className="font-bold text-slate-400">Host:</div>
          <div className="ml-2 text-slate-800">{requestUrl?.host}</div>
        </div>
        <div className="flex flex-row">
          <div className="font-bold text-slate-400">Notary API:</div>
          <div className="ml-2 text-slate-800">{request?.notaryUrl}</div>
        </div>
        <div className="flex flex-row">
          <div className="font-bold text-slate-400">TLS Proxy API: </div>
          <div className="ml-2 text-slate-800">
            {request?.websocketProxyUrl}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {status === 'success' && (
          <>
            <ActionButton
              className="bg-slate-600 text-slate-200 hover:bg-slate-500 hover:text-slate-100"
              onClick={onView}
              fa="fa-solid fa-receipt"
              ctaText="View Proof"
            />
            <ActionButton
              className="bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500"
              onClick={() =>
                download(`${request?.id}.json`, JSON.stringify(request?.proof))
              }
              fa="fa-solid fa-download"
              ctaText="Download"
            />
            <ActionButton
              className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500 hover:font-bold"
              onClick={() => setShowingShareConfirmation(true)}
              fa="fa-solid fa-upload"
              ctaText="Share"
            />
          </>
        )}
        {status === 'error' && !!request?.error && <ErrorButton />}
        {(!status || status === 'error') && <RetryButton />}
        {status === 'pending' && (
          <button className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-slate-100 text-slate-300 font-bold">
            <Icon className="animate-spin" fa="fa-solid fa-spinner" size={1} />
            <span className="text-xs font-bold">Pending</span>
          </button>
        )}
        <button
          className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-slate-100 text-slate-300 hover:bg-red-100 hover:text-red-500 hover:font-bold"
          onClick={onDelete}
        >
          <Icon className="" fa="fa-solid fa-trash" size={1} />
          <span className="text-xs font-bold">Delete</span>
        </button>
      </div>
    </div>
  );

  function RetryButton(): ReactElement {
    return (
      <button
        className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500 hover:font-bold"
        onClick={onRetry}
      >
        <Icon fa="fa-solid fa-arrows-rotate" size={1} />
        <span className="text-xs font-bold">Retry</span>
      </button>
    );
  }

  function ErrorButton(): ReactElement {
    return (
      <button
        className="flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 bg-red-100 text-red-300 hover:bg-red-200 hover:text-red-500 hover:font-bold"
        onClick={onShowError}
      >
        <Icon fa="fa-solid fa-circle-exclamation" size={1} />
        <span className="text-xs font-bold">Error</span>
      </button>
    );
  }

  function ErrorModal(): ReactElement {
    return !showingError ? (
      <></>
    ) : (
      <Modal
        className="flex flex-col gap-4 items-center text-base cursor-default justify-center !w-auto mx-4 my-[50%] min-h-24 p-4 border border-red-500"
        onClose={closeAllModal}
      >
        <ModalContent className="flex justify-center items-center text-slate-500">
          {request?.error || 'Something went wrong :('}
        </ModalContent>
        <button
          className="m-0 w-24 bg-red-100 text-red-300 hover:bg-red-200 hover:text-red-500"
          onClick={closeAllModal}
        >
          OK
        </button>
      </Modal>
    );
  }

  function ShareConfirmationModal(): ReactElement {
    return !showingShareConfirmation ? (
      <></>
    ) : (
      <Modal
        className="flex flex-col items-center text-base cursor-default justify-center !w-auto mx-4 my-[50%] p-4 gap-4"
        onClose={closeAllModal}
      >
        <ModalContent className="flex flex-col w-full gap-4 items-center text-base justify-center">
          {!cid ? (
            <p className="text-slate-500 text-center">
              {uploadError ||
                'This will make your proof publicly accessible by anyone with the CID'}
            </p>
          ) : (
            <input
              className="input w-full bg-slate-100 border border-slate-200"
              readOnly
              value={`${EXPLORER_API}/ipfs/${cid}`}
              onFocus={(e) => e.target.select()}
            />
          )}
        </ModalContent>
        <div className="flex flex-row gap-2 justify-center">
          {!cid ? (
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
                onClick={closeAllModal}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => copy(`${EXPLORER_API}/ipfs/${cid}`)}
                className="m-0 w-24 bg-slate-600 text-slate-200 hover:bg-slate-500 hover:text-slate-100 font-bold"
              >
                Copy
              </button>
              <button
                className="m-0 w-24 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 font-bold"
                onClick={closeAllModal}
              >
                Close
              </button>
            </>
          )}
        </div>
      </Modal>
    );
  }
}

function ActionButton(props: {
  onClick: () => void;
  fa: string;
  ctaText: string;
  className?: string;
}): ReactElement {
  return (
    <button
      className={classNames(
        'flex flex-row flex-grow-0 gap-2 self-end items-center justify-end px-2 py-1 hover:font-bold',
        props.className,
      )}
      onClick={props.onClick}
    >
      <Icon className="" fa={props.fa} size={1} />
      <span className="text-xs font-bold">{props.ctaText}</span>
    </button>
  );
}
