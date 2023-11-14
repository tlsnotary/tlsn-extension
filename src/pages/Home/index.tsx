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
import {
  notarizeRequest,
  useActiveTabUrl,
  useRequests,
} from '../../reducers/requests';
import { Link } from 'react-router-dom';
import bookmarks from '../../../utils/bookmark/bookmarks.json';
import { replayRequest, urlify } from '../../utils/misc';
import { useDispatch } from 'react-redux';
import { get, NOTARY_API_LS_KEY, PROXY_API_LS_KEY } from '../../utils/storage';

export default function Home(): ReactElement {
  const requests = useRequests();
  const url = useActiveTabUrl();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  return (
    <div className="flex flex-col gap-4 py-4 overflow-y-auto">
      <div className="flex flex-col flex-nowrap justify-center gap-2 mx-4">
        <NavButton fa="fa-solid fa-table" onClick={() => navigate('/requests')}>
          <span>Requests</span>
          <span>{`(${requests.length})`}</span>
        </NavButton>
        <NavButton
          fa="fa-solid fa-magnifying-glass"
          onClick={() => navigate('/custom')}
        >
          Custom
        </NavButton>
        <NavButton
          fa="fa-solid fa-magnifying-glass"
          onClick={() => navigate('/verify')}
        >
          Verify
        </NavButton>
        <NavButton fa="fa-solid fa-list" onClick={() => navigate('/history')}>
          History
        </NavButton>
        <NavButton fa="fa-solid fa-gear" onClick={() => navigate('/options')}>
          Options
        </NavButton>
      </div>
      {!bookmarks.length && (
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
        {bookmarks.map((bm, i) => {
          try {
            const reqs = requests.filter((req) => {
              return req?.url?.includes(bm.url);
            });

            const bmHost = urlify(bm.targetUrl)?.host;
            const isReady = !!reqs.length;

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
                {isReady && (
                  <button
                    className="button button--primary w-fit self-end mt-2"
                    onClick={async () => {
                      if (!isReady) return;

                      const req = reqs[0];
                      const res = await replayRequest(req);
                      const secretHeaders = req.requestHeaders
                        .map((h) => {
                          return (
                            `${h.name.toLowerCase()}: ${h.value || ''}` || ''
                          );
                        })
                        .filter((d) => !!d);
                      const selectedValue = res.match(
                        new RegExp(bm.responseSelector, 'g'),
                      );

                      if (selectedValue) {
                        const revealed = bm.valueTransform.replace(
                          '%s',
                          selectedValue[0],
                        );
                        const selectionStart = res.indexOf(revealed);
                        const selectionEnd =
                          selectionStart + revealed.length - 1;
                        const secretResps = [
                          res.substring(0, selectionStart),
                          res.substring(selectionEnd, res.length),
                        ].filter((d) => !!d);

                        const hostname = urlify(req.url)?.hostname;
                        const notaryUrl = await get(NOTARY_API_LS_KEY);
                        const websocketProxyUrl = await get(PROXY_API_LS_KEY);

                        const headers: { [k: string]: string } =
                          req.requestHeaders.reduce(
                            (acc: any, h) => {
                              acc[h.name] = h.value;
                              return acc;
                            },
                            { Host: hostname },
                          );

                        //TODO: for some reason, these needs to be override to work
                        headers['Accept-Encoding'] = 'identity';
                        headers['Connection'] = 'close';

                        dispatch(
                          // @ts-ignore
                          notarizeRequest({
                            url: req.url,
                            method: req.method,
                            headers: headers,
                            body: req.requestBody,
                            maxTranscriptSize: 16384,
                            notaryUrl,
                            websocketProxyUrl,
                            secretHeaders,
                            secretResps,
                          }),
                        );

                        navigate(`/history`);
                      }
                    }}
                  >
                    Notarize
                  </button>
                )}
                {!isReady && (
                  <button
                    className="button w-fit self-end mt-2"
                    onClick={() => chrome.tabs.update({ url: bm.targetUrl })}
                  >
                    {`Go to ${bmHost}`}
                  </button>
                )}
              </div>
            );
          } catch (e) {
            return null;
          }
        })}
      </div>
    </div>
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
        'flex flex-row flex-nowrap items-center justify-center',
        'text-white rounded px-2 py-1 gap-1',
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
      <Icon className="flex-grow-0 flex-shrink-0" fa={props.fa} size={1} />
      <span className="flex-grow flex-shrink w-0 flex-grow font-bold">
        {props.children}
      </span>
    </button>
  );
}
