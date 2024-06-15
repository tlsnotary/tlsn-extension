import { PluginConfig } from './misc';
import React, { ReactElement, useEffect, useState } from 'react';
import { getNotaryApi } from './storage';

export const HostFunctionsDescriptions: {
  [key: string]: (pluginContent: PluginConfig) => ReactElement;
} = {
  redirect: () => {
    return <span>Redirect your current tab to any URL.</span>;
  },
  notarize: ({ notaryUrls }) => {
    const [notaryUrl, setNotaryUrl] = useState('');

    useEffect(() => {
      (async () => {
        setNotaryUrl(await getNotaryApi());
      })();
    }, []);

    const urls = [notaryUrl].concat(notaryUrls || []);

    return (
      <span className="cursor-default">
        <span className="mr-1">Submit notarization requests to</span>
        <MultipleParts parts={urls} />
      </span>
    );
  },
};

export function MultipleParts({ parts }: { parts: string[] }): ReactElement {
  const content = [];

  if (parts.length > 1) {
    for (let i = 0; i < parts.length; i++) {
      content.push(<span className="text-blue-500">{parts[i]}</span>);
      if (parts.length - i === 2) {
        content.push(<span className="inline-block mx-1">and</span>);
      } else if (parts.length - i > 1) {
        content.push(<span className="inline-block mr-1">,</span>);
      }
    }
  } else {
    content.push(<span className="text-blue-500">{parts[0]}</span>);
  }

  return <>{content}</>;
}
