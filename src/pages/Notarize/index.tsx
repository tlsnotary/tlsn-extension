import classNames from 'classnames';
import React, {
  ReactNode,
  ReactElement,
  useState,
  useCallback,
  ReactEventHandler,
  useEffect,
  useRef,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { notarizeRequest, useRequest } from '../../reducers/requests';
import Icon from '../../components/Icon';
import { urlify } from '../../utils/misc';
import { get, NOTARY_API_LS_KEY, PROXY_API_LS_KEY } from '../../utils/storage';
import { useDispatch } from 'react-redux';

const maxTranscriptSize = 16384;

export default function Notarize(): ReactElement {
  const params = useParams<{ requestId: string }>();
  const req = useRequest(params.requestId);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [step, setStep] = useState(0);
  const [secretHeaders, setSecretHeaders] = useState<string[]>([]);
  const [secretResps, setSecretResps] = useState<string[]>([]);

  const notarize = useCallback(async () => {
    if (!req) return;
    const hostname = urlify(req.url)?.hostname;
    const notaryUrl = await get(NOTARY_API_LS_KEY);
    const websocketProxyUrl = await get(PROXY_API_LS_KEY);

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
        headers,
        body: req.requestBody,
        maxTranscriptSize,
        notaryUrl,
        websocketProxyUrl,
        secretHeaders,
        secretResps,
      }),
    );
    navigate(`/history`);
  }, [req, secretHeaders, secretResps]);

  if (!req) return <></>;

  let body;

  switch (step) {
    case 0:
      body = (
        <RevealHeaderStep
          onNext={() => setStep(1)}
          onCancel={() => navigate(-1)}
          setSecretHeaders={setSecretHeaders}
        />
      );
      break;
    case 1:
      body = (
        <HideResponseStep
          onNext={notarize}
          onCancel={() => setStep(0)}
          setSecretResps={setSecretResps}
        />
      );
      break;
    default:
      body = null;
      break;
  }

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <div className="flex flex-row flex-nowrap relative items-center bg-slate-300 py-2 px-2 gap-2">
        <Icon
          className="cursor-point text-slate-400 hover:text-slate-700"
          fa="fa-solid fa-xmark"
          onClick={() => navigate(-1)}
        />
        <div className="flex flex-col flex-shrink flex-grow mr-20 w-0 select-none">
          <span className="font-bold text-slate-700">
            {`Notarizing a ${req.method} request`}
          </span>
          <span
            className="text-ellipsis whitespace-nowrap overflow-hidden"
            title={req.url}
          >
            {req.url}
          </span>
        </div>
      </div>
      {body}
    </div>
  );
}

