import React, {
  ChangeEvent,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  addPlugin,
  fetchPluginHashes,
  fetchPluginByHash,
} from '../../utils/rpc';
import { usePluginHashes } from '../../reducers/plugins';
import createPlugin, { CallContext } from '@extism/extism';
import { notarizeRequest } from '../../reducers/requests';

export function PluginList(): ReactElement {
  const hashes = usePluginHashes();

  const onChange = useCallback(async (evt: ChangeEvent<HTMLInputElement>) => {
    if (!evt.target.files) return;
    const [file] = evt.target.files;
    const arrayBuffer = await file.arrayBuffer();
    await addPlugin(Buffer.from(arrayBuffer).toString('hex'));
  }, []);

  useEffect(() => {
    fetchPluginHashes();
  }, []);

  return (
    <div className="flex flex-col flex-nowrap">
      {!hashes.length && (
        <div className="flex flex-col items-center justify-center text-slate-400 cursor-default select-none">
          <div>No available plugins</div>
        </div>
      )}
      <a className="relative">
        <input
          className="opacity-0 absolute top-0 right-0 h-full w-full"
          type="file"
          onChange={onChange}
        />
        Add a plugin
      </a>
      {hashes.map((hash) => (
        <Plugin key={hash} hash={hash} />
      ))}
    </div>
  );
}

export function Plugin(props: { hash: string }): ReactElement {
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    (async function () {
      const hex = await fetchPluginByHash(props.hash);

      if (hex) {
        setArrayBuffer(new Uint8Array(Buffer.from(hex, 'hex')).buffer);
      }
    })();
  }, []);

  useEffect(() => {
    (async function () {
      if (!arrayBuffer) return;

      const module = await WebAssembly.compile(arrayBuffer);
      const pluginConfig = {
        useWasi: true,
        config: {},
        functions: {
          'extism:host/user': {
            get_response: (context: CallContext, off: bigint) => {
              // const r = context.read(off);
              // const param = r.text();
              // const proverConfig = JSON.parse(param);
              // console.log('proving...', proverConfig);
              // dispatch(
              //   // @ts-ignore
              //   notarizeRequest(proverConfig),
              // );
              return context.store('yo');
            },
            has_request_uri: (context: CallContext, off: bigint) => {
              // const r = context.read(off);
              // const requestUri = r.text();
              // const req = requests.filter((req) =>
              //   req.url.includes(requestUri),
              // )[0];
              // return context.store(req ? JSON.stringify(req) : 'undefined');
              return context.store('yo');
            },
          },
        },
      };
      const plugin = await createPlugin(module, pluginConfig);
      const out = await plugin.call('config');
      console.log(out.string());
    })();
  }, [arrayBuffer]);

  return <div>{props.hash}</div>;
}
