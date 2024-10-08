import React, { ReactElement, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router';
import { download, urlify } from '../../utils/misc';
import { useRequestHistory } from '../../reducers/history';
import { deleteRequestHistory } from '../../reducers/history';
import { getNotaryApi, getProxyApi } from '../../utils/storage';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { parseAttributeFromRequest } from '../../utils/misc';
import Modal, { ModalContent } from '../Modal/Modal';
import Error from '../SvgIcons/Error';
import { BadgeCheck } from 'lucide-react';
import { AttrAttestation } from '../../utils/types';
const charwise = require('charwise');

function formatDate(requestId: string) {
  const date = new Date(charwise.decode(requestId, 'hex'));
  const today = new Date();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return 'Today';
  }

  if (isYesterday) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAttestationDate(requestId: string, previousRequestId?: string) {
  const date = formatDate(requestId);
  const previousDate = previousRequestId ? formatDate(previousRequestId) : null;

  if (!previousDate) {
    return date;
  }

  if (date !== previousDate) {
    return date;
  }

  return '';
}

export function AttestationCard({
  requestId,
  previousRequestId,
  showDate,
}: {
  requestId: string;
  previousRequestId?: string;
  showDate: boolean;
}): ReactElement {
  const request = useRequestHistory(requestId);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const requestUrl = urlify(request?.url || '');
  const date = formatAttestationDate(requestId, previousRequestId);

  const { status } = request || {};

  const [showingError, showError] = useState(false);

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

  const onShowError = useCallback(async () => {
    showError(true);
  }, [request?.error, showError]);

  const closeAllModal = useCallback(() => {
    showError(false);
  }, [showingError, showError]);

  function ErrorModal(): ReactElement {
    const msg = typeof request?.error === 'string' && request?.error;
    return !showingError ? (
      <></>
    ) : (
      <Modal
        className="p-4 border border-[#E4E6EA] bg-white rounded-xl flex flex-col mx-6"
        onClose={closeAllModal}
      >
        <ModalContent className="flex flex-col">
          <div className="flex-1 font-bold text-[#4B5563] text-lg truncate">
            Error
          </div>
          <div className="text-[#9BA2AE] text-sm leading-5 font-bold mb-4">
            {msg || 'Something went wrong...'}
          </div>
        </ModalContent>
        <div
          onClick={closeAllModal}
          className="cursor-pointer self-center flex items-center ml-2 bg-[#F6E2E2] hover:bg-[#e4d2d2] text-[#B50E0E] text-sm font-medium py-[6px] px-2 rounded-lg"
        >
          Close
        </div>
      </Modal>
    );
  }

  const { attributes, signedSessionDecoded } = parseAttributeFromRequest(
    request?.proof as AttrAttestation,
  );

  return (
    <div className="flex flex-col">
      <ErrorModal />
      {showDate && date && (
        <div className="text-sm font-bold mb-2 leading-5">{date}</div>
      )}
      <div className="p-4 border border-[#E4E6EA] bg-white rounded-xl flex flex-col">
        <div className="flex flex-row items-center ">
          <div className="flex-1 font-bold text-[#4B5563] text-lg truncate">
            {requestUrl?.host}
          </div>
          {status === 'error' && !!request?.error && (
            <>
              <div
                onClick={onShowError}
                className="cursor-pointer flex items-center ml-2 bg-[#F6E2E2] hover:bg-[#e4d2d2] text-[#B50E0E] text-sm font-medium py-[6px] px-2 rounded-lg"
              >
                <Error />
                &nbsp;Error
              </div>
            </>
          )}
          {status !== 'success' && (
            <div
              onClick={() => {
                if (status === 'pending') return;
                onRetry();
              }}
              className="cursor-pointer ml-2 border border-[#E4E6EA] bg-white hover:bg-slate-100 text-[#092EEA] text-sm font-medium py-[6px] px-2 rounded-lg"
            >
              {status === 'pending' ? 'Pending' : 'Retry'}
            </div>
          )}
          {status === 'success' && (
            <div>
              <div className="inline-flex items-center px-2 py-1.5 rounded-full bg-[#e4f5e5]">
                <BadgeCheck className="w-5 h-5 mr-1 text-[#e4f5e5] fill-[#00b037]" />
                <span className="text-sm font-bold text-green-600">
                  Verified
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-[80px,1fr] gap-2 mt-4">
          {attributes?.map((attribute) => (
            <>
              <div className="text-[#9BA2AE] text-sm leading-5 font-semibold">
                {attribute}
              </div>
              <div className="text-[#4B5563] text-sm leading-5 truncate"></div>
            </>
          ))}
          {[
            {
              label: 'Time',
              value: new Date(charwise.decode(requestId, 'hex')).toISOString(),
            },
          ].map(({ label, value }) => (
            <>
              <div className="text-[#9BA2AE] text-sm leading-5">{label}</div>
              <div className="text-[#4B5563] text-sm leading-5 truncate">
                {value}
              </div>
            </>
          ))}

          {status === 'success' && (
            <div
              className="text-[#9BA2AE] text-sm leading-5 whitespace-nowrap hover:text-black cursor-pointer"
              onClick={() => {
                if (!showDate) {
                  navigate(`${location.pathname}/attestation/${requestId}`);
                  return;
                }
                navigate(
                  `/history/${requestUrl?.host}/attestation/${requestId}`,
                );
              }}
            >
              See details...
            </div>
          )}
        </div>

        <div className="flex mt-4">
          {status === 'success' && (
            <>
              <div
                onClick={() => {
                  if (!showDate) {
                    navigate(`${location.pathname}/attestation/${requestId}`);
                    return;
                  }
                  navigate(
                    `/history/${requestUrl?.host}/attestation/${requestId}`,
                  );
                }}
                className="cursor-pointer border border-[#E9EBF3] bg-[#F6F7FC] hover:bg-[#dfe0e5] text-[#092EEA] text-sm font-medium py-[10px] px-4 rounded-lg"
              >
                View
              </div>

              <div
                onClick={() => {
                  download(
                    `${request?.id}.json`,
                    JSON.stringify(request?.proof),
                  );
                }}
                className="ml-3 cursor-pointer border border-[#E9EBF3] bg-[#F6F7FC] hover:bg-[#e2e3e8] text-[#092EEA] text-sm font-medium py-[10px] px-4 rounded-lg"
              >
                Save
              </div>

              <div
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(request));
                }}
                className="ml-3 cursor-pointer border border-[#E9EBF3] bg-[#F6F7FC] hover:bg-[#e2e3e8] text-[#092EEA] text-sm font-medium py-[10px] px-4 rounded-lg"
              >
                Copy request
              </div>
            </>
          )}

          <div
            onClick={onDelete}
            className="ml-auto cursor-pointer border border-[#E4E6EA] bg-white hover:bg-slate-100 text-[#B50E0E] text-sm font-medium py-[10px] px-4 rounded-lg"
          >
            Delete
          </div>
        </div>
      </div>
    </div>
  );
}
