import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { safeParseJSON, urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { getPlugins } from '../../entries/Background/db';
import { minimatch } from 'minimatch';
import classNames from 'classnames';

export function GetPluginsApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const url = params.get('url');
  const filterOrigin = params.get('filterOrigin');
  const rawMetadata = params.get('metadata');
  const filterMetadata = safeParseJSON(rawMetadata);
  const hostname = urlify(origin || '')?.hostname;
  const [result, setResult] = useState<any[]>([]);

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_plugins_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_plugins_response,
      data: true,
    });
  }, []);

  useEffect(() => {
    (async () => {
      const response = await getPlugins();
      const res = response.filter(({ metadata }) => {
        let matchedMetadata = true;
        if (filterMetadata) {
          matchedMetadata = Object.entries(
            filterMetadata as { [k: string]: string },
          ).reduce((bool, [k, v]) => {
            try {
              return bool && minimatch(metadata![k], v);
            } catch (e) {
              return false;
            }
          }, matchedMetadata);
        }
        return (
          minimatch(metadata.filePath, url || '**') &&
          minimatch(metadata.origin, filterOrigin || '**') &&
          matchedMetadata
        );
      });
      setResult(res);
    })();
  }, [url, filterMetadata]);

  return (
    <BaseApproval
      header="Requesting Plugins"
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
          Do you want to share installed plugins with{' '}
          <b className="text-blue-500">{hostname}</b>?
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 text-sm px-8 text-center flex-grow">
        <div className="text-slate-500">
          All plugins matching the following patterns with be shared:
        </div>
        <table className="border border-collapse table-auto rounded text-xs w-full">
          <tbody>
            <tr className="">
              <td className="px-2 py-1 border border-slate-300 bg-slate-100 text-slate-500 align-top w-16 text-left">
                URL
              </td>
              <td className="px-2 py-1 border border-slate-300 font-semibold text-black font-mono break-all text-left">
                {url}
              </td>
            </tr>
            <tr className="">
              <td className="px-2 py-1 border border-slate-300 bg-slate-100 text-slate-500 align-top w-16 text-left">
                Origin
              </td>
              <td className="px-2 py-1 border border-slate-300 font-semibold text-black font-mono break-all text-left">
                {filterOrigin}
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
