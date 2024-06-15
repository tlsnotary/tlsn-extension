import React, { ChangeEvent, ReactElement, useCallback, useState } from 'react';
import { makePlugin, getPluginConfig } from '../../utils/misc';
import { addPlugin } from '../../utils/rpc';
import Modal, {
  ModalHeader,
  ModalContent,
  ModalFooter,
} from '../../components/Modal/Modal';
import type { PluginConfig } from '../../utils/misc';
import './index.scss';
import logo from '../../assets/img/icon-128.png';
import { HostFunctionsDescriptions, MultipleParts } from '../../utils/plugins';

interface Request {
  url: string;
  method: string;
}

export default function PluginUploadInfo(): ReactElement {
  const [error, showError] = useState('');
  const [pluginBuffer, setPluginBuffer] = useState<ArrayBuffer | any>(null);
  const [pluginContent, setPluginContent] = useState<PluginConfig | null>(null);

  const onAddPlugin = useCallback(
    async (evt: React.MouseEvent<HTMLButtonElement>) => {
      try {
        await addPlugin(Buffer.from(pluginBuffer).toString('hex'));
        setPluginContent(null);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    },
    [pluginContent, pluginBuffer],
  );

  const onPluginInfo = useCallback(
    async (evt: ChangeEvent<HTMLInputElement>) => {
      if (!evt.target.files) return;
      try {
        const [file] = evt.target.files;
        const arrayBuffer = await file.arrayBuffer();
        const plugin = await makePlugin(arrayBuffer);
        setPluginContent(await getPluginConfig(plugin));
        setPluginBuffer(arrayBuffer);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    },
    [pluginContent, pluginBuffer],
  );

  const onClose = useCallback(() => {
    setPluginContent(null);
    setPluginBuffer(null);
  }, []);

  return (
    <>
      <input
        className="opacity-0 absolute top-0 right-0 h-full w-full cursor-pointer"
        type="file"
        onChange={onPluginInfo}
      />
      {pluginContent && (
        <Modal
          onClose={onClose}
          className="custom-modal !rounded-none flex items-center justify-center"
        >
          <ModalHeader className="w-full p-2 border-gray-200 text-gray-500">
            <div className="flex flex-row items-end justify-start gap-2">
              <img className="h-5" src={logo} alt="logo" />
              <span className="font-semibold">{`Installing ${pluginContent.title}`}</span>
            </div>
          </ModalHeader>
          <ModalContent className="flex flex-col items-center p-4 w-full flex-grow overflow-y-auto max-h-none gap-4">
            <img
              className="w-10 h-10"
              src={pluginContent.icon}
              alt="Plugin Icon"
            />
            <span className="text-3xl text-center">
              {`${pluginContent.title} wants access to your browser`}
            </span>
            <div className="flex flex-col border p-2 rounded-md gap-2">
              {pluginContent.hostFunctions?.map((hostFunction: string) => {
                const HFComponent = HostFunctionsDescriptions[hostFunction];
                return <HFComponent {...pluginContent} />;
              })}
              {pluginContent.cookies && (
                <span className="cursor-default">
                  <span className="mr-1">Access cookies from</span>
                  <MultipleParts parts={pluginContent.cookies} />
                </span>
              )}
              {pluginContent.headers && (
                <span className="cursor-default">
                  <span className="mr-1">Access headers from</span>
                  <MultipleParts parts={pluginContent.headers} />
                </span>
              )}
              {pluginContent.requests && (
                <span className="cursor-default">
                  <span className="mr-1">Submit network requests to</span>
                  <MultipleParts
                    parts={pluginContent?.requests.map(
                      ({ method, url }) => url,
                    )}
                  />
                </span>
              )}
            </div>
          </ModalContent>
          <ModalFooter className="flex justify-end gap-2 p-4">
            <button className="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button" onClick={onAddPlugin}>
              Allow
            </button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
