import React, { ReactElement } from 'react';
import { useActiveTab, useActiveTabUrl } from '../../reducers/requests';
import Icon from '../../components/Icon';
import { ModalHeader } from '../../components/Modal/Modal';
import logo from '../../assets/img/icon-128.png';

export function ConnectionApproval(): ReactElement {
  const activeTab = useActiveTab();
  const url = useActiveTabUrl();
  return (
    <div className="absolute flex flex-col items-center w-screen h-screen bg-white gap-2 overflow-y-auto cursor-default">
      <div className="w-full p-2 border-b border-gray-200 text-gray-500">
        <div className="flex flex-row items-end justify-start gap-2">
          <img className="h-5" src={logo} alt="logo" />
          <span className="font-semibold">{`Connecting to ${url?.hostname}`}</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 py-8">
        {!!activeTab?.favIconUrl ? (
          <img
            src={activeTab?.favIconUrl}
            className="h-16 w-16 rounded-full"
            alt="logo"
          />
        ) : (
          <Icon
            fa="fa-solid fa-globe"
            size={4}
            className="h-16 w-16 rounded-full text-blue-500"
          />
        )}
        <div className="text-sm font-semibold">{url?.hostname}</div>
      </div>
      <div className="text-lg font-bold">Connect to this site?</div>
      <div className="text-sm px-8 text-center text-slate-500 flex-grow">
        Do you trust this site? By granting this permission, you're allowing
        this site to view your installed plugins and proofs metadata{' '}
        <i>(method, url, and date)</i>, suggest requests to notarize, suggest
        plugins to install, and ask you to share a proof.
      </div>
      <div className="flex flex-row w-full gap-2 justify-end border-t p-4">
        <button className="button">Cancel</button>
        <button className="button button--primary">Connect</button>
      </div>
    </div>
  );
}
