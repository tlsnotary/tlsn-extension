import React, {
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
import {
  PluginInfoModal,
  PluginInfoModalContent,
  PluginInfoModalHeader,
} from '../PluginInfo';
import { getPluginConfigByHash } from '../../entries/Background/db';

export function PluginList(props: { className?: string }): ReactElement {
  const hashes = usePluginHashes();

  useEffect(() => {
    fetchPluginHashes();
  }, []);

  return (
    <div
      className={classNames('flex flex-col flex-nowrap gap-1', props.className)}
    >
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
      setConfig(await getPluginConfigByHash(props.hash));
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
    <div
      className={classNames(
        'flex flex-row justify-center border rounded border-slate-300 p-2 gap-2 plugin-box',
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
        <PluginInfoModal
          pluginContent={config}
          onClose={() => showPluginInfo(false)}
        >
          <PluginInfoModalHeader>
            <div className="flex flex-row items-end justify-start gap-2">
              <Icon
                className="text-slate-500 hover:text-slate-700 cursor-pointer"
                size={1}
                fa="fa-solid fa-caret-left"
                onClick={() => showPluginInfo(false)}
              />
            </div>
          </PluginInfoModalHeader>
          <PluginInfoModalContent className="flex flex-col items-center cursor-default">
            <img
              className="w-12 h-12 mb-2"
              src={config.icon}
              alt="Plugin Icon"
            />
            <span className="text-3xl text-blue-600 font-semibold">
              {config.title}
            </span>
            <div className="text-slate-500 text-lg">{config.description}</div>
          </PluginInfoModalContent>
        </PluginInfoModal>
      )}
    </div>
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
    <div className="flex flex-col items-center w-full gap-1">
      <div className="font-bold text-red-700">
        {`Are you sure you want to remove "${config.title}" plugin?`}
      </div>
      <div className="mb-1">Warning: this cannot be undone.</div>
      <div className="flex flex-row w-full gap-1">
        <button className="flex-grow button p-1" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="flex-grow font-bold bg-red-500 hover:bg-red-600 text-white rounded p-1"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
