import React, { ReactElement, useCallback, useEffect } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { safeParseJSON, urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { minimatch } from 'minimatch';
import { useAllProofHistory } from '../../reducers/history';
import classNames from 'classnames';

export function GetHistoryApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const method = params.get('method');
  const url = params.get('url');
  const rawMetadata = params.get('metadata');
  const metadata = safeParseJSON(rawMetadata);
  const hostname = urlify(origin || '')?.hostname;
  const proofs = useAllProofHistory();

  useEffect(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_prove_requests,
    });
  }, []);

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_history_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_history_response,
      data: true,
    });
  }, []);

  const result = proofs.filter((proof) => {
    let matchedMetadata = true;
    if (metadata) {
      matchedMetadata = Object.entries(
        metadata as { [k: string]: string },
      ).reduce((bool, [k, v]) => {
        try {
          return bool && minimatch(proof.metadata![k], v);
        } catch (e) {
          return false;
        }
      }, matchedMetadata);
    }

    return (
      minimatch(proof.method, method!, { nocase: true }) &&
      minimatch(proof.url, url!) &&
      matchedMetadata
    );
  });

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
          Do you want to share proof history with{' '}
          <b className="text-blue-500">{hostname}</b>?
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 text-sm px-8 text-center flex-grow">
        <div className="text-slate-500">
          All proofs matching the following patterns with be shared:
        </div>
        <table className="border border-collapse table-auto rounded text-xs w-full">
          <tbody>
            <tr>
              <td className="px-2 py-1 border border-slate-300 bg-slate-100 text-slate-500 align-top w-16 text-left">
                Method
              </td>
              <td className="px-2 py-1 border border-slate-300 font-semibold text-black font-mono text-left">
                {method?.toUpperCase()}
              </td>
            </tr>
            <tr className="">
              <td className="px-2 py-1 border border-slate-300 bg-slate-100 text-slate-500 align-top w-16 text-left">
                URL
              </td>
              <td className="px-2 py-1 border border-slate-300 font-semibold text-black font-mono break-all text-left">
                {url}
              </td>
            </tr>
            {rawMetadata && (
              <tr className="">
                <td className="px-2 py-1 border border-slate-300 bg-slate-100 text-slate-500 align-top w-16 text-left">
                  Metadata
                </td>
                <td className="px-2 py-1 border border-slate-300 font-semibold text-black font-mono break-all text-left">
                  {rawMetadata}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div
          className={classNames('border rounded font-semibold px-2 py-1', {
            'text-green-500 bg-green-200 border-green-300': result.length,
            'text-slate-500 bg-slate-200 border-slate-300': !result.length,
          })}
        >
          {result.length} results found
        </div>
      </div>
      <div className="text-xs px-8 pb-2 text-center text-slate-500">
        Only certain metadata will be shared with the app, such as <i>id</i>,{' '}
        <i>method</i>, <i>url</i>, <i>notary</i>, <i>proxy</i>, and{' '}
        <i>timestamp</i>.
      </div>
    </BaseApproval>
  );
}
