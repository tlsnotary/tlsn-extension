import React, {
  ChangeEvent,
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
import {
  makePlugin,
  replayRequest,
  urlify,
  getPluginConfig,
} from '../../utils/misc';
import { useDispatch } from 'react-redux';
import {
  getMaxRecv,
  getMaxSent,
  getNotaryApi,
  getProxyApi,
} from '../../utils/storage';
import createPlugin, { CallContext } from '@extism/extism';
import { addPlugin, getCookiesByHost, getHeadersByHost } from '../../utils/rpc';
import { PluginList } from '../../components/PluginList';
import Modal, { ModalContent } from '../../components/Modal/Modal';
import { ErrorModal } from '../../components/ErrorModal';

export default function Home(): ReactElement {
  const requests = useRequests();
  const url = useActiveTabUrl();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, showError] = useState('');

  const onAddPlugin = useCallback(
    async (evt: ChangeEvent<HTMLInputElement>) => {
      if (!evt.target.files) return;
      try {
        const [file] = evt.target.files;
        const arrayBuffer = await file.arrayBuffer();
        const plugin = await makePlugin(arrayBuffer);
        await getPluginConfig(plugin);
        await addPlugin(Buffer.from(arrayBuffer).toString('hex'));
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    },
    [],
  );

  const plugin = useCallback(async () => {
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async function (tabs) {
        const { url, id } = tabs[0] || {};

        if (url) {
          const { hostname } = urlify(url) || {};
          if (hostname) {
            const cookies = await getCookiesByHost(hostname);
            const headers = await getHeadersByHost(hostname);
            console.log(hostname, cookies, headers);
          }
        }

        // if (tabs.length > 0) {
        //   const tabId = tabs[0].id;
        //   chrome.sidePanel.open({ tabId });
        //   setTimeout(() => {
        //     chrome.sidePanel.close({ tabId });
        //   }, 1000);
        // }
      },
    );
    const notaryUrl = await get(
      NOTARY_API_LS_KEY,
      'https://notary.pse.dev/v0.1.0-alpha.5',
    );

    const websocketProxyUrl = await get(
      PROXY_API_LS_KEY,
      'wss://notary.pse.dev/proxy',
    );

    const config = {
      notaryUrl,
      websocketProxyUrl,
    };

    const p = await createPlugin(
      'http://localhost:61853/twitter_profile/index.wasm',
      {
        useWasi: true,
        config,
        functions: {
          'extism:host/user': {
            get_response: (context: CallContext, off: bigint) => {
              const r = context.read(off);
              const param = r.text();
              const proverConfig = JSON.parse(param);
              console.log('proving...', proverConfig);
              dispatch(
                // @ts-ignore
                notarizeRequest(proverConfig),
              );
              return context.store('yo');
            },
            has_request_uri: (context: CallContext, off: bigint) => {
              const r = context.read(off);
              const requestUri = r.text();
              const req = requests.filter((req) =>
                req.url.includes(requestUri),
              )[0];
              return context.store(req ? JSON.stringify(req) : 'undefined');
            },
          },
        },
      },
    );
    // const out = await p.call('plugin');
    // console.log(out.string());
  }, [requests, dispatch]);

  return (
    <div className="flex flex-col gap-4 py-4 overflow-y-auto">
      {error && <ErrorModal onClose={() => showError('')} message={error} />}
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
        <NavButton className="relative" fa="fa-solid fa-plus">
          <input
            className="opacity-0 absolute top-0 right-0 h-full w-full"
            type="file"
            onChange={onAddPlugin}
          />
          Add a plugin
        </NavButton>
        <NavButton fa="fa-solid fa-gear" onClick={() => navigate('/options')}>
          Options
        </NavButton>
      </div>
      <PluginList className="mx-4" />
      {/*<div className="flex flex-col px-4 gap-4">*/}
      {/*  <h1>Plugins</h1>*/}
      {/*  <button className="button" onClick={plugin}>*/}
      {/*    Test Plugin*/}
      {/*  </button>*/}
      {/*</div>*/}
      {/*<div className="flex flex-col px-4 gap-4">*/}
      {/*  {bookmarks.map((bm, i) => {*/}
      {/*    try {*/}
      {/*      const reqs = requests.filter((req) => {*/}
      {/*        return req?.url?.includes(bm.url);*/}
      {/*      });*/}

      {/*      const bmHost = urlify(bm.targetUrl)?.host;*/}
      {/*      const isReady = !!reqs.length;*/}

      {/*      return (*/}
      {/*        <div*/}
      {/*          key={i}*/}
      {/*          className="flex flex-col flex-nowrap border rounded-md p-2 gap-1 hover:bg-slate-50 cursor-pointer"*/}
      {/*        >*/}
      {/*          <div className="flex flex-row items-center text-xs">*/}
      {/*            <div className="bg-slate-200 text-slate-400 px-1 py-0.5 rounded-sm">*/}
      {/*              {bm.method}*/}
      {/*            </div>*/}
      {/*            <div className="text-slate-400 px-2 py-1 rounded-md">*/}
      {/*              {bm.type}*/}
      {/*            </div>*/}
      {/*          </div>*/}
      {/*          <div className="font-bold">{bm.title}</div>*/}
      {/*          <div className="italic">{bm.description}</div>*/}
      {/*          {isReady && (*/}
      {/*            <button*/}
      {/*              className="button button--primary w-fit self-end mt-2"*/}
      {/*              onClick={async () => {*/}
      {/*                if (!isReady) return;*/}

      {/*                const req = reqs[0];*/}
      {/*                const res = await replayRequest(req);*/}
      {/*                const secretHeaders = req.requestHeaders*/}
      {/*                  .map((h) => {*/}
      {/*                    return (*/}
      {/*                      `${h.name.toLowerCase()}: ${h.value || ''}` || ''*/}
      {/*                    );*/}
      {/*                  })*/}
      {/*                  .filter((d) => !!d);*/}
      {/*                const selectedValue = res.match(*/}
      {/*                  new RegExp(bm.responseSelector, 'g'),*/}
      {/*                );*/}

      {/*                if (selectedValue) {*/}
      {/*                  const revealed = bm.valueTransform.replace(*/}
      {/*                    '%s',*/}
      {/*                    selectedValue[0],*/}
      {/*                  );*/}
      {/*                  const selectionStart = res.indexOf(revealed);*/}
      {/*                  const selectionEnd =*/}
      {/*                    selectionStart + revealed.length - 1;*/}
      {/*                  const secretResps = [*/}
      {/*                    res.substring(0, selectionStart),*/}
      {/*                    res.substring(selectionEnd, res.length),*/}
      {/*                  ].filter((d) => !!d);*/}

      {/*                  const hostname = urlify(req.url)?.hostname;*/}
      {/*                  const notaryUrl = await get(NOTARY_API_LS_KEY);*/}
      {/*                  const websocketProxyUrl = await get(PROXY_API_LS_KEY);*/}

      {/*                  const headers: { [k: string]: string } =*/}
      {/*                    req.requestHeaders?.reduce(*/}
      {/*                      (acc: any, h) => {*/}
      {/*                        acc[h.name] = h.value;*/}
      {/*                        return acc;*/}
      {/*                      },*/}
      {/*                      { Host: hostname },*/}
      {/*                    );*/}

      {/*                  //TODO: for some reason, these needs to be override to work*/}
      {/*                  headers['Accept-Encoding'] = 'identity';*/}
      {/*                  headers['Connection'] = 'close';*/}
      {/*                  dispatch(*/}
      {/*                    // @ts-ignore*/}
      {/*                    notarizeRequest({*/}
      {/*                      url: req.url,*/}
      {/*                      method: req.method,*/}
      {/*                      headers: headers,*/}
      {/*                      body: req.requestBody,*/}
      {/*                      maxTranscriptSize: 16384,*/}
      {/*                      notaryUrl,*/}
      {/*                      websocketProxyUrl,*/}
      {/*                      secretHeaders,*/}
      {/*                      secretResps,*/}
      {/*                    }),*/}
      {/*                  );*/}

      {/*                  navigate(`/history`);*/}
      {/*                }*/}
      {/*              }}*/}
      {/*            >*/}
      {/*              Notarize*/}
      {/*            </button>*/}
      {/*          )}*/}
      {/*          {!isReady && (*/}
      {/*            <button*/}
      {/*              className="button w-fit self-end mt-2"*/}
      {/*              onClick={() => chrome.tabs.update({ url: bm.targetUrl })}*/}
      {/*            >*/}
      {/*              {`Go to ${bmHost}`}*/}
      {/*            </button>*/}
      {/*          )}*/}
      {/*        </div>*/}
      {/*      );*/}
      {/*    } catch (e) {*/}
      {/*      return null;*/}
      {/*    }*/}
      {/*  })}*/}
      {/*</div>*/}
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
