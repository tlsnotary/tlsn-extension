import React, { ReactElement, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { useHistoryOrder, useRequestHistory } from '../../reducers/history';
import Icon from '../../components/Icon';
import NotarizeIcon from '../../assets/img/notarize.png';
import { getNotaryApi, getProxyApi } from '../../utils/storage';
import { urlify } from '../../utils/misc';
import {
  BackgroundActiontype,
  progressText,
} from '../../entries/Background/rpc';
import Modal, { ModalContent } from '../../components/Modal/Modal';
import classNames from 'classnames';
import dayjs from 'dayjs';
import RequestMenu from './request-menu';
const charwise = require('charwise');

export default function History(): ReactElement {
  const history = useHistoryOrder();

  return (
    <div className="flex flex-col flex-nowrap overflow-y-auto pb-36">
      {history
        .map((id) => {
          return <OneRequestHistory key={id} requestId={id} />;
        })
        .reverse()}
    </div>
  );
}

export function OneRequestHistory(props: {
  requestId: string;
  className?: string;
  hideActions?: string[];
}): ReactElement {
  const { hideActions = [] } = props;
  const dispatch = useDispatch();
  const request = useRequestHistory(props.requestId);
  const [showingError, showError] = useState(false);
  const [showingMenu, showMenu] = useState(false);
  const navigate = useNavigate();
  const { status } = request || {};
  const requestUrl = urlify(request?.url || '');

  const onView = useCallback(() => {
    chrome.runtime.sendMessage<any, string>({
      type: BackgroundActiontype.verify_prove_request,
      data: request,
    });
    navigate('/verify/' + request?.id);
  }, [request]);

  const onShowError = useCallback(async () => {
    showError(true);
  }, [request?.error, showError]);

  const closeAllModal = useCallback(() => {
    showError(false);
  }, [showError]);

  const day = dayjs(charwise.decode(props.requestId, 'hex'));

  return (
    <div
      className={classNames(
        'flex flex-row items-center flex-nowrap border rounded-md px-2.5 py-3 gap-0.5 hover:bg-slate-50 cursor-pointer relative',
        {
          '!cursor-default !bg-slate-200': status === 'pending',
        },
        props.className,
      )}
      onClick={() => {
        if (status === 'success') onView();
        if (status === 'error') onShowError();
      }}
    >
      <ErrorModal />
      <div className="w-12 h-12 rounded-full flex flex-row items-center justify-center bg-slate-300">
        <img
          className="relative w-7 h-7 top-[-1px] opacity-60"
          src={NotarizeIcon}
        />
      </div>
      <div className="flex flex-col flex-nowrap flex-grow flex-shrink w-0 gap-1">
        <div className="flex flex-row text-black text-sm font-semibold px-2 rounded-md overflow-hidden text-ellipsis gap-1">
          <span>Notarize request</span>
          <span className="font-normal border-b border-dashed border-slate-400 text-slate-500">
            {requestUrl?.hostname}
          </span>
        </div>
        <div
          className={classNames('font-semibold px-2 rounded-sm w-fit', {
            'text-green-600': status === 'success',
            'text-red-600': status === 'error',
          })}
        >
          {status === 'success' && 'Success'}
          {status === 'error' && 'Error'}
          {status === 'pending' && (
            <div className="text-center flex flex-row flex-grow-0 gap-2 self-end items-center justify-center text-slate-600">
              <Icon
                className="animate-spin"
                fa="fa-solid fa-spinner"
                size={1}
              />
              <span className="">
                {request?.progress === 6
                  ? `${progressText(request.progress, request.errorMessage)}`
                  : request?.progress
                    ? `(${(
                        ((request.progress + 1) / 6.06) *
                        100
                      ).toFixed()}%) ${progressText(request.progress)}`
                    : 'Pending...'}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="h-4">
          {!hideActions.length && (
            <Icon
              className="text-slate-500 hover:text-slate-600 relative"
              fa="fa-solid fa-ellipsis"
              onClick={(e) => {
                e.stopPropagation();
                showMenu(true);
              }}
            >
              {showingMenu && (
                <RequestMenu requestId={props.requestId} showMenu={showMenu} />
              )}
            </Icon>
          )}
        </div>
        <div className="text-slate-500" title={day.format('LLLL')}>
          {day.fromNow()}
        </div>
      </div>
    </div>
  );

  function ErrorModal(): ReactElement {
    const msg = typeof request?.error === 'string' && request?.error;
    return !showingError ? (
      <></>
    ) : (
      <Modal
        className="flex flex-col gap-4 items-center text-base cursor-default justify-center !w-auto mx-4 my-[50%] min-h-24 p-4 border border-red-500"
        onClose={closeAllModal}
      >
        <ModalContent className="flex justify-center items-center text-slate-500">
          {msg || 'Something went wrong :('}
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
}
