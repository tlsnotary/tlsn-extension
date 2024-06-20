import React, { ReactElement, useCallback } from 'react';
import Icon from '../../components/Icon';
import logo from '../../assets/img/icon-128.png';
import { useSearchParams } from 'react-router-dom';
import { urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';

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
    <BaseApproval
      header={`Connecting to ${hostname}`}
      onSecondaryClick={onCancel}
      onPrimaryClick={onAccept}
    >
      <div className="flex flex-col items-center gap-2 py-8">
        {!!favIconUrl ? (
          <img
            src={favIconUrl}
            className="h-16 w-16 border border-slate-200 bg-slate-200 rounded-full"
            alt="logo"
          />
        ) : (
          <Icon
            fa="fa-solid fa-globe"
            size={4}
            className="h-16 w-16 rounded-full border border-slate-200 text-blue-500"
          />
        )}
        <div className="text-sm font-semibold">{hostname}</div>
      </div>
      <div className="text-lg font-bold text-center">Connect to this site?</div>
      <div className="text-sm px-8 text-center text-slate-500 flex-grow">
        Do you trust this site? By granting this permission, you're allowing
        this site to view your installed plugins, suggest requests to notarize,
        suggest plugins to install, ask you to share proofs metadata{' '}
        <i>(method, url, notary url, and proxy url)</i>, and ask to view a
        specific proof.
      </div>
    </BaseApproval>
  );
}
