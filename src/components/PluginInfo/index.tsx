import React, {
  ChangeEvent,
  ReactElement,
  useCallback,
  useState,
} from 'react';
import { makePlugin, getPluginConfig } from '../../utils/misc';
import { addPlugin } from '../../utils/rpc';
import Modal, {
  ModalHeader,
  ModalContent,
  ModalFooter,
} from '../../components/Modal/Modal';

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
    [pluginBuffer],
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
    [pluginContent, pluginBuffer],
  );

  return (
    <>
      <input
        className="opacity-0 absolute top-0 right-0 h-full w-full cursor-pointer"
        type="file"
        onChange={onPluginInfo}
      />
      {pluginInfo && (
        <Modal onClose={() => {}}>
          <ModalHeader>
            <div className="flex flex-row items-center gap-2">
              <img className="w-3 h-3" src={pluginContent.icon}></img>
              {pluginContent.title}
            </div>
            <div>{pluginContent.description}</div>
          </ModalHeader>
          <ModalContent className="p-2">
            <h1 className="pb-3 pt-3"><span className="font-bold">{pluginContent.title} </span>wants to access:</h1>
            <h1 className="font-bold">Host Functions:</h1>

            <div className="flex flex-col input border gap-2">
              {pluginContent.hostFunctions.map((hostFunction: string, index: React.Key) => (
                <div key={index}>{hostFunction}</div>
              ))}
            </div>
            <h1 className="font-bold">Cookies:</h1>
            <div className="flex flex-col input border gap-2">
              {pluginContent.cookies.map((cookies: string, index: React.Key) => (
                <div key={index}>{cookies}</div>
              ))}
            </div>
            <h1 className="font-bold">Headers:</h1>
            <div className="flex flex-col input border gap-2">
              {pluginContent.headers.map((headers: string, index: React.Key) => (
                <div key={index}>{headers}</div>
              ))}
            </div>
            <h1 className="font-bold">Requests:</h1>
          <div className="input border">
            {pluginContent.requests!.map((requests: Request, index: React.Key) => (
              <div key={index}>
                {requests.method} - {requests.url}
              </div>
            ))}
            </div>
          </ModalContent>
          <ModalFooter>
            <div className="flex flex-row gap-2">
            <button className="button" onClick={() => showPluginInfo(false)}>
              Cancel
            </button>
          <button className="button" onClick={onAddPlugin}>Accept</button>
            </div>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
