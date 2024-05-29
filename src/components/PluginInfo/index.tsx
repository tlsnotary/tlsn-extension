import React, { ChangeEvent, ReactElement, useCallback, useState } from 'react';
import { makePlugin, getPluginConfig } from '../../utils/misc';
import { addPlugin } from '../../utils/rpc';
import Modal, {
  ModalHeader,
  ModalContent,
  ModalFooter,
} from '../../components/Modal/Modal';
import './index.scss';

export default function PluginUploadInfo(): ReactElement {
  const [error, showError] = useState('');
  const [pluginInfo, showPluginInfo] = useState(false);
  const [pluginBuffer, setPluginBuffer] = useState<any>(null);
  const [pluginContent, setPluginContent] = useState<any>(null);

  interface Request {
    url: string;
    method: string;
  }

  const onAddPlugin = useCallback(
    async (evt: React.MouseEvent<HTMLButtonElement>) => {
      try {
        await addPlugin(Buffer.from(pluginBuffer || '').toString('hex'));
        showPluginInfo(false);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    },
    [pluginContent, pluginBuffer, pluginInfo],
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
        showPluginInfo(true);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    },
    [pluginContent, pluginBuffer, pluginInfo],
  );

  const onClose = useCallback(() => {
    setPluginContent(null);
    setPluginBuffer(null);
    showPluginInfo(false);
  }, [pluginContent, pluginBuffer, pluginInfo]);

  return (
    <>
      <input
        className="opacity-0 absolute top-0 right-0 h-full w-full cursor-pointer"
        type="file"
        onChange={onPluginInfo}
      />
      {pluginInfo && (
        <Modal
          onClose={() => {}}
          className="custom-modal flex items-center justify-center p2"
        >
          <div className="w-full h-full flex flex-col">
            <ModalHeader>
              <div className="flex flex-col gap-2">
                <div className="flex flex-row items-center gap-2">
                  <img
                    className="w-5 h-5"
                    src={pluginContent.icon}
                    alt="Plugin Icon"
                  />
                  <span className="text-lg font-semibold">
                    {pluginContent.title}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {pluginContent.description}
                </div>
              </div>
            </ModalHeader>
            <ModalContent className="custom-modal-content p-2 space-y-2 flex-grow overflow-y-auto">
              <div>
                <h1 className="text-lg font-semibold">
                  {pluginContent.title} wants to access:
                </h1>
              </div>
              <div>
                <h1 className="font-semibold">Host Functions:</h1>
                <div className="flex flex-col border p-2 rounded-md gap-2">
                  {pluginContent.hostFunctions!.map(
                    (hostFunction: string, index: React.Key) => (
                      <div key={index} className="text-sm">
                        {hostFunction}
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div>
                <h1 className="font-semibold">Cookies:</h1>
                <div className="flex flex-col border p-2 rounded-md gap-2">
                  {pluginContent.cookies!.map(
                    (cookies: string, index: React.Key) => (
                      <div key={index} className="text-sm">
                        {cookies}
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div>
                <h1 className="font-semibold">Headers:</h1>
                <div className="flex flex-col border p-2 rounded-md gap-2">
                  {pluginContent.headers!.map(
                    (headers: string, index: React.Key) => (
                      <div key={index} className="text-sm">
                        {headers}
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div>
                <h1 className="font-semibold">Requests:</h1>
                <div className="border p-2 rounded-md">
                  {pluginContent.requests!.map(
                    (requests: Request, index: React.Key) => (
                      <div key={index} className="text-sm">
                        <span className="font-medium">{requests.method}</span> -{' '}
                        {requests.url}
                      </div>
                    ),
                  )}
                </div>
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
          </div>
        </Modal>
      )}
    </>
  );
}
