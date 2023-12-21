import React, { ReactElement, useCallback, useState } from 'react';
import { BackgroundActiontype, RequestLog } from '../../entries/Background/rpc';
import { useNavigate } from 'react-router';
import Fuse from 'fuse.js';
import Icon from '../Icon';
import { useDispatch } from 'react-redux';
import { setRequests } from '../../reducers/requests';

type Props = {
  requests: RequestLog[];
};

export default function RequestTable(props: Props): ReactElement {
  const { requests } = props;
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [query, setQuery] = useState('');

  const fuse = new Fuse(requests, {
    isCaseSensitive: true,
    minMatchCharLength: 2,
    shouldSort: true,
    findAllMatches: true,
    threshold: 0.2,
    includeMatches: true,
    ignoreLocation: true,
    keys: [
      { name: 'method', weight: 2 },
      { name: 'type', weight: 2 },
      { name: 'requestHeaders.name', weight: 1 },
      { name: 'requestHeaders.value', weight: 1 },
      { name: 'responseHeaders.name', weight: 1 },
      { name: 'responseHeaders.value', weight: 1 },
      { name: 'url', weight: 1 },
    ],
  });

  const result = query ? fuse.search(query) : null;
  const list = result ? result.map((r) => r.item) : requests;

  const reset = useCallback(async () => {
    await chrome.runtime.sendMessage({
      type: BackgroundActiontype.clear_requests,
    });
    dispatch(setRequests([]));
  }, [dispatch]);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <div className="flex flex-row flex-nowrap bg-slate-300 py-1 px-2 gap-2">
        <input
          className="input w-full"
          type="text"
          placeholder="Search..."
          onChange={(e) => setQuery(e.target.value)}
          value={query}
        ></input>
        <Icon
          className="text-slate-400"
          fa="fa-solid fa-trash"
          onClick={reset}
        />
      </div>
      <div className="flex-grow overflow-y-auto h-0">
        <table className="border border-slate-300 border-collapse table-fixed w-full">
          <thead className="bg-slate-200">
            <tr>
              <td className="border border-slate-300 py-1 px-2 w-2/12">
                Method
              </td>
              <td className="border border-slate-300 py-1 px-2 w-3/12">Type</td>
              <td className="border border-slate-300 py-1 px-2">Name</td>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              let url;

              try {
                url = new URL(r.url);
              } catch (e) {}

              return (
                <tr
                  key={r.requestId}
                  onClick={() => navigate('/requests/' + r.requestId)}
                  className="cursor-pointer hover:bg-slate-100"
                >
                  <td className="border border-slate-200 align-top py-1 px-2 whitespace-nowrap w-2/12">
                    {r.method}
                  </td>
                  <td className="border border-slate-200 align-top py-1 px-2 whitespace-nowrap w-3/12">
                    {r.type}
                  </td>
                  <td className="border border-slate-200 py-1 px-2 break-all truncate">
                    {url?.pathname}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
