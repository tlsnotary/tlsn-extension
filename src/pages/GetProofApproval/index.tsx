import React, { ReactElement, useCallback, useEffect } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { OneRequestHistory } from '../History';

export function GetProofApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const id = params.get('id');
  const hostname = urlify(origin || '')?.hostname;

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_proof_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_proof_response,
      data: true,
    });
  }, []);

  return (
    <BaseApproval
      header="Requesting Proof History"
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
          Do you want to share proof data with{' '}
          <b className="text-blue-500">{hostname}</b>?
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 text-sm px-8 text-center flex-grow">
        <div className="text-slate-500">
          The following proof will be shared:
        </div>
        <OneRequestHistory
          className="w-full !cursor-default hover:bg-white text-xs"
          requestId={id!}
          hideActions={['share', 'delete', 'retry']}
        />
      </div>
    </BaseApproval>
  );
}
