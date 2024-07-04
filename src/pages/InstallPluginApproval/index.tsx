import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import {
  getPluginConfig,
  makePlugin,
  type PluginConfig,
  urlify,
} from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { PluginPermissions } from '../../components/PluginInfo';

export function InstallPluginApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const url = params.get('url');
  const rawMetadata = params.get('metadata');
  const hostname = urlify(origin || '')?.hostname;

  const [error, showError] = useState('');
  const [pluginBuffer, setPluginBuffer] = useState<ArrayBuffer | any>(null);
  const [pluginContent, setPluginContent] = useState<PluginConfig | null>(null);

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.install_plugin_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.install_plugin_response,
      data: true,
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(url!);
        const arrayBuffer = await resp.arrayBuffer();
        const plugin = await makePlugin(arrayBuffer);
        setPluginContent(await getPluginConfig(plugin));
        setPluginBuffer(arrayBuffer);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    })();
  }, [url]);

  return (
    <BaseApproval
      header={`Installing Plugin`}
      onSecondaryClick={onCancel}
      onPrimaryClick={onAccept}
    >
      <div className="flex flex-col items-center gap-2 py-8">
        {!!favIconUrl ? (
          <img
            src={favIconUrl}
            className="h-16 w-16 rounded-full border border-slate-200 bg-slate-200"
            alt="logo"
          />
        ) : (
          <Icon
            fa="fa-solid fa-globe"
            size={4}
            className="h-16 w-16 rounded-full border border-slate-200 text-blue-500"
          />
        )}
        <div className="text-2xl text-center px-8">
          <b className="text-blue-500">{hostname}</b> wants to install a plugin:
        </div>
      </div>
      {!pluginContent && (
        <div className="flex flex-col items-center flex-grow gap-4 border border-slate-300 p-8 mx-8 rounded bg-slate-100">
          <Icon
            className="animate-spin w-fit text-slate-500"
            fa="fa-solid fa-spinner"
            size={1}
          />
        </div>
      )}
      {pluginContent && (
        <div className="flex flex-col flex-grow gap-4 border border-slate-300 p-8 mx-8 rounded bg-slate-100">
          <div className="flex flex-col items-center">
            <img
              className="w-12 h-12 mb-2"
              src={pluginContent.icon}
              alt="Plugin Icon"
            />
            <span className="text-3xl text-blue-600 font-semibold">
              {pluginContent.title}
            </span>
            <div className="text-slate-500 text-lg">
              {pluginContent.description}
            </div>
          </div>
          <PluginPermissions className="w-full" pluginContent={pluginContent} />
        </div>
      )}
    </BaseApproval>
  );
}
