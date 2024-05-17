import React, {
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { notarizeRequest, useRequest } from '../../reducers/requests';
import classNames from 'classnames';
import { useDispatch } from 'react-redux';
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import Icon from '../Icon';
import NavigateWithParams from '../NavigateWithParams';
import {
  set,
  get,
  MAX_SENT_LS_KEY,
  MAX_RECEIVED_LS_KEY,
  getMaxRecv,
  getMaxSent,
} from '../../utils/storage';
import { MAX_RECV, MAX_SENT } from '../../utils/constants';
import { urlify } from '../../utils/misc';

type Props = {
  requestId: string;
};

export default function RequestDetail(props: Props): ReactElement {
  const request = useRequest(props.requestId);
  const navigate = useNavigate();

  const notarize = useCallback(async () => {
    if (!request) return;

    navigate('/notary/' + request.requestId);
  }, [request, props.requestId]);

  if (!request) return <></>;

  return (
    <>
      <div className="flex flex-row flex-nowrap relative items-center bg-slate-300 py-2 px-2 gap-2">
        <Icon
          className="cursor-point text-slate-400 hover:text-slate-700"
          fa="fa-solid fa-xmark"
          onClick={() => navigate('/requests')}
        />
        <RequestDetailsHeaderTab path="/headers">
          Headers
        </RequestDetailsHeaderTab>
        <RequestDetailsHeaderTab path="/payloads">
          Payload
        </RequestDetailsHeaderTab>
        <RequestDetailsHeaderTab path="/response">
          Response
        </RequestDetailsHeaderTab>
        <RequestDetailsHeaderTab path="/advanced">
          Advanced
        </RequestDetailsHeaderTab>
        <button
          className="absolute right-2 bg-primary/[0.9] text-white font-bold px-2 py-0.5 hover:bg-primary/[0.8] active:bg-primary"
          onClick={notarize}
        >
          Notarize
        </button>
      </div>
      <Routes>
        <Route
          path="headers"
          element={<RequestHeaders requestId={props.requestId} />}
        />
        <Route
          path="payloads"
          element={<RequestPayload requestId={props.requestId} />}
        />
        <Route
          path="response"
          element={<WebResponse requestId={props.requestId} />}
        />
        <Route path="advanced" element={<AdvancedOptions />} />
        <Route path="/" element={<NavigateWithParams to="/headers" />} />
      </Routes>
    </>
  );
}

function RequestDetailsHeaderTab(props: {
  children: ReactNode;
  path: string;
}): ReactElement {
  const loc = useLocation();
  const params = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const selected = loc.pathname.includes(props.path);
  return (
    <div
      className={classNames('font-bold', {
        'text-slate-700 cursor-default': selected,
        'text-slate-400 hover:text-slate-500 cursor-pointer': !selected,
      })}
      onClick={() => navigate('/requests/' + params.requestId + props.path)}
    >
      {props.children}
    </div>
  );
}

function AdvancedOptions(): ReactElement {
  const [maxSent, setMaxSent] = useState(MAX_SENT);
  const [maxRecv, setMaxRecv] = useState(MAX_RECV);

  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      setMaxRecv((await getMaxRecv()) || MAX_RECV);
      setMaxSent((await getMaxSent()) || MAX_SENT);
    })();
  }, []);

  const onSave = useCallback(async () => {
    await set(MAX_RECEIVED_LS_KEY, maxRecv.toString());
    await set(MAX_SENT_LS_KEY, maxSent.toString());
    setDirty(false);
  }, [maxSent, maxRecv]);

  return (
    <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
      <div className="font-semibold">Max Sent Data</div>
      <input
        type="number"
        className="input border"
        value={maxSent}
        min={0}
        onChange={(e) => {
          setMaxSent(parseInt(e.target.value));
          setDirty(true);
        }}
      />
      <div className="font-semibold">Max Received Data</div>
      <input
        type="number"
        className="input border"
        value={maxRecv}
        min={0}
        onChange={(e) => {
          setMaxRecv(parseInt(e.target.value));
          setDirty(true);
        }}
      />
      <div className="flex flex-row flex-nowrap justify-end gap-2 p-2">
        <button
          className="button !bg-primary/[0.9] hover:bg-primary/[0.8] active:bg-primary !text-white"
          disabled={!dirty}
          onClick={onSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function RequestPayload(props: Props): ReactElement {
  const data = useRequest(props.requestId);
  const [url, setUrl] = useState<URL | null>();
  const [json, setJson] = useState<any | null>();
  const [formData, setFormData] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    if (data?.formData) {
      const params = new URLSearchParams();
      Object.entries(data.formData).forEach(([key, values]) => {
        values.forEach((v) => params.append(key, v));
      });
      setFormData(params);
    }
  }, [data?.formData]);

  useEffect(() => {
    try {
      setUrl(new URL(data!.url));
    } catch (e) {}

    try {
      if (data?.requestBody) {
        setJson(JSON.parse(data.requestBody));
      }
    } catch (e) {
      console.error(e);
      setJson(null);
    }
  }, [data]);

  return (
    <div className="flex flex-col flex-nowrap overflow-y-auto">
      <table className="border border-slate-300 border-collapse table-fixed w-full">
        {!!url?.searchParams.size && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Query String Parameters
                </td>
              </tr>
            </thead>
            <tbody>
              {Array.from(url.searchParams).map((param) => {
                return (
                  <tr key={param[0]} className="border-b border-slate-200">
                    <td className="border border-slate-300 font-bold align-top py-1 px-2 break-all">
                      {param[0]}
                    </td>
                    <td className="border border-slate-300 break-all align-top py-1 px-2 break-all">
                      {param[1]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </>
        )}
        {!!json && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Body Payload
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={10}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={JSON.stringify(json, null, 2)}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!formData && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Form Data
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={10}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={formData.toString()}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!json && !!data?.requestBody && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Body
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={6}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={data?.requestBody}
                ></textarea>
              </td>
            </tr>
          </>
        )}
      </table>
    </div>
  );
}

function WebResponse(props: Props): ReactElement {
  const data = useRequest(props.requestId);
  const [response, setResponse] = useState<Response | null>(null);
  const [json, setJSON] = useState<any | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [formData, setFormData] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    if (data?.formData) {
      const params = new URLSearchParams();
      Object.entries(data.formData).forEach(([key, values]) => {
        values.forEach((v) => params.append(key, v));
      });
      setFormData(params);
    }
  }, [data?.formData]);

  const replay = useCallback(async () => {
    if (!data) return null;

    const options = {
      method: data.method,
      headers: data.requestHeaders.reduce(
        // @ts-ignore
        (acc: { [key: string]: string }, h: chrome.webRequest.HttpHeader) => {
          if (typeof h.name !== 'undefined' && typeof h.value !== 'undefined') {
            acc[h.name] = h.value;
          }
          return acc;
        },
        {},
      ),
      body: data?.requestBody,
    };

    if (formData) {
      options.body = formData.toString();
    }

    // @ts-ignore
    const resp = await fetch(data.url, options);
    setResponse(resp);

    const contentType =
      resp?.headers.get('content-type') || resp?.headers.get('Content-Type');

    if (contentType?.includes('application/json')) {
      resp.json().then((json) => {
        if (json) {
          setJSON(json);
        }
      });
    } else if (contentType?.includes('text')) {
      resp.text().then((_text) => {
        if (_text) {
          setText(_text);
        }
      });
    } else if (contentType?.includes('image')) {
      resp.blob().then((blob) => {
        if (blob) {
          setImg(URL.createObjectURL(blob));
        }
      });
    } else {
      resp
        .blob()
        .then((blob) => blob.text())
        .then((_text) => {
          if (_text) {
            setText(_text);
          }
        });
    }
  }, [data, formData]);

  return (
    <div className="flex flex-col flex-nowrap overflow-y-auto">
      {!response && (
        <div className="p-2">
          <button className="button" onClick={replay}>
            Fetch Response
          </button>
        </div>
      )}
      <table className="border border-slate-300 border-collapse table-fixed w-full">
        {!!response?.headers && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Headers
                </td>
              </tr>
            </thead>
            <tbody>
              {Array.from(response.headers.entries()).map(([name, value]) => {
                return (
                  <tr className="border-b border-slate-200">
                    <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
                      {name}
                    </td>
                    <td className="border border-slate-300 break-all align-top py-1 px-2">
                      {value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </>
        )}
        {!!json && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  JSON
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={16}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={JSON.stringify(json, null, 2)}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!text && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Text
                </td>
              </tr>
            </thead>
            <tr>
              <td colSpan={2}>
                <textarea
                  rows={16}
                  className="w-full bg-slate-100 text-slate-600 p-2 text-xs break-all h-full outline-none font-mono"
                  value={text}
                ></textarea>
              </td>
            </tr>
          </>
        )}
        {!!img && (
          <>
            <thead className="bg-slate-200">
              <tr>
                <td colSpan={2} className="border border-slate-300 py-1 px-2">
                  Img
                </td>
              </tr>
            </thead>
            <tr>
              <td className="bg-slate-100" colSpan={2}>
                <img src={img} />
              </td>
            </tr>
          </>
        )}
      </table>
    </div>
  );
}

function RequestHeaders(props: Props): ReactElement {
  const data = useRequest(props.requestId);

  return (
    <div className="flex flex-col flex-nowrap overflow-y-auto">
      <table className="border border-slate-300 border-collapse table-fixed">
        <thead className="bg-slate-200">
          <tr>
            <td colSpan={2} className="border border-slate-300 py-1 px-2">
              General
            </td>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
              Method
            </td>
            <td className="border border-slate-300 break-all align-top py-1 px-2">
              {data?.method}
            </td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
              Type
            </td>
            <td className="border border-slate-300 break-all align-top py-1 px-2">
              {data?.type}
            </td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
              URL
            </td>
            <td className="border border-slate-300 break-all align-top py-1 px-2">
              {data?.url}
            </td>
          </tr>
        </tbody>
        <thead className="bg-slate-200">
          <tr>
            <td colSpan={2} className="border border-slate-300 py-1 px-2">
              Headers
            </td>
          </tr>
        </thead>
        <tbody className="">
          {data?.requestHeaders?.map((h) => (
            <tr key={h.name} className="border-b border-slate-200">
              <td className="border border-slate-300 font-bold align-top py-1 px-2 whitespace-nowrap">
                {h.name}
              </td>
              <td className="border border-slate-300 break-all align-top py-1 px-2">
                {h.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
