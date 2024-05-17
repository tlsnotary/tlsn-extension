import React, { ReactElement, useState, useEffect, useCallback } from 'react';
import {
  set,
  get,
  NOTARY_API_LS_KEY,
  PROXY_API_LS_KEY,
  MAX_SENT_LS_KEY,
  MAX_RECEIVED_LS_KEY,
  getMaxSent,
  getMaxRecv,
  getNotaryApi,
  getProxyApi,
} from '../../utils/storage';
import {
  EXPLORER_API,
  NOTARY_API,
  NOTARY_PROXY,
  MAX_RECV,
  MAX_SENT,
} from '../../utils/constants';

export default function Options(): ReactElement {
  const [notary, setNotary] = useState(NOTARY_API);
  const [proxy, setProxy] = useState(NOTARY_PROXY);
  const [maxSent, setMaxSent] = useState(MAX_SENT);
  const [maxReceived, setMaxReceived] = useState(MAX_RECV);

  const [dirty, setDirty] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    (async () => {
      setNotary((await getNotaryApi()) || NOTARY_API);
      setProxy((await getProxyApi()) || NOTARY_PROXY);
      setMaxReceived((await getMaxRecv()) || MAX_RECV);
      setMaxSent((await getMaxSent()) || MAX_SENT);
    })();
  }, [advanced]);

  const onSave = useCallback(async () => {
    await set(NOTARY_API_LS_KEY, notary);
    await set(PROXY_API_LS_KEY, proxy);
    await set(MAX_SENT_LS_KEY, maxSent.toString());
    await set(MAX_RECEIVED_LS_KEY, maxReceived.toString());
    setDirty(false);
  }, [notary, proxy, maxSent, maxReceived]);

  const onAdvanced = useCallback(() => {
    setAdvanced(!advanced);
  }, [advanced]);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <div className="flex flex-row flex-nowrap justify-between items-between py-1 px-2 gap-2">
        <p className="font-bold text-base">Settings</p>
      </div>
      <NormalOptions
        notary={notary}
        setNotary={setNotary}
        proxy={proxy}
        setProxy={setProxy}
        setDirty={setDirty}
      />
      <div className="justify-left px-2 pt-3 gap-2">
        <button className="font-bold" onClick={onAdvanced}>
          <i
            className={
              advanced
                ? 'fa-solid fa-caret-down pr-1'
                : 'fa-solid fa-caret-right pr-1'
            }
          ></i>
          Advanced
        </button>
      </div>
      {!advanced ? (
        <></>
      ) : (
        <AdvancedOptions
          maxSent={maxSent}
          setMaxSent={setMaxSent}
          maxReceived={maxReceived}
          setMaxReceived={setMaxReceived}
          setDirty={setDirty}
        />
      )}
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

function InputField(props: {
  label?: string;
  placeholder?: string;
  value?: string;
  type?: string;
  min?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const { label, placeholder, value, type, min, onChange } = props;

  return (
    <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
      <div className="font-semibold">{label}</div>
      <input
        type={type}
        className="input border"
        onChange={onChange}
        value={value}
        min={min}
      />
    </div>
  );
}

function NormalOptions(props: {
  notary: string;
  setNotary: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  setDirty: (value: boolean) => void;
}) {
  const { notary, setNotary, proxy, setProxy, setDirty } = props;

  return (
    <div>
      <InputField
        label="Notary API"
        placeholder="https://api.tlsnotary.org"
        value={notary}
        type="text"
        onChange={(e) => {
          setNotary(e.target.value);
          setDirty(true);
        }}
      />
      <InputField
        label="Proxy API"
        placeholder="https://proxy.tlsnotary.org"
        value={proxy}
        type="text"
        onChange={(e) => {
          setProxy(e.target.value);
          setDirty(true);
        }}
      />
      <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
        <div className="font-semibold">Explorer URL</div>
        <div className="input border">{EXPLORER_API}</div>
      </div>
    </div>
  );
}

function AdvancedOptions(props: {
  maxSent: number;
  setMaxSent: (value: number) => void;
  maxReceived: number;
  setMaxReceived: (value: number) => void;
  setDirty: (value: boolean) => void;
}) {
  const { maxSent, setMaxSent, maxReceived, setMaxReceived, setDirty } = props;

  return (
    <div>
      <InputField
        label="Set Max Received Data"
        value={maxReceived.toString()}
        type="number"
        min={0}
        onChange={(e) => {
          setMaxReceived(parseInt(e.target.value));
          setDirty(true);
        }}
      />
      <InputField
        label="Set Max Sent Data"
        value={maxSent.toString()}
        type="number"
        min={0}
        onChange={(e) => {
          setMaxSent(parseInt(e.target.value));
          setDirty(true);
        }}
      />
      <div className="flex flex-row flex-nowrap justify-end gap-2 p-2"></div>
    </div>
  );
}
