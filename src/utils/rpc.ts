import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../entries/Background/rpc';
import { PluginConfig } from './misc';

export async function getCookiesByHost(hostname: string) {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.get_cookies_by_hostname,
    data: hostname,
  });
}

export async function getHeadersByHost(hostname: string) {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.get_headers_by_hostname,
    data: hostname,
  });
}

export async function addPlugin(hex: string) {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.add_plugin,
    data: hex,
  });
}

export async function removePlugin(hash: string) {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.remove_plugin,
    data: hash,
  });
}

export async function fetchPluginHashes() {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.get_plugin_hashes,
  });
}

export async function fetchPluginByHash(hash: string) {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.get_plugin_by_hash,
    data: hash,
  });
}

export async function fetchPluginConfigByHash(
  hash: string,
): Promise<PluginConfig | null> {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.get_plugin_config_by_hash,
    data: hash,
  });
}
