import { replayRequest, urlify } from '../../utils/misc';
import { get, NOTARY_API_LS_KEY, PROXY_API_LS_KEY } from '../../utils/storage';
import { notarizeRequest, useRequests } from '../../reducers/requests';
import React, { ReactElement, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import classNames from 'classnames';

export type PluginParams = {
  method: string;
  url: string;
  targetUrl: string;
  type: string;
  title: string;
  description: string;
  responseSelector: string;
  valueTransform: string;
};

type Props = PluginParams & {
  className?: string;
  hideAction?: boolean;
  onClick?: () => void;
  onNotarize?: () => Promise<void>;
};

export default function PluginDisplayBox(props: Props): ReactElement {
  const {
    method,
    type,
    title,
    description,
    responseSelector,
    valueTransform,
    targetUrl,
    url,
    className = '',
    hideAction = false,
    onClick,
  } = props;

  const requests = useRequests();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const reqs = requests.filter((req) => {
    return req?.url?.includes(url);
  });

  const bmHost = urlify(targetUrl)?.host;
  const isReady = !!reqs.length;

  const onNotarize = useCallback(async () => {
    if (!isReady) return;

    const req = reqs[0];
    const res = await replayRequest(req);
    const secretHeaders = req.requestHeaders
      .map((h) => {
        return `${h.name.toLowerCase()}: ${h.value || ''}` || '';
      })
      .filter((d) => !!d);
    const selectedValue = res.match(new RegExp(responseSelector, 'g'));

    if (selectedValue) {
      const revealed = valueTransform.replace('%s', selectedValue[0]);
      const selectionStart = res.indexOf(revealed);
      const selectionEnd = selectionStart + revealed.length - 1;
      const secretResps = [
        res.substring(0, selectionStart),
        res.substring(selectionEnd, res.length),
      ].filter((d) => !!d);

      const hostname = urlify(req.url)?.hostname;
      const notaryUrl = await get(
        NOTARY_API_LS_KEY,
        'https://notary.pse.dev/v0.1.0-alpha.5',
      );
      const websocketProxyUrl = await get(
        PROXY_API_LS_KEY,
        'wss://notary.pse.dev/proxy',
      );

      const headers: { [k: string]: string } = req.requestHeaders.reduce(
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
  }, [
    isReady,
    reqs[0],
    method,
    type,
    title,
    description,
    responseSelector,
    valueTransform,
    targetUrl,
    url,
  ]);

  return (
    <div
      className={classNames('flex flex-col flex-nowrap p-2 gap-1', className)}
      onClick={onClick}
    >
      <div className="flex flex-row items-center text-xs">
        <div className="bg-slate-200 text-slate-400 px-1 py-0.5 rounded-sm">
          {method}
        </div>
        <div className="text-slate-400 px-2 py-1 rounded-md">{type}</div>
      </div>
      <div className="font-bold">{title}</div>
      <div className="italic">{description}</div>
      {isReady && !hideAction && (
        <button
          className="button button--primary w-fit self-end mt-2"
          onClick={props.onNotarize || onNotarize}
        >
          Notarize
        </button>
      )}
      {!isReady && !hideAction && (
        <button
          className="button w-fit self-end mt-2"
          onClick={() => chrome.tabs.update({ url: targetUrl })}
        >
          {`Go to ${bmHost}`}
        </button>
      )}
    </div>
  );
}
