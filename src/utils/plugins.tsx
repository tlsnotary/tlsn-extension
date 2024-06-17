import { PluginConfig } from './misc';
import React, { ReactElement, ReactNode } from 'react';
import Icon from '../components/Icon';

export const HostFunctionsDescriptions: {
  [key: string]: (pluginContent: PluginConfig) => ReactElement;
} = {
  redirect: () => {
    return (
      <PermissionDescription fa="fa-solid fa-diamond-turn-right">
        <span>Redirect your current tab to any URL</span>
      </PermissionDescription>
    );
  },
  notarize: ({ notaryUrls, proxyUrls }) => {
    const notaries = ['default notary'].concat(notaryUrls || []);
    const proxies = ['default proxy'].concat(proxyUrls || []);

    return (
      <>
        <PermissionDescription fa="fa-solid fa-route">
          <span className="cursor-default">
            <span className="mr-1">Proxy notarization requests thru</span>
            <MultipleParts parts={proxies} />
          </span>
        </PermissionDescription>
        <PermissionDescription fa="fa-solid fa-stamp">
          <span className="cursor-default">
            <span className="mr-1">Submit notarization requests to</span>
            <MultipleParts parts={notaries} />
          </span>
        </PermissionDescription>
      </>
    );
  },
};

export function PermissionDescription({
  fa,
  children,
}: {
  fa: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-row gap-4 items-start cursor-default">
      <Icon className="" size={1.6125} fa={fa} />
      <div className="text-sm mt-[0.125rem]">{children}</div>
    </div>
  );
}

export function MultipleParts({ parts }: { parts: string[] }): ReactElement {
  const content = [];

  if (parts.length > 1) {
    for (let i = 0; i < parts.length; i++) {
      content.push(
        <span key={i} className="text-blue-600">
          {parts[i]}
        </span>,
      );

      if (parts.length - i === 2) {
        content.push(
          <span key={i + 'separator'} className="inline-block mx-1">
            and
          </span>,
        );
      } else if (parts.length - i > 1) {
        content.push(
          <span key={i + 'separator'} className="inline-block mr-1">
            ,
          </span>,
        );
      }
    }
  } else {
    content.push(
      <span key={0} className="text-blue-600">
        {parts[0]}
      </span>,
    );
  }

  return <>{content}</>;
}
