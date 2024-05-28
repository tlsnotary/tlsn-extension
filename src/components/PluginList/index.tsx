import React, {
  ChangeEvent,
  MouseEventHandler,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  fetchPluginHashes,
  removePlugin,
  fetchPluginConfigByHash,
  runPlugin,
} from '../../utils/rpc';
import { usePluginHashes } from '../../reducers/plugins';
import { PluginConfig } from '../../utils/misc';
import DefaultPluginIcon from '../../assets/img/default-plugin-icon.png';
import classNames from 'classnames';
import Icon from '../Icon';
import './index.scss';
import browser from 'webextension-polyfill';
import { ErrorModal } from '../ErrorModal';
import Modal, { ModalHeader, ModalContent, ModalFooter } from '../Modal/Modal';

export function PluginList(props: { className?: string }): ReactElement {
  const hashes = usePluginHashes();

  useEffect(() => {
    fetchPluginHashes();
  }, []);

  return (
    <div className={classNames('flex flex-col flex-nowrap', props.className)}>
      {!hashes.length && (
        <div className="flex flex-col items-center justify-center text-slate-400 cursor-default select-none">
          <div>No available plugins</div>
        </div>
      )}
      {hashes.map((hash) => (
        <Plugin key={hash} hash={hash} />
      ))}
    </div>
  );
}

export function Plugin(props: {
  hash: string;
  onClick?: () => void;
}): ReactElement {
  const [error, showError] = useState('');
  const [config, setConfig] = useState<PluginConfig | null>(null);
  const [pluginInfo, showPluginInfo] = useState(false);
  const [remove, showRemove] = useState(false);

  const onClick = useCallback(async () => {
    if (!config || remove) return;

    try {
      await runPlugin(props.hash, 'start');

      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      await browser.storage.local.set({ plugin_hash: props.hash });

      // @ts-ignore
      if (chrome.sidePanel) await chrome.sidePanel.open({ tabId: tab.id });

      window.close();
    } catch (e: any) {
      showError(e.message);
    }
  }, [props.hash, config, remove]);

  useEffect(() => {
    (async function () {
      setConfig(await fetchPluginConfigByHash(props.hash));
    })();
  }, [props.hash]);

  const onRemove: MouseEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      removePlugin(props.hash);
      showRemove(false);
    },
    [props.hash, remove],
  );

  const onConfirmRemove: MouseEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      showRemove(true);
    },
    [props.hash, remove],
  );

  const onPluginInfo: MouseEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      showPluginInfo(true);
    },
    [props.hash, pluginInfo],
  );

  if (!config) return <></>;

  return (
    <button
      className={classNames(
        'flex flex-row border rounded border-slate-300 p-2 gap-2 plugin-box',
        'cursor-pointer hover:bg-slate-100 hover:border-slate-400 active:bg-slate-200',
      )}
      onClick={onClick}
    >
      {!!error && <ErrorModal onClose={() => showError('')} message={error} />}
      {!remove ? (
        <div className="flex flex-row w-full gap-2">
          <img className="w-12 h-12" src={config.icon || DefaultPluginIcon} />
          <div className="flex flex-col w-full items-start">
            <div className="font-bold flex flex-row h-6 items-center justify-between w-full">
              {config.title}
              <div className="flex flex-row items-center justify-center">
                <Icon
                  fa="fa-solid fa-circle-info"
                  className="flex flex-row items-center justify-center cursor-pointer plugin-box__remove-icon"
                  onClick={onPluginInfo}
                />
                <Icon
                  fa="fa-solid fa-xmark"
                  className="flex flex-row items-center justify-center cursor-pointer text-red-500 bg-red-200 rounded-full plugin-box__remove-icon"
                  onClick={onConfirmRemove}
                />
              </div>
            </div>
            <div>{config.description}</div>
          </div>
        </div>
      ) : (
        <RemovePlugin
          onRemove={onRemove}
          showRemove={showRemove}
          config={config}
        />
      )}
      {pluginInfo && (
        <PluginInfo showPluginInfo={showPluginInfo} config={config} />
      )}
    </button>
  );
}

function PluginInfo(props: {
  showPluginInfo: (show: boolean) => void;
  config: PluginConfig;
}): ReactElement {
  const { showPluginInfo, config } = props;

  interface Request {
    url: string;
    method: string;
  }


  return (
    <Modal className="w-11/12" onClose={() => {}}>
      <ModalHeader>
        <div className="font-bold">{config.title}</div>
        <div>{config.description}</div>
      </ModalHeader>
      <ModalContent>
        <div className="flex flex-col w-full gap-2 p-2">
          <h1 className="font-bold">Host Functions Allowed</h1>
          <div className="flex flex-col input border gap-2">
            {config.hostFunctions!.map((hostFunction: string, index: React.Key) => (
              <div key={index}>{hostFunction}</div>
            ))}
          </div>
          <h1 className="font-bold">Cookies Allowed</h1>
          <div className="input border">
            {config.cookies!.map((cookies: string, index: React.Key) => (
              <div key={index}>{cookies}</div>
            ))}
          </div>
          <h1 className="font-bold">Headers Allowed</h1>
          <div className="input border">
            {config.headers!.map((headers: string, index: React.Key) => (
              <div key={index}>{headers}</div>
            ))}
          </div>
          <h1 className="font-bold">Requests Allowed</h1>
          <div className="input border">
            {config.requests!.map((requests: Request, index: React.Key) => (
              <div key={index}>
                {requests.method} - {requests.url}
              </div>
            ))}
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <button
          className="bg-slate-500 text-white rounded p-1"
          onClick={() => showPluginInfo(false)}
        >
          Close
        </button>
      </ModalFooter>
    </Modal>
  );
}

function RemovePlugin(props: {
  onRemove: MouseEventHandler;
  showRemove: (show: boolean) => void;
  config: PluginConfig;
}): ReactElement {
  const { onRemove, showRemove, config } = props;

  const onCancel: MouseEventHandler = useCallback((e) => {
    e.stopPropagation();
    showRemove(false);
  }, []);

  return (
    <div className="flex flex-col w-full gap-2">
      <div className="font-bold">{config.title}</div>
      <div>{config.description}</div>
      <div className="flex flex-row gap-2">
        <button
          className="flex-grow bg-red-500 text-white rounded p-1"
          onClick={onRemove}
        >
          Remove
        </button>
        <button
          className="flex-grow bg-slate-500 text-white rounded p-1"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
