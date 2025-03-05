import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import './sidePanel.scss';
import browser from 'webextension-polyfill';
import {
  getPluginConfig,
  hexToArrayBuffer,
  makePlugin,
  PluginConfig,
  StepConfig,
} from '../../utils/misc';
import DefaultPluginIcon from '../../assets/img/default-plugin-icon.png';
import logo from '../../assets/img/icon-128.png';
import classNames from 'classnames';
import Icon from '../../components/Icon';
import { useRequestHistory } from '../../reducers/history';
import {
  BackgroundActiontype,
  progressText,
  RequestProgress,
} from '../Background/rpc';
import { getPluginByHash, getPluginConfigByHash } from '../Background/db';
import { SidePanelActionTypes } from './types';
import { fetchP2PState, useClientId } from '../../reducers/p2p';

export default function SidePanel(): ReactElement {
  const [config, setConfig] = useState<PluginConfig | null>(null);
  const [hash, setHash] = useState('');
  const [hex, setHex] = useState('');
  const [p2p, setP2P] = useState(false);
  const [started, setStarted] = useState(false);
  const clientId = useClientId();

  useEffect(() => {
    fetchP2PState();
    browser.runtime.sendMessage({
      type: SidePanelActionTypes.panel_opened,
    });
  }, []);

  useEffect(() => {
    browser.runtime.onMessage.addListener(async (request) => {
      const { type, data } = request;

      switch (type) {
        case SidePanelActionTypes.execute_plugin_request: {
          setConfig(await getPluginConfigByHash(data.pluginHash));
          setHash(data.pluginHash);
          setStarted(true);
          break;
        }
        case SidePanelActionTypes.run_p2p_plugin_request: {
          const { pluginHash, plugin } = data;
          const config =
            (await getPluginConfigByHash(pluginHash)) ||
            (await getPluginConfig(hexToArrayBuffer(plugin)));

          setHash(pluginHash);
          setHex(plugin);
          setP2P(true);
          setConfig(config);
          break;
        }
        case SidePanelActionTypes.start_p2p_plugin: {
          setStarted(true);
          break;
        }
      }
    });
  }, []);

  return (
    <div className="flex flex-col bg-slate-100 w-screen h-screen">
      <div className="relative flex flex-nowrap flex-shrink-0 flex-row items-center gap-2 h-9 p-2 cursor-default justify-center bg-slate-300 w-full">
        <img className="h-5" src={logo} alt="logo" />
        <button
          className="button absolute right-2"
          onClick={() => window.close()}
        >
          Close
        </button>
      </div>
      {/*{!config && <PluginList />}*/}
      {started && config && (
        <PluginBody
          hash={hash}
          hex={hex}
          config={config}
          p2p={p2p}
          clientId={clientId}
        />
      )}
    </div>
  );
}

