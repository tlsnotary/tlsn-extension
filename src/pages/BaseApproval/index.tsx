import React, { ReactElement, ReactNode, useCallback } from 'react';
import Icon from '../../components/Icon';
import logo from '../../assets/img/icon-128.png';
import { useSearchParams } from 'react-router-dom';
import { urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';

export function BaseApproval({
  onSecondaryClick,
  onPrimaryClick,
  header,
  children,
  secondaryCTAText = 'Cancel',
  primaryCTAText = 'Accept',
}: {
  header: ReactNode;
  children: ReactNode;
  onSecondaryClick: () => void;
  onPrimaryClick: () => void;
  secondaryCTAText?: string;
  primaryCTAText?: string;
}): ReactElement {
  return (
    <div className="absolute flex flex-col items-center w-screen h-screen bg-white gap-2 cursor-default">
      <div className="w-full p-2 border-b border-gray-200 text-gray-500">
        <div className="flex flex-row items-end justify-start gap-2">
          <img className="h-5" src={logo} alt="logo" />
          <span className="font-semibold">{header}</span>
        </div>
      </div>
      <div className="flex flex-col flex-grow gap-2 overflow-y-auto">
        {children}
      </div>
      <div className="flex flex-row w-full gap-2 justify-end border-t p-4">
        {!!onSecondaryClick && !!secondaryCTAText && (
          <button className="button" onClick={onSecondaryClick}>
            {secondaryCTAText}
          </button>
        )}
        {!!onPrimaryClick && !!primaryCTAText && (
          <button className="button button--primary" onClick={onPrimaryClick}>
            {primaryCTAText}
          </button>
        )}
      </div>
    </div>
  );
}
