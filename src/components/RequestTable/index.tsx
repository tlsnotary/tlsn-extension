import React, { ReactElement, useCallback, useState } from 'react';
import { BackgroundActiontype, RequestLog } from '../../entries/Background/rpc';
import { useNavigate } from 'react-router';
import Fuse from 'fuse.js';
import Icon from '../Icon';
import { useDispatch } from 'react-redux';
import { setRequests } from '../../reducers/requests';
import { reqTypeToName } from '../../utils/misc';

type Props = {
  requests: RequestLog[];
};

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Input,
} from '../../components/Table/table';

export function RequestTable2({
  requests,
}: {
  requests: RequestLog[];
}): ReactElement {
  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <div className="space-y-2">
        <label htmlFor="search" className="text-sm font-medium text-gray-700">
          Search
        </label>
      </div>
    </div>
  );
}

export default function RequestTable(props: Props): ReactElement {
  const { requests } = props;
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [query, setQuery] = useState('');

  const filteredRequests = requests.filter(
    (request) => request.method !== 'stylesheet',
  );

  const fuse = new Fuse(requests, {
    isCaseSensitive: false,
    minMatchCharLength: 2,
    shouldSort: true,
    findAllMatches: true,
    threshold: 0.5,
    includeMatches: true,
    ignoreLocation: true,
    keys: [
      { name: 'method', weight: 1 },
      { name: 'type', weight: 1 },
      { name: 'requestHeaders.name', weight: 1 },
      { name: 'requestHeaders.value', weight: 1 },
      { name: 'responseHeaders.name', weight: 1 },
      { name: 'responseHeaders.value', weight: 1 },
      { name: 'url', weight: 3 },
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
        <Icon
          className="text-slate-400"
          fa="fa-solid fa-trash"
          onClick={reset}
        />
      </div>
      <div className="space-y-2">
        <Input
          id="search"
          placeholder="Search..."
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-grow overflow-y-auto h-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>

              <TableHead>Domain</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row, index) => {
              let url: URL | undefined;
              try {
                url = new URL(row.url);
              } catch (e) {}

              return (
                <TableRow
                  key={index}
                  onClick={() => navigate('/requests/' + row.requestId)}
                  className="cursor-pointer hover:bg-slate-100"
                >
                  <TableCell className="text-xs">
                    {row.method} | {reqTypeToName(row.type)}
                  </TableCell>

                  <TableCell className="text-xs">{url?.host}</TableCell>
                  <TableCell className="text-xs">{url?.pathname}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
