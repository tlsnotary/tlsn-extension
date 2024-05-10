import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../entries/Background/rpc';

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
  console.log('adding plugin', hex);
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.add_plugin,
    data: hex,
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
