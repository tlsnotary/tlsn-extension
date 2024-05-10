import React, {
  ChangeEvent,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  addPlugin,
  fetchPluginHashes,
  fetchPluginByHash,
  removePlugin,
} from '../../utils/rpc';
import { usePluginHashes } from '../../reducers/plugins';
import createPlugin, { CallContext } from '@extism/extism';
import { notarizeRequest } from '../../reducers/requests';
import { getPluginConfig, PluginConfig } from '../../utils/misc';
import DefaultPluginIcon from '../../assets/img/default-plugin-icon.png';
import classNames from 'classnames';
import Icon from '../Icon';
import './index.scss';

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

export function Plugin(props: { hash: string }): ReactElement {
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [config, setConfig] = useState<PluginConfig | null>(null);

  useEffect(() => {
    (async function () {
      const hex = await fetchPluginByHash(props.hash);

      if (hex) {
        setArrayBuffer(new Uint8Array(Buffer.from(hex, 'hex')).buffer);
      }
    })();
  }, [props.hash]);

  useEffect(() => {
    (async function () {
      if (!arrayBuffer) return;
      setConfig(await getPluginConfig(arrayBuffer));
    })();
  }, [arrayBuffer]);

  const onRemove = useCallback(() => {
    removePlugin(props.hash);
  }, [props.hash]);

  if (!config) return <></>;

  return (
    <div className="flex flex-row border rounded border-slate-300 p-2 gap-2 plugin-box">
      <img className="w-10 h-10" src={config.icon || DefaultPluginIcon} />
      <div className="flex flex-col w-full">
        <div className="font-bold flex flex-row h-6 items-center justify-between">
          {config.title}
          <Icon
            fa="fa-solid fa-xmark"
            className="flex flex-row items-center justify-center cursor-pointer text-red-500 bg-red-200 rounded-full p-1 w-5 h-5 plugin-box__remove-icon"
            onClick={onRemove}
          />
        </div>
        <div>{config.description}</div>
        <div className="flex flew-row justify-end mt-4">
          <button className="button">{config.cta}</button>
        </div>
      </div>
    </div>
  );
}
