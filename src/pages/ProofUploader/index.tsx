import React, {
  ReactElement,
  useState,
  useCallback,
  ChangeEventHandler,
} from 'react';
import Icon from '../../components/Icon';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import ProofViewer from '../ProofViewer';

export default function ProofUploader(): ReactElement {
  const [proof, setProof] = useState<{
    recv: string;
    sent: string;
  } | null>(null);

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
            const res = await chrome.runtime.sendMessage<
              any,
              { recv: string; sent: string }
            >({
              type: BackgroundActiontype.verify_proof,
              data: proof,
            });
            setProof(res);
          }
        });
        reader.readAsText(file);
      }
    },
    [],
  );

  if (proof) {
    return <ProofViewer recv={proof.recv} sent={proof.sent} />;
  }

  return (
    <div className="flex flex-col flex-nowrap flex-grow flex-shrink h-0 overflow-y-auto">
      <div className="flex flex-col items-center justify-center relative border-slate-400 border-2 text-slate-500 border-dashed flex-grow flex-shrink h-0 m-2 bg-slate-200">
        <input
          type="file"
          className="absolute w-full h-full top-0 left-0 opacity-0 z-10"
          onChange={onFileUpload}
          accept=".json"
        />
        <Icon className="mb-4" fa="fa-solid fa-upload" size={2} />
        <div className="text-lg">Drop your proof here to continue</div>
        <div className="text-sm">or</div>
        <button
          className="button !bg-primary/[.8] !hover:bg-primary/[.7] !active:bg-primary !text-white cursor-pointer"
          onClick={() => null}
        >
          Browse Files
        </button>
      </div>
    </div>
  );
}
