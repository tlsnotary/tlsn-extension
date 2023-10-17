import React, { ReactElement, useState, useEffect, useCallback } from 'react';

const NOTARY_API_LS_KEY = 'notary-api';
const PROXY_API_LS_KEY = 'proxy-api';

export default function Options(): ReactElement {
  const [notary, setNotary] = useState('http://localhost:7047');
  const [proxy, setProxy] = useState('ws://127.0.0.1:55688');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      setNotary(await get(NOTARY_API_LS_KEY));
      setProxy(await get(PROXY_API_LS_KEY));
    })();
  }, []);

  const onSave = useCallback(async () => {
    await set(NOTARY_API_LS_KEY, notary);
    await set(PROXY_API_LS_KEY, proxy);
    setDirty(false);
  }, [notary, proxy]);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <div className="flex flex-row flex-nowrap py-1 px-2 gap-2 font-bold text-base">
        API Settings
      </div>
      <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
        <div className="font-semibold">Notary API</div>
        <input
          type="text"
          className="input border"
          placeholder="http://localhost:7047"
          onChange={e => {
            setNotary(e.target.value);
            setDirty(true);
          }}
          value={notary}
        />
      </div>
      <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
        <div className="font-semibold">Proxy API</div>
        <input
          type="text"
          className="input border"
          placeholder="ws://127.0.0.1:55688"
          onChange={e => {
            setProxy(e.target.value);
            setDirty(true);
          }}
          value={proxy}
        />
      </div>
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
};

async function set(key: string, value: string) {
  return chrome.storage.sync
    .set({ [key]: value });
}

async function get(key: string) {
  return chrome.storage.sync
    .get(key)
    .then((json: any) => json[key])
    .catch(() => '');
}