function RevealHeaderStep(props: {
  onNext: () => void;
  onCancel: () => void;
  setSecretHeaders: (secrets: string[]) => void;
}): ReactElement {
  const params = useParams<{ requestId: string }>();
  const req = useRequest(params.requestId);
  const [revealed, setRevealed] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!req) return;

    props.setSecretHeaders(
      req.requestHeaders
        .map((h) => {
          console.log(h.name, !revealed[h.name]);
          if (!revealed[h.name]) {
            return `${h.name.toLowerCase()}: ${h.value || ''}` || '';
          }
          return '';
        })
        .filter((d) => !!d),
    );
  }, [revealed]);

  const changeHeaderKey = useCallback(
    (key: string, shouldReveal: boolean) => {
      if (!req) return;

      setRevealed({
        ...revealed,
        [key]: shouldReveal,
      });
    },
    [revealed, req],
  );

  if (!req) return <></>;

  return (
    <div className="flex flex-col flex-nowrap flex-shrink flex-grow h-0">
      <div className="border bg-primary/[0.9] text-white border-slate-300 py-1 px-2 font-semibold">
        Step 1 of 2: Select which request headers you want to reveal
      </div>
      <div className="flex-grow flex-shrink h-0 overflow-y-auto">
        <table className="border border-slate-300 border-collapse table-fixed">
          <tbody className="bg-slate-200">
            {req.requestHeaders?.map((h) => (
              <tr
                key={h.name}
                className={classNames('border-b border-slate-200 text-xs', {
                  'bg-slate-50': !!revealed[h.name],
                })}
              >
                <td className="border border-slate-300 py-1 px-2 align-top">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    onChange={(e) => changeHeaderKey(h.name, e.target.checked)}
                    checked={!!revealed[h.name]}
                  />
                </td>
                <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
                  {h.name}
                </td>
                <td className="border border-slate-300 break-all align-top py-1 px-2">
                  {!!revealed[h.name]
                    ? h.value
                    : Array(h.value?.length || 0)
                        .fill('*')
                        .join('')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-row justify-end p-2 gap-2 border-t">
        <button className="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          className="bg-primary/[0.9] text-white font-bold hover:bg-primary/[0.8] px-2 py-0.5 active:bg-primary"
          onClick={props.onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function HideResponseStep(props: {
  onNext: () => void;
  onCancel: () => void;
  setSecretResps: (secrets: string[]) => void;
}): ReactElement {
  const params = useParams<{ requestId: string }>();
  const req = useRequest(params.requestId);
  const [responseText, setResponseText] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const onSelectionChange: ReactEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      const ta = e.currentTarget;
      if (ta.selectionEnd > ta.selectionStart) {
        setStart(ta.selectionStart);
        setEnd(ta.selectionEnd);
        props.setSecretResps(
          [
            responseText.substring(0, ta.selectionStart),
            responseText.substring(ta.selectionEnd, responseText.length),
          ].filter((d) => !!d),
        );
      }
    },
    [responseText],
  );

  useEffect(() => {
    if (!req) return;

    const options = {
      method: req.method,
      headers: req.requestHeaders.reduce(
        (acc: { [key: string]: string }, h: chrome.webRequest.HttpHeader) => {
          if (typeof h.name !== 'undefined' && typeof h.value !== 'undefined') {
            acc[h.name] = h.value;
          }
          return acc;
        },
        {},
      ),
      body: req.requestBody,
    };

    if (req?.formData) {
      const formData = new URLSearchParams();
      Object.entries(req.formData).forEach(([key, values]) => {
        values.forEach((v) => formData.append(key, v));
      });
      options.body = formData.toString();
    }

    replay(req.url, options).then((resp) => setResponseText(resp));
  }, [req]);

  useEffect(() => {
    const current = taRef.current;

    if (current) {
      current.focus();
      current.setSelectionRange(start, end);
    }
  }, [taRef, start, end]);

  if (!req) return <></>;

  let shieldedText = '';

  if (end > start) {
    shieldedText = Array(start)
      .fill('*')
      .join('')
      .concat(responseText.substring(start, end))
      .concat(
        Array(responseText.length - end)
          .fill('*')
          .join(''),
      );
  }
  return (
    <div className="flex flex-col flex-nowrap flex-shrink flex-grow h-0">
      <div className="border bg-primary/[0.9] text-white border-slate-300 py-1 px-2 font-semibold">
        Step 2 of 2: Highlight text to show only selected text from response
      </div>
      <div className="flex flex-col flex-grow flex-shrink h-0 overflow-y-auto p-2">
        <textarea
          ref={taRef}
          className="flex-grow textarea bg-slate-100 font-mono"
          value={shieldedText || responseText}
          onSelect={onSelectionChange}
        />
      </div>
      <div className="flex flex-row justify-end p-2 gap-2 border-t">
        <button className="button" onClick={props.onCancel}>
          Back
        </button>
        <button
          className="bg-primary/[0.9] text-white font-bold hover:bg-primary/[0.8] px-2 py-0.5 active:bg-primary"
          onClick={props.onNext}
        >
          Notarize
        </button>
      </div>
    </div>
  );
}

const replay = async (url: string, options: any) => {
  const resp = await fetch(url, options);
  const contentType =
    resp?.headers.get('content-type') || resp?.headers.get('Content-Type');

  if (contentType?.includes('application/json')) {
    return resp.text();
  } else if (contentType?.includes('text')) {
    return resp.text();
  } else if (contentType?.includes('image')) {
    return resp.blob().then((blob) => blob.text());
  } else {
    return resp.blob().then((blob) => blob.text());
  }
};