function PluginBody(props: {
  config: PluginConfig;
  hash: string;
  hex?: string;
  clientId?: string;
  p2p?: boolean;
}): ReactElement {
  const { hash, hex, config, p2p, clientId } = props;
  const { title, description, icon, steps } = config;
  const [responses, setResponses] = useState<any[]>([]);
  const [notarizationId, setNotarizationId] = useState('');
  const notaryRequest = useRequestHistory(notarizationId);

  const setResponse = useCallback(
    (response: any, i: number) => {
      const result = responses.concat();
      result[i] = response;
      setResponses(result);
      if (i === steps!.length - 1 && !!response) {
        setNotarizationId(response);
      }
    },
    [hash, responses],
  );

  useEffect(() => {
    if (notaryRequest?.status === 'success') {
      browser.runtime.sendMessage({
        type: SidePanelActionTypes.execute_plugin_response,
        data: {
          hash,
          proof: notaryRequest.proof,
        },
      });
    } else if (notaryRequest?.status === 'error') {
      browser.runtime.sendMessage({
        type: SidePanelActionTypes.execute_plugin_response,
        data: {
          hash,
          error: notaryRequest.error,
        },
      });
    }
  }, [hash, notaryRequest?.status]);

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
            key={i}
            hash={hash}
            config={config}
            hex={hex}
            index={i}
            setResponse={setResponse}
            lastResponse={i > 0 ? responses[i - 1] : undefined}
            responses={responses}
            p2p={p2p}
            clientId={clientId}
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
    hex?: string;
    clientId?: string;
    index: number;
    setResponse: (resp: any, i: number) => void;
    responses: any[];
    lastResponse?: any;
    config: PluginConfig;
    p2p?: boolean;
  },
): ReactElement {
  const {
    index,
    title,
    description,
    cta,
    action,
    setResponse,
    lastResponse,
    prover,
    hash,
    hex: _hex,
    config,
    p2p = false,
    clientId = '',
  } = props;
  const [completed, setCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notarizationId, setNotarizationId] = useState('');
  const notaryRequest = useRequestHistory(notarizationId);

  const getPlugin = useCallback(async () => {
    const hex = (await getPluginByHash(hash)) || _hex;
    const arrayBuffer = hexToArrayBuffer(hex!);
    return makePlugin(arrayBuffer, config, { p2p, clientId });
  }, [hash, _hex, config, p2p, clientId]);

  const processStep = useCallback(async () => {
    const plugin = await getPlugin();
    if (!plugin) return;
    if (index > 0 && !lastResponse) return;

    setPending(true);
    setError('');

    try {
      const out = await plugin.call(action, JSON.stringify(lastResponse));
      const val = JSON.parse(out.string());
      if (val && prover) {
        setNotarizationId(val);
      } else {
        setCompleted(!!val);
      }
      setResponse(val, index);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Unkonwn error');
    } finally {
      setPending(false);
    }
  }, [action, index, lastResponse, prover, getPlugin]);

  const onClick = useCallback(() => {
    if (
      pending ||
      completed ||
      notaryRequest?.status === 'pending' ||
      notaryRequest?.status === 'success'
    )
      return;
    processStep();
  }, [processStep, pending, completed, notaryRequest]);

  const viewProofInPopup = useCallback(async () => {
    if (!notaryRequest) return;
    chrome.runtime.sendMessage<any, string>({
      type: BackgroundActiontype.verify_prove_request,
      data: notaryRequest,
    });
    await browser.runtime.sendMessage({
      type: BackgroundActiontype.open_popup,
      data: {
        position: {
          left: window.screen.width / 2 - 240,
          top: window.screen.height / 2 - 300,
        },
        route: `/verify/${notaryRequest.id}`,
      },
    });
  }, [notaryRequest, notarizationId]);

  const viewP2P = useCallback(async () => {
    await browser.runtime.sendMessage({
      type: BackgroundActiontype.open_popup,
      data: {
        position: {
          left: window.screen.width / 2 - 240,
          top: window.screen.height / 2 - 300,
        },
        route: `/p2p`,
      },
    });
  }, []);

  useEffect(() => {
    processStep();
  }, [processStep]);

  let btnContent = null;

  if (prover && p2p) {
    btnContent = (
      <button
        className={classNames(
          'button button--primary mt-2 w-fit flex flex-row flex-nowrap items-center gap-2',
        )}
        onClick={viewP2P}
      >
        <span className="text-sm">View in P2P</span>
      </button>
    );
  } else if (completed) {
    btnContent = (
      <button
        className={classNames(
          'button mt-2 w-fit flex flex-row flex-nowrap items-center gap-2',
          '!bg-green-200 !text-black cursor-default border border-green-500 rounded',
        )}
      >
        <Icon className="text-green-600" fa="fa-solid fa-check" />
        <span className="text-sm">DONE</span>
      </button>
    );
  } else if (notaryRequest?.status === 'success') {
    btnContent = (
      <button
        className={classNames(
          'button button--primary mt-2 w-fit flex flex-row flex-nowrap items-center gap-2',
        )}
        onClick={viewProofInPopup}
      >
        <span className="text-sm">View</span>
      </button>
    );
  } else if (notaryRequest?.status === 'pending' || pending || notarizationId) {
    btnContent = (
      <button className="button mt-2 w-fit flex flex-row flex-nowrap items-center gap-2 cursor-default">
        <Icon className="animate-spin" fa="fa-solid fa-spinner" size={1} />
        <span className="text-sm">
          {notaryRequest?.progress === RequestProgress.Error
            ? `${progressText(notaryRequest.progress, notaryRequest?.errorMessage)}`
            : notaryRequest?.progress
              ? `(${(
                  ((notaryRequest.progress + 1) / 6.06) *
                  100
                ).toFixed()}%) ${progressText(notaryRequest.progress)}`
              : 'Pending...'}
        </span>
      </button>
    );
  } else {
    btnContent = (
      <button
        className={classNames(
          'button mt-2 w-fit flex flex-row flex-nowrap items-center gap-2',
        )}
        disabled={index > 0 && typeof lastResponse === 'undefined'}
        onClick={onClick}
      >
        <span className="text-sm">{cta}</span>
      </button>
    );
  }

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
        {btnContent}
      </div>
    </div>
  );
}
