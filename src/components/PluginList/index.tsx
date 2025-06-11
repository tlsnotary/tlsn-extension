import React, {
  MouseEventHandler,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { fetchPluginHashes, removePlugin, runPlugin, addPlugin } from '../../utils/rpc';
import { usePluginHashes } from '../../reducers/plugins';
import {
  getPluginConfig,
  hexToArrayBuffer,
  PluginConfig,
} from '../../utils/misc';
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
import { getPluginConfigByUrl } from '../../entries/Background/db';
import { SidePanelActionTypes } from '../../entries/SidePanel/types';
import { openSidePanel } from '../../entries/utils';

export function PluginList({
  className,
  unremovable,
  onClick,
  showAddButton = false,
}: {
  className?: string;
  unremovable?: boolean;
  onClick?: (hash: string) => void;
  showAddButton?: boolean;
}): ReactElement {
  const hashes = usePluginHashes();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPluginHashes();
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.wasm')) {
      alert('Please select a .wasm file');
      return;
    }

    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hex = Buffer.from(arrayBuffer).toString('hex');
      const url = `file://${file.name}`;

      await addPlugin(hex, url);
      await fetchPluginHashes();
    } catch (error: any) {
      alert(`Failed to add plugin: ${error.message}`);
    } finally {
      setUploading(false);
      // Reset the input
      e.target.value = '';
    }
  }, []);

  return (
    <div className={classNames('flex flex-col flex-nowrap gap-1', className)}>
      {showAddButton && (
        <div className="relative">
          <input
            type="file"
            accept=".wasm"
            onChange={handleFileUpload}
            disabled={uploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <button
            className="flex flex-row items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-slate-700 hover:border-slate-400 transition-colors cursor-pointer w-full"
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Icon fa="fa-solid fa-spinner" className="animate-spin" />
                <span>Adding Plugin...</span>
              </>
            ) : (
              <>
                <Icon fa="fa-solid fa-plus" />
                <span>Add Plugin (.wasm file)</span>
              </>
            )}
          </button>
        </div>
      )}
      {!hashes.length && !showAddButton && (
        <div className="flex flex-col items-center justify-center text-slate-400 cursor-default select-none">
          <div>No available plugins</div>
        </div>
      )}
      {hashes.map((hash) => (
        <Plugin
          key={hash}
          hash={hash}
          unremovable={unremovable}
          onClick={onClick}
        />
      ))}

    </div>
  );
}

export function Plugin({
  hash,
  hex,
  unremovable,
  onClick,
  className,
}: {
  hash: string;
  hex?: string;
  className?: string;
  onClick?: (hash: string) => void;
  unremovable?: boolean;
}): ReactElement {
  const [error, showError] = useState('');
  const [config, setConfig] = useState<PluginConfig | null>(null);
  const [pluginInfo, showPluginInfo] = useState(false);
  const [remove, showRemove] = useState(false);

  const onRunPlugin = useCallback(async () => {
    if (!config || remove) return;

    if (onClick) {
      onClick(hash);
      return;
    }

    try {
      await openSidePanel();

      browser.runtime.sendMessage({
        type: SidePanelActionTypes.execute_plugin_request,
        data: {
          pluginHash: hash,
        },
      });

      await runPlugin(hash, 'start');

      window.close();
    } catch (e: any) {
      showError(e.message);
    }
  }, [hash, config, remove, onClick]);

  useEffect(() => {
    (async function () {
      if (hex) {
        setConfig(await getPluginConfig(hexToArrayBuffer(hex)));
      } else {
        setConfig(await getPluginConfigByUrl(hash));
      }
    })();
  }, [hash, hex]);

  const onRemove: MouseEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      removePlugin(hash);
      showRemove(false);
    },
    [hash, remove],
  );

  const onConfirmRemove: MouseEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      showRemove(true);
    },
    [hash, remove],
  );

  const onPluginInfo: MouseEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      showPluginInfo(true);
    },
    [hash, pluginInfo],
  );

  if (!config) return <></>;

  return (
    <div
      className={classNames(
        'flex flex-row justify-center border rounded border-slate-300 p-2 gap-2 plugin-box',
        'cursor-pointer hover:bg-slate-100 hover:border-slate-400 active:bg-slate-200',
        className,
      )}
      onClick={onRunPlugin}
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
                {!unremovable && (
                  <Icon
                    fa="fa-solid fa-xmark"
                    className="flex flex-row items-center justify-center cursor-pointer text-red-500 bg-red-200 rounded-full plugin-box__remove-icon"
                    onClick={onConfirmRemove}
                  />
                )}
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
              src={config.icon || DefaultPluginIcon}
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
