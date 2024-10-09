import React, {
  ReactElement,
  useState,
  useEffect,
  useCallback,
  MouseEvent,
} from 'react';
import {
  set,
  NOTARY_API_LS_KEY,
  PROXY_API_LS_KEY,
  MAX_SENT_LS_KEY,
  MAX_RECEIVED_LS_KEY,
  getMaxSent,
  getMaxRecv,
  getNotaryApi,
  getProxyApi,
  getLoggingFilter,
  LOGGING_FILTER_KEY,
} from '../../utils/storage';
import {
  EXPLORER_API,
  NOTARY_API,
  NOTARY_PROXY,
  MAX_RECV,
  MAX_SENT,
} from '../../utils/constants';
import Modal, { ModalContent } from '../../components/Modal/Modal';
import browser from 'webextension-polyfill';
import { LoggingLevel } from 'tlsn-js';
import { version } from '../../../package.json';

export default function Options(): ReactElement {
  const [notary, setNotary] = useState(NOTARY_API);
  const [proxy, setProxy] = useState(NOTARY_PROXY);
  const [maxSent, setMaxSent] = useState(MAX_SENT);
  const [maxReceived, setMaxReceived] = useState(MAX_RECV);
  const [loggingLevel, setLoggingLevel] = useState<LoggingLevel>('Info');

  const [dirty, setDirty] = useState(false);
  const [shouldReload, setShouldReload] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [showReloadModal, setShowReloadModal] = useState(false);

  useEffect(() => {
    (async () => {
      setNotary((await getNotaryApi()) || NOTARY_API);
      setProxy((await getProxyApi()) || NOTARY_PROXY);
      setMaxReceived((await getMaxRecv()) || MAX_RECV);
      setMaxSent((await getMaxSent()) || MAX_SENT);
      setLoggingLevel((await getLoggingFilter()) || 'Info');
    })();
  }, [advanced]);

  const onSave = useCallback(
    async (e: MouseEvent<HTMLButtonElement>, skipCheck = false) => {
      if (!skipCheck && shouldReload) {
        setShowReloadModal(true);
        return;
      }
      await set(NOTARY_API_LS_KEY, notary);
      await set(PROXY_API_LS_KEY, proxy);
      await set(MAX_SENT_LS_KEY, maxSent.toString());
      await set(MAX_RECEIVED_LS_KEY, maxReceived.toString());
      await set(LOGGING_FILTER_KEY, loggingLevel);
      setDirty(false);
    },
    [notary, proxy, maxSent, maxReceived, loggingLevel, shouldReload],
  );

  const onSaveAndReload = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      await onSave(e, true);
      browser.runtime.reload();
    },
    [onSave],
  );

  const onAdvanced = useCallback(() => {
    setAdvanced(!advanced);
  }, [advanced]);

  const openInTab = useCallback((url: string) => {
    browser.tabs.create({ url });
  }, []);

  return (
    <div className="flex flex-col flex-nowrap flex-grow">
      {showReloadModal && (
        <Modal
          className="flex flex-col items-center text-base cursor-default justify-center !w-auto mx-4 my-[50%] p-4 gap-4"
          onClose={() => setShowReloadModal(false)}
        >
          <ModalContent className="flex flex-col w-full gap-4 items-center text-base justify-center">
            Modifying your logging your will require your extension to reload.
            Do you want to proceed?
          </ModalContent>
          <div className="flex flex-row justify-end items-center gap-2 w-full">
            <button
              className="button"
              onClick={() => setShowReloadModal(false)}
            >
              No
            </button>
            <button
              className="button button--primary"
              onClick={onSaveAndReload}
            >
              Yes
            </button>
          </div>
        </Modal>
      )}
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
          loggingLevel={loggingLevel}
          setLoggingLevel={setLoggingLevel}
          setShouldReload={setShouldReload}
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
      <div className="flex flex-col w-full items-end gap-2 p-2">
        <button
          className="button"
          onClick={() =>
            openInTab('https://github.com/tlsnotary/tlsn-extension/issues/new')
          }
        >
          File an issue
        </button>
        <button
          className="button"
          onClick={() => openInTab('https://discord.gg/9XwESXtcN7')}
        >
          Join our Discord
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
      <div className="font-semibold cursor-default">{label}</div>
      <input
        type={type}
        className="input border"
        onChange={onChange}
        value={value}
        min={min}
        placeholder={placeholder}
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
      <div className="flex flex-col flex-nowrap py-1 px-2 gap-2 cursor-default">
        <div className="font-semibold">Version</div>
        <div className="input border bg-slate-100">{version}</div>
      </div>
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
      <div className="flex flex-col flex-nowrap py-1 px-2 gap-2 cursor-default">
        <div className="font-semibold">Explorer URL</div>
        <div className="input border bg-slate-100">{EXPLORER_API}</div>
      </div>
    </div>
  );
}

function AdvancedOptions(props: {
  maxSent: number;
  maxReceived: number;
  loggingLevel: LoggingLevel;
  setShouldReload: (reload: boolean) => void;
  setMaxSent: (value: number) => void;
  setMaxReceived: (value: number) => void;
  setDirty: (value: boolean) => void;
  setLoggingLevel: (level: LoggingLevel) => void;
}) {
  const {
    maxSent,
    setMaxSent,
    maxReceived,
    setMaxReceived,
    setDirty,
    setLoggingLevel,
    loggingLevel,
    setShouldReload,
  } = props;

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
      <div className="flex flex-col flex-nowrap py-1 px-2 gap-2">
        <div className="font-semibold">Logging Level</div>
        <select
          className="select !bg-white border !px-2 !py-1"
          onChange={(e) => {
            setLoggingLevel(e.target.value as LoggingLevel);
            setDirty(true);
            setShouldReload(true);
          }}
          value={loggingLevel}
        >
          <option value="Error">Error</option>
          <option value="Warn">Warn</option>
          <option value="Info">Info</option>
          <option value="Debug">Debug</option>
          <option value="Trace">Trace</option>
        </select>
      </div>
      <div className="flex flex-row flex-nowrap justify-end gap-2 p-2"></div>
    </div>
  );
}
