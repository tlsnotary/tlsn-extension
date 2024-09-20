import { useState, useEffect } from 'react';
import axios from 'axios';
import { NOTARY_API } from '../utils/constants';
import { decodeCborAll, RemoteAttestation, generateNonce } from 'tlsn-js';
import { OffscreenActionTypes } from '../entries/Offscreen/types';
import { DEFAULT_CONFIG_ENDPOINT } from '../utils/constants';

export const useRemoteAttestation = () => {
  const [remoteAttestation, setRemoteAttestation] =
    useState<RemoteAttestation | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expectedPcrs, setExpectedPcrs] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(DEFAULT_CONFIG_ENDPOINT);
      const config = await res.json();
      console.log('config', config);
      setExpectedPcrs(config.EXPECTED_PCRS);
    })();
  }, []);

  useEffect(() => {
    (() => {
      chrome.runtime.onMessage.addListener(
        async (request, sender, sendResponse) => {
          switch (request.type) {
            case OffscreenActionTypes.remote_attestation_verification_response: {
              const result = request.data;
              setIsValid(result);
            }
          }
        },
      );
    })();
  }, []);
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!expectedPcrs) {
          return;
        }
        const nonce = generateNonce();
        const enclaveEndpoint = `${NOTARY_API}/enclave/attestation?nonce=${nonce}`;

        const response = await axios.get(enclaveEndpoint);
        setRemoteAttestation(response.data);
        const remoteAttbase64 = response.data.trim();
        console.log('response.data', remoteAttbase64);

        //analyze attestation validity here
        const remoteAttestation = decodeCborAll(response.data);

        //verify pcrs values
        const pcrs = remoteAttestation?.payload_object.pcrs;

        console.log('pcrs', pcrs, expectedPcrs);
        if (!pcrs) {
          setIsValid(false);
          setLoading(false);
          return setError('pcrs not found');
        }
        if (
          pcrs?.get(1) !== expectedPcrs['1'] ||
          pcrs?.get(2) !== expectedPcrs['2']
        ) {
          setIsValid(false);
          setLoading(false);
          return setError('pcrs values are not the one expected');
        }

        chrome.runtime.sendMessage({
          type: OffscreenActionTypes.remote_attestation_verification,
          data: {
            remoteAttestation: remoteAttbase64,
            nonce,
          },
        });
      } catch (error) {
        setError(error as any);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [expectedPcrs]);

  return { remoteAttestation, loading, error, isValid };
};
