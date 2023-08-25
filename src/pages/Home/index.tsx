import React, {
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useCallback,
  useState,
} from 'react';
import Icon from '../../components/Icon';
import classNames from 'classnames';
import { useNavigate } from 'react-router';
import { useActiveTabUrl, useRequests } from '../../reducers/requests';
import { Link } from 'react-router-dom';
import { filterByBookmarks } from '../../../utils/bookmark';
import { BackgroundActiontype } from '../Background/actionTypes';

export default function Home(): ReactElement {
  const requests = useRequests();
  const url = useActiveTabUrl();
  const navigate = useNavigate();
  const suggestions = filterByBookmarks(requests);
  const [wasmRes, setWasmRes] = useState('');

  return (
    <>
      <div className="flex flex-row flex-nowrap justify-center gap-8 my-8">
        <NavButton fa="fa-solid fa-table" onClick={() => navigate('/requests')}>
          <div>Requests</div>
          <div>{`(${requests.length})`}</div>
        </NavButton>
        <NavButton
          fa="fa-solid fa-magnifying-glass"
          onClick={() => navigate('/verify')}
          disabled
        >
          Verify
        </NavButton>
        <NavButton fa="fa-solid fa-list" onClick={() => navigate('/history')}>
          History
        </NavButton>
      </div>
      <div className="flex flex-col flex-nowrap justify-center items-center gap-2 bg-slate-100 border border-slate-200 p-2 mb-4">
        <div className="text-sm text-slate-300">
          <b>Dev</b>
        </div>
        <div className="flex flex-row flex-nowrap justify-center">
          <button
            className="right-2 bg-primary/[0.9] text-white font-bold px-2 py-0.5 hover:bg-primary/[0.8] active:bg-primary"
            onClick={async () => {
              const res: any = await chrome.runtime.sendMessage<any, string>({
                type: BackgroundActiontype.test_wasm,
                target: 'offscreen',
              });
              console.log(res);
              setWasmRes(res.data);
            }}
          >
            Notarize
          </button>
        </div>
        {wasmRes && <div>{wasmRes}</div>}
      </div>
      {!suggestions.length && (
        <div className="flex flex-col flex-nowrap">
          <div className="flex flex-col items-center justify-center text-slate-300 cursor-default select-none">
            <div>No available notarization for {url?.hostname}</div>
            <div>
              Browse <Link to="/requests">Requests</Link>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col px-4 gap-4">
        {suggestions.map((bm, i) => {
          try {
            const reqs = requests.filter((req) => {
              return req?.url?.includes(bm.url);
            });

            return (
              <div
                key={i}
                className="flex flex-col flex-nowrap border rounded-md p-2 gap-1 hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex flex-row items-center text-xs">
                  <div className="bg-slate-200 text-slate-400 px-1 py-0.5 rounded-sm">
                    {bm.method}
                  </div>
                  <div className="text-slate-400 px-2 py-1 rounded-md">
                    {bm.type}
                  </div>
                </div>
                <div className="font-bold">{bm.title}</div>
                <div className="italic">{bm.description}</div>
                <div className="text-slate-300">
                  Found {reqs.length} request
                </div>
                {reqs.map((r) => (
                  <Link
                    to={`/requests/${r.requestId}`}
                    className="break-all text-slate-500 truncate"
                  >
                    {r.url}
                  </Link>
                ))}
              </div>
            );
          } catch (e) {
            return null;
          }
        })}
      </div>
    </>
  );
}

function NavButton(props: {
  fa: string;
  children?: ReactNode;
  onClick?: MouseEventHandler;
  className?: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      className={classNames(
        'flex flex-col flex-nowrap items-center justify-center',
        'text-white rounded-full p-4 h-24 w-24 gap-1',
        {
          'bg-primary/[.8] hover:bg-primary/[.7] active:bg-primary':
            !props.disabled,
          'bg-primary/[.5]': props.disabled,
        },
        props.className,
      )}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <Icon className="flex-grow flex-shrink h-0" fa={props.fa} size={1.5} />
      <span className="flex-grow flex-shrink h-0 flex-grow text-[11px] font-bold">
        {props.children}
      </span>
    </button>
  );
}
