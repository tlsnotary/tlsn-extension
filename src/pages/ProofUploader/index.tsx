import React, {
  ReactElement,
  useState,
  useCallback,
  ChangeEventHandler,
} from 'react';
import Icon from '../../components/Icon';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import ProofViewer from '../ProofViewer';
import { convertNotaryWsToHttp } from '../../utils/misc';

export default function ProofUploader(): ReactElement {
  const [proof, setProof] = useState<{
    recv: string;
    sent: string;
    verifierKey?: string;
    notaryKey?: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [metadata, setMetaData] = useState<any>({ meta: '', version: '' });
  const onFileUpload: ChangeEventHandler<HTMLInputElement> = useCallback(
    async (e) => {
      // @ts-ignore
      const [file] = e.target.files || [];

      if (file) {
        const reader = new FileReader();
        reader.addEventListener('load', async (event) => {
          const result = event.target?.result;
          if (result) {
            const proof = JSON.parse(result as string);
            const notaryUrl = convertNotaryWsToHttp(proof.meta.notaryUrl);
            proof.meta.notaryUrl = notaryUrl;
            setMetaData({ meta: proof.meta, version: proof.version });
            const res = await chrome.runtime
              .sendMessage<
                any,
                {
                  recv: string;
                  sent: string;
                  verifierKey?: string;
                  notaryKey?: string;
                }
              >({
                type: BackgroundActiontype.verify_proof,
                data: proof,
              })
              .catch(() => null);

            if (proof) {
              setUploading(false);
              setProof(res);
            }
          }
        });

        setUploading(true);
        reader.readAsText(file);
      }
    },
    [],
  );

  if (proof) {
    return (
      <ProofViewer
        recv={proof.recv}
        sent={proof.sent}
        verifierKey={proof.verifierKey}
        notaryKey={proof.notaryKey}
        info={metadata}
      />
    );
  }

  return (
    <div className="flex flex-col flex-nowrap flex-grow flex-shrink h-0 overflow-y-auto">
      <div className="flex flex-col items-center justify-center relative border-slate-400 border-2 text-slate-500 border-dashed flex-grow flex-shrink h-0 m-2 bg-slate-200">
        <input
          type="file"
          className="absolute w-full h-full top-0 left-0 opacity-0 z-10"
          onChange={onFileUpload}
          accept=".json"
          disabled={uploading}
        />
        {uploading ? (
          <Icon className="animate-spin" fa="fa-solid fa-spinner" size={2} />
        ) : (
          <>
            <Icon className="mb-4" fa="fa-solid fa-upload" size={2} />
            <div className="text-lg">Drop your proof here to continue</div>
            <div className="text-sm">or</div>
            <button
              className="button !bg-primary/[.8] !hover:bg-primary/[.7] !active:bg-primary !text-white cursor-pointer"
              onClick={() => null}
            >
              Browse Files
            </button>
          </>
        )}
      </div>
    </div>
  );
}
