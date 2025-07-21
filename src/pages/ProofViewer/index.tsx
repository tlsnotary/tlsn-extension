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
import {
  convertNotaryWsToHttp,
  download,
  isPopupWindow,
} from '../../utils/misc';
import classNames from 'classnames';
import { useDispatch } from 'react-redux';
import { RemoveHistory } from '../History/request-menu';
import { PresentationJSON } from 'tlsn-js/build/types';
import { RequestHistory } from '../../entries/Background/rpc';

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
  const [isPopup, setIsPopup] = useState(isPopupWindow());
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const onDelete = useCallback(async () => {
    if (requestId) {
      dispatch(deleteRequestHistory(requestId));
      if (isPopup) window.close();
      navigate(-1);
    }
  }, [requestId]);

  const notaryUrl = extractFromProps('notaryUrl', props, request);
  const websocketProxyUrl = extractFromProps(
    'websocketProxyUrl',
    props,
    request,
  );

  return (
    <div
      className={classNames(
        'flex flex-col w-full py-2 gap-2 flex-grow',
        props?.className,
      )}
    >
      <RemoveHistory
        onRemove={onDelete}
        showRemovalModal={showRemoveModal}
        setShowRemoveModal={setShowRemoveModal}
        onCancel={() => setShowRemoveModal(false)}
      />
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
            <button
              className="button !text-red-500"
              onClick={() => setShowRemoveModal(true)}
            >
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
            <MetadataRow label="Notary URL" value={notaryUrl} />
            <MetadataRow
              label="Websocket Proxy URL"
              value={websocketProxyUrl}
            />
            <MetadataRow
              label="Verifying Key"
              value={props?.verifierKey || request?.verification?.verifierKey}
            />
            <MetadataRow
              label="Notary Key"
              value={props?.notaryKey || request?.verification?.notaryKey}
            />

            {request?.metadata &&
              Object.entries(request.metadata).map(([key, value]) => (
                <MetadataRow
                  key={`req-${key}`}
                  label={`Custom: ${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}`}
                  value={String(value)}
                />
              ))}
            {(request?.proof as any)?.metadata &&
              Object.entries((request?.proof as any).metadata).map(
                ([key, value]) => (
                  <MetadataRow
                    key={`proof-${key}`}
                    label={`Proof: ${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}`}
                    value={String(value)}
                  />
                ),
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function extractFromProps(
  key: 'notaryUrl' | 'websocketProxyUrl',
  props?: {
    className?: string;
    recv?: string;
    sent?: string;
    verifierKey?: string;
    notaryKey?: string;
    info?: {
      meta: { notaryUrl: string; websocketProxyUrl: string };
      version: string;
    };
  },
  request?: RequestHistory,
) {
  let value;

  if (props?.info?.meta) {
    value = props.info.meta[key];
  } else if (request && (request?.proof as PresentationJSON)?.meta) {
    value = (request.proof as PresentationJSON).meta[key];
  } else {
    value = '';
  }

  return value;
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
