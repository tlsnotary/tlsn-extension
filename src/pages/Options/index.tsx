import React, { ReactElement, useState, useEffect, useCallback } from 'react';
import {
  set,
  get,
  NOTARY_API_LS_KEY,
  PROXY_API_LS_KEY,
  MAX_SENT_LS_KEY,
  MAX_RECEIVED_LS_KEY,
} from '../../utils/storage';
import {
  NOTARY_API,
  NOTARY_PROXY,
  MAX_RECV,
  MAX_SENT,
} from '../../utils/constants';

export default function Options(): ReactElement {
  const [notary, setNotary] = useState(NOTARY_API);
  const [proxy, setProxy] = useState(NOTARY_PROXY);

  const [dirty, setDirty] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);

  const [maxSent, setMaxSent] = useState(parseInt(MAX_SENT));
  const [maxReceived, setMaxReceived] = useState<number>(parseInt(MAX_RECV));

  useEffect(() => {
    const fetchSettings = async () => {
      const storedNotary = (await get(NOTARY_API_LS_KEY)) || NOTARY_API;
      const storedProxy = (await get(PROXY_API_LS_KEY)) || NOTARY_PROXY;
      const storedMaxReceived =
        parseInt(await get(MAX_RECEIVED_LS_KEY)) || parseInt(MAX_RECV);
      const storedMaxSent =
        parseInt(await get(MAX_SENT_LS_KEY)) || parseInt(MAX_SENT);

      setNotary(storedNotary);
      setProxy(storedProxy);
      setMaxReceived(storedMaxReceived);
      setMaxSent(storedMaxSent);
    };

    fetchSettings();
  }, [isAdvanced]);

  const onSave = useCallback(async () => {
    await set(NOTARY_API_LS_KEY, notary);
    await set(PROXY_API_LS_KEY, proxy);
    await set(MAX_SENT_LS_KEY, maxSent.toString());
    await set(MAX_RECEIVED_LS_KEY, maxReceived.toString());
    setDirty(false);
  }, [notary, proxy, maxSent, maxReceived]);

  const onAdvanced = useCallback(() => {
    setIsAdvanced(!isAdvanced);
  }, [isAdvanced]);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      <div className="flex flex-row flex-nowrap justify-between items-between py-1 px-2 gap-2">
        <p className="font-bold text-base">Settings</p>
        <button className="button" onClick={onAdvanced}>
          Advanced
        </button>
      </div>
      {!isAdvanced ? (
        <div>
          <InputField
            label="Notary API"
            placeholder="https://api.tlsnotary.org"
            value={notary}
            onChange={(e) => {
              setNotary(e.target.value);
              setDirty(true);
            }}
          />
          <InputField
            label="Proxy API"
            placeholder="https://proxy.tlsnotary.org"
            value={proxy}
            onChange={(e) => {
              setProxy(e.target.value);
              setDirty(true);
            }}
          />
          <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
            <div className="font-semibold">Explorer URL</div>
            <div className="input border">https://explorer.tlsnotary.org</div>
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
      ) : (
        <AdvancedOptions
          maxSent={maxSent}
          maxReceived={maxReceived}
          setMaxSent={setMaxSent}
          setMaxReceived={setMaxReceived}
          dirty={dirty}
          setDirty={setDirty}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function InputField(props: {
  label: string;
  placeholder: string;
  value: string;
  type?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const { label, placeholder, value, type, onChange } = props;

  return (
    <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
      <div className="font-semibold">{label}</div>
      <input
        type={type}
        className="input border"
        placeholder={placeholder}
        onChange={onChange}
        value={value}
      />
    </div>
  );
}

function AdvancedOptions(props: {
  maxSent: number;
  maxReceived: number;
  setMaxSent: (value: number) => void;
  setMaxReceived: (value: number) => void;
  dirty: boolean;
  setDirty: (value: boolean) => void;
  onSave: () => void;
}) {
  const {
    maxSent,
    maxReceived,
    setMaxSent,
    setMaxReceived,
    dirty,
    setDirty,
    onSave,
  } = props;

  return (
    <div>
      <InputField
        label="Set Max Received Data"
        placeholder="1024"
        value={maxReceived.toString()}
        type="number"
        onChange={(e) => {
          setMaxReceived(parseInt(e.target.value));
          setDirty(true);
        }}
      />
      <InputField
        label="Set Max Sent Data"
        placeholder="1024"
        value={maxSent.toString()}
        type="number"
        onChange={(e) => {
          setMaxSent(parseInt(e.target.value));
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
