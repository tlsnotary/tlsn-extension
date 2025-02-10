import React, {
  ReactNode,
  ReactElement,
  useState,
  useEffect,
  MouseEventHandler,
  useCallback,
} from 'react';
import { useParams, useNavigate } from 'react-router';
import c from 'classnames';
import {
  deleteRequestHistory,
  useRequestHistory,
} from '../../reducers/history';
import Icon from '../../components/Icon';
import { convertNotaryWsToHttp, download } from '../../utils/misc';
import classNames from 'classnames';
import { useDispatch } from 'react-redux';

export default function ProofViewer(props?: {
  className?: string;
  recv?: string;
  sent?: string;
  verifierKey?: string;
  notaryKey?: string;
  info?: {
    meta: { notaryUrl: string; websocketProxyUrl: string };
    version: string;
  };
}): ReactElement {
  const dispatch = useDispatch();
  const { requestId } = useParams<{ requestId: string }>();
  const request = useRequestHistory(requestId);
  const navigate = useNavigate();
  const [tab, setTab] = useState('sent');

  const onDelete = useCallback(async () => {
    if (requestId) {
      dispatch(deleteRequestHistory(requestId));
      navigate(-1);
    }
  }, [requestId]);
  const [isPopup, setIsPopup] = useState(false);

  useEffect(() => {
    if (
      window.opener ||
      window.matchMedia('(display-mode: standalone)').matches
    ) {
      setIsPopup(true);
    }
  }, []);

  return (
    <div
      className={classNames(
        'flex flex-col w-full py-2 gap-2 flex-grow',
        props?.className,
      )}
    >
      <div className="flex flex-col px-2">
        <div className="flex flex-row gap-2 items-center">
          {!isPopup && (
            <Icon
              className={c(
                'px-1 select-none cursor-pointer',
                'text-slate-400 border-b-2 border-transparent hover:text-slate-500 active:text-slate-800',
              )}
              onClick={() => navigate(-1)}
              fa="fa-solid fa-xmark"
            />
          )}
          <TabLabel onClick={() => setTab('sent')} active={tab === 'sent'}>
            Sent
          </TabLabel>
          <TabLabel onClick={() => setTab('recv')} active={tab === 'recv'}>
            Recv
          </TabLabel>
          <TabLabel
            onClick={() => setTab('metadata')}
            active={tab === 'metadata'}
          >
            Metadata
          </TabLabel>
          <div className="flex flex-row flex-grow items-center justify-end">
            {!props?.recv && (
              <button
                className="button"
                onClick={() => {
                  if (!request) return;
                  download(request.id, JSON.stringify(request.proof));
                }}
              >
                Download
              </button>
            )}
            <button className="button !text-red-500" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col flex-grow px-2">
        {tab === 'sent' && (
          <textarea
            className="w-full resize-none bg-slate-100 text-slate-800 border p-2 text-[10px] break-all h-full outline-none font-mono"
            value={props?.sent || request?.verification?.sent}
            readOnly
          ></textarea>
        )}
        {tab === 'recv' && (
          <textarea
            className="w-full resize-none bg-slate-100 text-slate-800 border p-2 text-[10px] break-all h-full outline-none font-mono"
            value={props?.recv || request?.verification?.recv}
            readOnly
          ></textarea>
        )}
        {tab === 'metadata' && (
          <div className="w-full resize-none bg-slate-100 text-slate-800 border p-2 text-[10px] break-all h-full outline-none font-mono">
            <MetadataRow
              label="Version"
              //@ts-ignore
              value={props?.info?.version || request?.proof?.version}
            />
            <MetadataRow
              label="Notary URL"
              value={
                //@ts-ignore
                props?.info?.meta?.notaryUrl || convertNotaryWsToHttp(request?.proof?.meta?.notaryUrl)
              }
            />
            <MetadataRow
              label="Websocket Proxy URL"
              value={
                props?.info?.meta?.websocketProxyUrl ||
                //@ts-ignore
                request?.proof?.meta?.websocketProxyUrl
              }
            />
            <MetadataRow
              label="Verifying Key"
              value={props?.verifierKey || request?.verification?.verifierKey}
            />
            <MetadataRow
              label="Notary Key"
              value={props?.notaryKey || request?.verification?.notaryKey}
              />
          </div>
        )}
      </div>
    </div>
  );
}

function TabLabel(props: {
  children: ReactNode;
  onClick: MouseEventHandler;
  active?: boolean;
}): ReactElement {
  return (
    <button
      className={c('px-1 select-none cursor-pointer font-bold', {
        'text-slate-800 border-b-2 border-green-500': props.active,
        'text-slate-400 border-b-2 border-transparent hover:text-slate-500':
          !props.active,
      })}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <div>
      <div>{label}:</div>
      <div className="text-sm font-semibold whitespace-pre-wrap">
        {value || 'N/A'}
      </div>
    </div>
  );
}
