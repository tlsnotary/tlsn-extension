import c from 'classnames';
import React, { MouseEventHandler, ReactElement, ReactNode, useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NavigateWithParams from '../../components/NavigateWithParams';
import ResponseDetail from '../../components/ResponseDetail';
import { urlify } from '../../utils/misc';


enum TabType {
  Params = 'Params',
  Headers = 'Headers',
  Body = 'Body',
}

export default function RequestBuilder(): ReactElement {
  const loc = useLocation();
  const navigate = useNavigate();

  const [_url, setUrl] = useState('');
  const [params, setParams] = useState<[string, string, boolean?][]>([]);
  const [headers, setHeaders] = useState<[string, string, boolean?][]>([]);
  const [body, setBody] = useState<string|undefined>(undefined);
  const [method, setMethod] = useState<string>('GET');
  const [response, setResponse] = useState<Response | null>(null);

  const url = urlify(_url);

  const href = !url 
    ? '' 
    : urlify(`${url.origin}${url.pathname}`, params.filter(([,,silent]) => !silent))?.href;

  useEffect(() => {
    setParams(Array.from(url?.searchParams || []));
  }, [_url]);

  const toggleParam = useCallback((i: number) => {
    params[i][2] = !params[i][2];
    setParams([...params]);
  }, [params]);

  const setParam = useCallback((index: number, key: string, value: string) => {
    params[index] = [key, value];
    setParams([...params]);
  }, [params]);

  const toggleHeader = useCallback((i: number) => {
    headers[i][2] = !headers[i][2];
    setHeaders([...headers]);
  }, [headers]);

  const setHeader = useCallback((index: number, key: string, value: string) => {
    headers[index] = [key, value];
    setHeaders([...headers]);
  }, [headers]);

  const sendRequest = useCallback(async () => {
    if (!href) return;

    const opts: RequestInit = { 
      method,
      headers: headers.reduce((map: { [key: string]: string }, [k, v]) => {
        if (k !== 'Cookie') {
          map[k] = v;
        }
        return map;
      }, {}),
    };

    if (body) opts.body = body;

    const cookie = headers.find(([key]) => key === 'Cookie');

    if (cookie) {
      opts.credentials = 'include';
      document.cookie = cookie[1];
    }

    const res = await fetch(href, opts);

    setResponse(res);

    navigate('/custom/response');
  }, [href, method, headers, body]);

  return (
  	<div className='flex flex-col w-full py-2 gap-2 flex-grow'>
  		<div className='flex flex-row px-2'>
  			<select 
          className='select'
          onChange={e => setMethod(e.target.value) }
        >
  				<option value='GET'>GET</option>
  				<option value='POST'>POST</option>
  				<option value='PUT'>PUT</option>
  				<option value='PATCH'>PATCH</option>
  				<option value='DELETE'>DELETE</option>
  				<option value='HEAD'>HEAD</option>
  				<option value='OPTIONS'>OPTIONS</option>
  			</select>
				<input
					className='input border flex-grow'
					type='text'
          value={url ? href : _url}
          onChange={e => setUrl(e.target.value)}
			  />
        <button 
          className='button'
          disabled={!url}
          onClick={sendRequest}
        >
          Send
        </button>
  		</div>
      <div className='flex flex-col px-2'>
        <div className='flex flex-row gap-2'>
          <TabLabel
            onClick={() => navigate('/custom/params')}
            active={loc.pathname.includes('params')}
          >
            Params
          </TabLabel>
          <TabLabel
            onClick={() => navigate('/custom/headers')}
            active={loc.pathname.includes('headers')}
          >
            Headers
          </TabLabel>
          <TabLabel
            onClick={() => navigate('/custom/body')}
            active={loc.pathname.includes('body')}
          >
            Body
          </TabLabel>
          {
            response && (
              <TabLabel
                onClick={() => navigate('/custom/response')}
                active={loc.pathname.includes('response')}
              >
                Response
              </TabLabel>
            )
          }
        </div>
      </div>
      <div className='h-0 flex-grow overflow-y-auto px-2'>
        <Routes>
          <Route 
            path="params" 
            element={
              <ParamTable
                url={url}
                toggleParam={toggleParam}
                setParam={setParam}
                params={params}
              />
            }
          />
          <Route 
            path="headers" 
            element={
              <HeaderTable
                toggleHeader={toggleHeader}
                setHeader={setHeader}
                headers={headers}
              />
            }
          />
          <Route 
            path="body"
            element={
              <textarea
                className='textarea h-full w-full resize-none'
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            }
          />
          <Route 
            path="response"
            element={
              <ResponseDetail
                response={response} 
              />
            }
          />
          <Route path="/" element={<NavigateWithParams to="/params" />} />
        </Routes>
      </div>
  	</div>
  );
}

function ParamTable(props: {
  url: URL | null;
  toggleParam: (i: number) => void;
  setParam: (index: number, key: string, value: string) => void;
  params: [string, string, boolean?][];
}): ReactElement {
  const params: [string, string, boolean?][] = [...props.params, ['', '', true]];
  const last = props.params.length;

  return (
    <table className="border border-slate-300 border-collapse table-fixed w-full">
      <tbody>
        {params.map(([key, value, silent], i) => (
          <tr
            key={i}
            className={c("border-b border-slate-200", {
              'opacity-30': !!silent,
            })}
          >
            <td className='w-8 text-center pt-2'>
              {
                last !== i && (
                  <input 
                    type='checkbox' 
                    onChange={() => props.toggleParam(i)}
                    checked={!silent}
                  />
                )
              }
            </td>
            <td className="border border-slate-300 font-bold align-top break-all w-fit">
              <input
                className='input py-1 px-2 w-full py-1 px-2'
                type='text'
                value={key}
                placeholder='Key'
                onChange={(e) => {
                  props.setParam(i, e.target.value, value);
                }}
              />
            </td>
            <td className="border border-slate-300 break-all align-top break-all">
              <input
                className='input py-1 px-2 w-full py-1 px-2'
                type='text'
                value={value}
                placeholder='Value'
                onChange={(e) => {
                  props.setParam(i, key, e.target.value);
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeaderTable(props: {
  toggleHeader: (i: number) => void;
  setHeader: (index: number, key: string, value: string) => void;
  headers: [string, string, boolean?][];
}): ReactElement {
  const headers: [string, string, boolean?][] = [...props.headers, ['', '', true]];
  const last = props.headers.length;

  return (
    <table className="border border-slate-300 border-collapse table-fixed w-full">
      <tbody>
        {headers.map(([key, value, silent], i) => (
          <tr
            key={i}
            className={c("border-b border-slate-200", {
              'opacity-30': !!silent,
            })}
          >
            <td className='w-8 text-center pt-2'>
              {
                last !== i && (
                  <input 
                    type='checkbox' 
                    onChange={() => props.toggleHeader(i)}
                    checked={!silent}
                  />
                )
              }
            </td>
            <td className="border border-slate-300 font-bold align-top break-all w-fit">
              <input
                className='input py-1 px-2 w-full py-1 px-2'
                type='text'
                value={key}
                placeholder='Key'
                onChange={(e) => {
                  props.setHeader(i, e.target.value, value);
                }}
              />
            </td>
            <td className="border border-slate-300 break-all align-top break-all">
              <input
                className='input py-1 px-2 w-full py-1 px-2'
                type='text'
                value={value}
                placeholder='Value'
                onChange={(e) => {
                  props.setHeader(i, key, e.target.value);
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
        'text-slate-400 border-b-2 border-transparent': !props.active,
      })}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}