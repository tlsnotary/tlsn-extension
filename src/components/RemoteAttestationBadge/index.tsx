import React, {
  ChangeEvent,
  Children,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useCallback,
  useState,
} from 'react';

import { CheckCircle, XCircle } from 'lucide-react';

import { useRemoteAttestation } from '../../reducers/remote-attestation';
import Icon from '../Icon';
import { useExtensionEnabled } from '../../reducers/requests';

export default function RemoteAttestationBadge(): ReactElement {
  const { remoteAttestation, loading, error, isValid } = useRemoteAttestation();
  const isExtensionEnabled = useExtensionEnabled();

  if (isValid === null) return <></>;
  return (
    <>
      <div className="flex items-center">
        {isExtensionEnabled ? (
          <>
            {isValid ? (
              <>
                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                <div className="w-1"></div>
                <span className="text-xs mr-2"> Notary Authenticated</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                <div className="w-1"></div>
                <span className="text-xs mr-2"> Notary Not Authenticated</span>

                <div className="text-xs mr-2">{error}</div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
            <div className="w-1"></div>
            <span className="text-xs mr-2">Extension disabled</span>
          </>
        )}
      </div>
    </>
  );
}
