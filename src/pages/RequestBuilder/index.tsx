import c from 'classnames';
import React, { MouseEventHandler, ReactElement, ReactNode, useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NavigateWithParams from '../../components/NavigateWithParams';
import { urlify } from '../../utils/misc';


enum TabType {
  Params = 'Params',
  Headers = 'Headers',
  Body = 'Body',
}

export default function RequestBuilder(): ReactElement {
  const loc = useLocation();
  const navigate = useNavigate();

  const [_url, setUrl] = useState(
    'https://api.twitter.com/2/tweets/search/recent?query=conversation_id:1279940000004973111&tweet.fields=in_reply_to_user_id,author_id,created_at,conversation_id'
  );

  const [params, setParams] = useState<[string, string, boolean?][]>([]);

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

  return (
  	<div className='flex flex-col w-full p-2 gap-2'>
  		<div className='flex flex-row'>
  			<select className='select'>
  				<option value='GET'>GET</option>
  				<option value='GET'>POST</option>
  				<option value='GET'>PUT</option>
  				<option value='GET'>PATCH</option>
  				<option value='GET'>DELETE</option>
  				<option value='GET'>HEAD</option>
  				<option value='GET'>OPTIONS</option>
  			</select>
				<input
					className='input border flex-grow'
					type='text'
          value={href}
          onChange={e => setUrl(e.target.value)}
			  />
        <button className='button'>Send</button>
  		</div>
      <div className='flex flex-col'>
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
        </div>
      </div>
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
        <Route path="headers" element={<div>headers</div>} />
        <Route path="body" element={<div>body</div>} />
        <Route path="/" element={<NavigateWithParams to="/params" />} />
      </Routes>
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
              <input 
                type='checkbox' 
                onChange={() => props.toggleParam(i)}
                checked={!silent}
              />
            </td>
            <td className="border border-slate-300 font-bold align-top break-all w-fit">
              <input
                className='input py-1 px-2 w-full py-1 px-2'
                type='text'
                value={key}
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