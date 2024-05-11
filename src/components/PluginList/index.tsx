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
import { getPluginConfigByHash } from '../../entries/Background/db';

export function PluginList(props: { className?: string }): ReactElement {
  const hashes = usePluginHashes();

  useEffect(() => {
    fetchPluginHashes();
  }, []);

  console.log(hashes);
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
  const [config, setConfig] = useState<PluginConfig | null>(null);

  const onClick = useCallback(async () => {
    if (!config) return;
  }, [config]);

  useEffect(() => {
    (async function () {
      setConfig(await getPluginConfigByHash(props.hash));
    })();
  }, [props.hash]);

  const onRemove = useCallback(() => {
    removePlugin(props.hash);
  }, [props.hash]);

  if (!config) return <></>;

  return (
    <button
      className={classNames(
        'flex flex-row border rounded border-slate-300 p-2 gap-2 plugin-box',
        'cursor-pointer hover:bg-slate-100 hover:border-slate-400 active:bg-slate-200',
      )}
      onClick={onClick}
    >
      <img className="w-12 h-12" src={config.icon || DefaultPluginIcon} />
      <div className="flex flex-col w-full items-start">
        <div className="font-bold flex flex-row h-6 items-center justify-between w-full">
          {config.title}
          <Icon
            fa="fa-solid fa-xmark"
            className="flex flex-row items-center justify-center cursor-pointer text-red-500 bg-red-200 rounded-full plugin-box__remove-icon"
            onClick={onRemove}
          />
        </div>
        <div>{config.description}</div>
      </div>
    </button>
  );
}
