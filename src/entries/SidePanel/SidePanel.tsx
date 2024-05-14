import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import './sidePanel.scss';
import browser from 'webextension-polyfill';
import {
  fetchPluginConfigByHash,
  getCookiesByHost,
  runPlugin,
} from '../../utils/rpc';
import { PluginConfig, StepConfig } from '../../utils/misc';
import { PluginList } from '../../components/PluginList';
import DefaultPluginIcon from '../../assets/img/default-plugin-icon.png';
import logo from '../../assets/img/icon-128.png';
import classNames from 'classnames';
import Icon from '../../components/Icon';

export default function SidePanel(): ReactElement {
  const [config, setConfig] = useState<PluginConfig | null>(null);
  const [hash, setHash] = useState('');

  useEffect(() => {
    (async function () {
      const result = await browser.storage.local.get('plugin_hash');
      const { plugin_hash } = result;
      const config = await fetchPluginConfigByHash(plugin_hash);
      setHash(plugin_hash);
      setConfig(config);
      // await browser.storage.local.set({ plugin_hash: '' });
    })();
  }, []);

  return (
    <div className="flex flex-col bg-slate-100 w-screen h-screen">
      <div className="flex flex-nowrap flex-shrink-0 flex-row items-center relative gap-2 h-9 p-2 cursor-default justify-center bg-slate-300 w-full">
        <img className="h-5" src={logo} alt="logo" />
      </div>
      {!config && <PluginList />}
      {config && <PluginBody hash={hash} config={config} />}
      {/*<PluginList />*/}
    </div>
  );
}

function PluginBody(props: {
  config: PluginConfig;
  hash: string;
}): ReactElement {
  const { hash } = props;
  const { title, description, icon, steps } = props.config;
  const [responses, setResponses] = useState<any[]>([]);

  const setResponse = useCallback(
    (response: any, i: number) => {
      const result = responses.concat();
      result[i] = response;
      setResponses(result);
    },
    [responses],
  );

  return (
    <div className="flex flex-col p-4">
      <div className="flex flex-row items-center gap-4">
        <img className="w-12 h-12 self-start" src={icon || DefaultPluginIcon} />
        <div className="flex flex-col w-full items-start">
          <div className="font-bold flex flex-row h-6 items-center justify-between w-full text-base">
            {title}
          </div>
          <div className="text-slate-500 text-sm">{description}</div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-8 mt-8">
        {steps?.map((step, i) => (
          <StepContent
            hash={hash}
            index={i}
            setResponse={setResponse}
            params={i > 0 ? responses[i - 1] : undefined}
            {...step}
          />
        ))}
      </div>
    </div>
  );
}

function StepContent(
  props: StepConfig & {
    hash: string;
    index: number;
    setResponse: (resp: any, i: number) => void;
    params?: any;
  },
): ReactElement {
  const { index, title, description, cta, action, hash, setResponse, params } =
    props;
  const [completed, setCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const processStep = useCallback(async () => {
    if (index > 0 && !params) return;

    setPending(true);
    try {
      setError('');
      const val = await runPlugin(hash, action, JSON.stringify(params));
      setCompleted(!!val);
      setResponse(val, index);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Unkonwn error');
    } finally {
      setPending(false);
    }
  }, [hash, action, index, params]);

  const onClick = useCallback(() => {
    if (pending || completed) return;
    processStep();
  }, [processStep, pending, completed]);

  useEffect(() => {
    processStep();
  }, [processStep]);

  return (
    <div className="flex flex-row gap-4 text-base w-full">
      <div className="text-slate-500 self-start">{index + 1}.</div>
      <div className="flex flex-col flex-grow flex-shrink w-0">
        <div
          className={classNames('font-semibold', {
            'line-through text-slate-500': completed,
          })}
        >
          {title}
        </div>
        {!!description && (
          <div className="text-slate-500 text-sm">{description}</div>
        )}
        {!!error && <div className="text-red-500 text-sm">{error}</div>}
        <button
          className={classNames('button mt-2 w-fit', {
            '!bg-green-200 !text-black cursor-default border border-green-500 rounded':
              completed,
          })}
          onClick={onClick}
        >
          <div className="flex flex-row flex-nowrap items-center gap-2">
            {pending ? (
              <Icon
                className="animate-spin"
                fa="fa-solid fa-spinner"
                size={1}
              />
            ) : completed ? (
              <Icon className="text-green-600" fa="fa-solid fa-check" />
            ) : null}
            <span className="text-sm">{completed ? 'DONE' : cta}</span>
          </div>
        </button>
      </div>
    </div>
  );
}
