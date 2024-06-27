import React, { ReactElement, useCallback, useState } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { RedactBodyTextarea, RevealHeaderTable } from '../Notarize';

export function NotarizeApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const config = JSON.parse(params.get('config')!);
  const hostname = urlify(origin || '')?.hostname;
  const [step, setStep] = useState<'overview' | 'headers' | 'response'>(
    'overview',
  );
  const [revealed, setRevealed] = useState<{ [key: string]: boolean }>({});
  const [secretResps, setSecretResps] = useState<string[]>([]);

  const headerList = Object.entries(config.headers || {}).map(
    ([name, value]) => ({
      name,
      value: String(value),
    }),
  );

  const onCancel = useCallback(() => {
    if (step === 'headers') return setStep('overview');
    if (step === 'response') return setStep('headers');

    browser.runtime.sendMessage({
      type: BackgroundActiontype.notarize_response,
      data: false,
    });
  }, [step]);

  const onAccept = useCallback(() => {
    if (step === 'overview') return setStep('headers');
    if (step === 'headers') return setStep('response');

    const secretHeaders = headerList
      .map((h) => {
        if (!revealed[h.name]) {
          return `${h.name.toLowerCase()}: ${h.value || ''}` || '';
        }
        return '';
      })
      .filter((d) => !!d);

    browser.runtime.sendMessage({
      type: BackgroundActiontype.notarize_response,
      data: {
        ...config,
        secretHeaders,
        secretResps,
      },
    });
  }, [revealed, step, secretResps, config]);

  let body, headerText, primaryCta, secondaryCta;

  switch (step) {
    case 'overview':
      headerText = 'Notarizing Request';
      primaryCta = 'Next';
      secondaryCta = 'Cancel';
      body = (
        <>
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
              <b className="text-blue-500">{hostname}</b> wants to notarize the
              following request:
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 text-sm px-8 text-center flex-grow break-all">
            <div className="flex flex-row items-center w-full">
              <div className="flex flex-row items-center border border-slate-300 bg-slate-100 px-2 rounded-l text-slate-500 font-semibold h-8">
                {config.method?.toUpperCase()}
              </div>
              <input
                className="outline-0 border border-slate-300 bg-slate-50 px-2 border-l-0 rounded-r flex-grow cursor-default h-8 text-slate-800"
                type="text"
                value={config.url}
              />
            </div>
          </div>
          <div className="text-xs px-8 pb-2 text-center text-slate-500">
            You will be able to review and redact headers and response body.
          </div>
        </>
      );
      break;
    case 'headers':
      headerText = 'Step 1 of 2: Select headers to reveal';
      primaryCta = 'Next';
      secondaryCta = 'Back';
      body = (
        <div className="px-2 flex flex-col">
          <RevealHeaderTable
            className="w-full"
            onChange={setRevealed}
            headers={headerList}
          />
        </div>
      );
      break;
    case 'response':
      headerText = 'Step 2 of 2: Highlight response to keep';
      primaryCta = 'Notarize';
      secondaryCta = 'Back';
      body = (
        <div className="px-2 flex flex-col flex-grow">
          <RedactBodyTextarea
            className="w-full "
            onChange={setSecretResps}
            request={{
              url: config.url,
              method: config.method,
              headers: config.headers,
              body: config.body,
              formData: config.formData,
            }}
          />
        </div>
      );
      break;
  }

  return (
    <BaseApproval
      header={headerText}
      onSecondaryClick={onCancel}
      onPrimaryClick={onAccept}
      primaryCTAText={primaryCta}
      secondaryCTAText={secondaryCta}
    >
      {body}
    </BaseApproval>
  );
}
