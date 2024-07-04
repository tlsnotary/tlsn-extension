import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { type PluginConfig, PluginMetadata, urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { PluginPermissions } from '../../components/PluginInfo';
import {
  getPluginConfigByHash,
  getPluginMetadataByHash,
} from '../../entries/Background/db';
import { runPlugin } from '../../utils/rpc';

export function RunPluginApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const hash = params.get('hash');
  const hostname = urlify(origin || '')?.hostname;
  const [error, showError] = useState('');
  const [metadata, setPluginMetadata] = useState<PluginMetadata | null>(null);
  const [pluginContent, setPluginContent] = useState<PluginConfig | null>(null);

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.run_plugin_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(async () => {
    if (!hash) return;
    try {
      const tab = await browser.tabs.create({
        active: true,
      });

      await browser.storage.local.set({ plugin_hash: hash });

      // @ts-ignore
      if (chrome.sidePanel) await chrome.sidePanel.open({ tabId: tab.id });

      browser.runtime.sendMessage({
        type: BackgroundActiontype.run_plugin_response,
        data: true,
      });
    } catch (e: any) {
      showError(e.message);
    }
  }, [hash]);

  useEffect(() => {
    (async () => {
      if (!hash) return;
      try {
        const config = await getPluginConfigByHash(hash);
        const metadata = await getPluginMetadataByHash(hash);
        setPluginContent(config);
        setPluginMetadata(metadata);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    })();
  }, [hash]);

  return (
    <BaseApproval
      header={`Execute Plugin`}
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
          <b className="text-blue-500">{hostname}</b> wants to execute a plugin:
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
        <div className="flex flex-col gap-4 border border-slate-300 p-4 mx-8 rounded bg-slate-100">
          <div className="flex flex-col items-center">
            <img
              className="w-12 h-12 mb-2"
              src={pluginContent.icon}
              alt="Plugin Icon"
            />
            <span className="text-2xl text-blue-600 font-semibold">
              {pluginContent.title}
            </span>
            <div className="text-slate-500 text-base">
              {pluginContent.description}
            </div>
          </div>
        </div>
      )}
    </BaseApproval>
  );
}
