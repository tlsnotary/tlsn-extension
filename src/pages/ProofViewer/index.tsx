import React, {
  ReactNode,
  ReactElement,
  useState,
  MouseEventHandler,
  useEffect,
} from 'react';
import { useParams, useNavigate } from 'react-router';
import c from 'classnames';
import { useRequestHistory } from '../../reducers/history';
import Icon from '../../components/Icon';
import { download } from '../../utils/misc';
import { decodeTLSData } from '../../utils/misc';
import { AttrAttestation } from '../../utils/types';
import { CheckCircle } from 'lucide-react';
export default function ProofViewer(props?: { proof?: any }): ReactElement {
  const { requestId } = useParams<{ requestId: string }>();
  const request = useRequestHistory(requestId);
  const navigate = useNavigate();
  const [tab, setTab] = useState('sent');

  const [attributes, setAttributes] = useState<string[]>([]);
  const [sessionData, setSessionData] = useState<string>('');
  useEffect(() => {
    const AttributeAttestation = request?.proof as AttrAttestation;
    if (!AttributeAttestation) return;
    if (AttributeAttestation.attestations) {
      const attestations = AttributeAttestation.attestations.split(';');
      const attributes = [];
      for (const attestation of attestations) {
        const [key] = attestation.split(':');
        if (key) attributes.push(key);
      }

      setAttributes(attributes);
    } else {
      const signedSessionDecoded = decodeTLSData(
        AttributeAttestation.applicationData,
      );
      setSessionData(signedSessionDecoded.response);
    }
  }, [request]);

  if (!request?.proof) return <></>;
  return (
    <div className="flex flex-col w-full py-2 gap-2 flex-grow">
      <div className="flex flex-col px-2">
        <div className="flex flex-row gap-2 items-center">
          <Icon
            className={c(
              'px-1 select-none cursor-pointer',
              'text-slate-400 border-b-2 border-transparent hover:text-slate-500 active:text-slate-800',
            )}
            onClick={() => navigate(-1)}
            fa="fa-solid fa-xmark"
          />
          <TabLabel onClick={() => setTab('sent')} active={tab === 'sent'}>
            Attribute Attestation
          </TabLabel>

          <div className="flex flex-row flex-grow items-center justify-end">
            {request && (
              <button
                className="button"
                onClick={() => {
                  if (!request) return;
                  download(request.id, JSON.stringify(request.proof));
                }}
              >
                Download
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col flex-grow px-2">
        <AttributeAttestation
          attrAttestation={request?.proof}
          attributes={attributes}
          sessionData={sessionData}
        />
      </div>
    </div>
  );
}

function TabLabel(props: {
  children: ReactNode;
  onClick: MouseEventHandler;
  active?: boolean;
}): ReactElement {
  return (
    <button
      className={c('px-1 select-none cursor-pointer font-bold', {
        'text-slate-800 border-b-2 border-green-500': props.active,
        'text-slate-400 border-b-2 border-transparent hover:text-slate-500':
          !props.active,
      })}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function AttributeAttestation(props: {
  attrAttestation: AttrAttestation;
  attributes: string[];
  sessionData: string;
}) {
  const { attrAttestation, attributes, sessionData } = props;
  return (
    <div className="w-full max-w-3xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden relative">
      <div className="absolute top-4 right-4 w-32 h-32 opacity-50 rotate-12 z-10">
        <svg viewBox="0 0 100 100" className="w-full h-full text-gray-700">
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dy=".3em"
            fontSize="12"
            fontWeight="bold"
          >
            AUTHENTICATED
          </text>
          <text x="50" y="62" textAnchor="middle" fontSize="8">
            CRYPTOGRAPHICALLY
          </text>
        </svg>
      </div>
      <div className="bg-blue-600 text-white p-6">
        <h1 className="text-2xl font-bold">Attribute Attestation</h1>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold">Notary url</h3>
            <p className="break-all">{attrAttestation.meta.notaryUrl}</p>
          </div>
          <div>
            <h3 className="font-semibold">Version</h3>
            <p>{attrAttestation.version}</p>
          </div>
          <div>
            <h3 className="font-semibold">Websocket proxy url</h3>
            <p className="break-all">
              websocket proxy: {attrAttestation.meta.websocketProxyUrl}
            </p>
          </div>

          <div className="col-span-2">
            <h3 className="font-semibold">Signature</h3>
            <p className="break-all text-xs">{attrAttestation.signature}</p>
          </div>
        </div>
        <div className="border-t pt-4">
          <h3 className="font-semibold mb-2">Attributes</h3>

          {props.attributes.map((attribute) => (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-700 text-green-100 text-sm font-medium">
              <CheckCircle className="w-4 h-4 mr-2" />
              {attribute}
            </div>
          ))}

          {!attributes.length && <p>{sessionData}</p>}
        </div>
      </div>
    </div>
  );
}
