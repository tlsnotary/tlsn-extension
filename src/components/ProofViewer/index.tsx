import React, {
  ReactNode,
  ReactElement,
  useState,
  MouseEventHandler,
} from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import c from 'classnames';
import { useRequestHistory } from '../../reducers/history';
import Icon from '../../components/Icon';
import { download } from '../../utils/misc';

export default function ProofViewer(props?: {
  recv?: string;
  sent?: string;
}): ReactElement {
  const { requestId } = useParams<{ requestId: string }>();
  const request = useRequestHistory(requestId);
  const navigate = useNavigate();
  const [tab, setTab] = useState('sent');

  return (
    <div className="flex flex-col w-full py-2 gap-2 flex-grow">
      <div className="flex flex-col px-2">
        <div className="flex flex-row gap-2 items-center">
          <Icon
            className={c(
              'px-1 select-none cursor-pointer',
              'text-slate-400 border-b-2 border-transparent hover:text-slate-500 active:text-slate-800',
            )}
            onClick={() => navigate(-1)}
            fa="fa-solid fa-xmark"
          />
          <TabLabel onClick={() => setTab('sent')} active={tab === 'sent'}>
            Sent
          </TabLabel>
          <TabLabel onClick={() => setTab('recv')} active={tab === 'recv'}>
            Recv
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
          </div>
        </div>
      </div>
      <div className="flex flex-col flex-grow px-2">
        {tab === 'sent' && (
          <textarea
            className="w-full resize-none bg-slate-100 text-slate-800 border p-2 text-[10px] break-all h-full outline-none font-mono"
            value={props?.sent || request?.verification?.sent}
          ></textarea>
        )}
        {tab === 'recv' && (
          <textarea
            className="w-full resize-none bg-slate-100 text-slate-800 border p-2 text-[10px] break-all h-full outline-none font-mono"
            value={props?.recv || request?.verification?.recv}
          ></textarea>
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
