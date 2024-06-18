import React, { ReactElement, useCallback } from 'react';
import Icon from '../../components/Icon';
import logo from '../../assets/img/icon-128.png';
import { useSearchParams } from 'react-router-dom';
import { urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';

export function ConnectionApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const hostname = urlify(origin || '')?.hostname;

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.connect_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.connect_response,
      data: true,
    });
  }, []);

  return (
    <div className="absolute flex flex-col items-center w-screen h-screen bg-white gap-2 overflow-y-auto cursor-default">
      <div className="w-full p-2 border-b border-gray-200 text-gray-500">
        <div className="flex flex-row items-end justify-start gap-2">
          <img className="h-5" src={logo} alt="logo" />
          <span className="font-semibold">{`Connecting to ${hostname}`}</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 py-8">
        {!!favIconUrl ? (
          <img src={favIconUrl} className="h-16 w-16 rounded-full" alt="logo" />
        ) : (
          <Icon
            fa="fa-solid fa-globe"
            size={4}
            className="h-16 w-16 rounded-full text-blue-500"
          />
        )}
        <div className="text-sm font-semibold">{hostname}</div>
      </div>
      <div className="text-lg font-bold">Connect to this site?</div>
      <div className="text-sm px-8 text-center text-slate-500 flex-grow">
        Do you trust this site? By granting this permission, you're allowing
        this site to view your installed plugins and proofs metadata{' '}
        <i>(method, url, notary url, and proxy url)</i>, suggest requests to
        notarize, suggest plugins to install, and ask you to share a proof.
      </div>
      <div className="flex flex-row w-full gap-2 justify-end border-t p-4">
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button--primary" onClick={onAccept}>
          Connect
        </button>
      </div>
    </div>
  );
}
