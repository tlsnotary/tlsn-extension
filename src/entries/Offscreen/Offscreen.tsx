import React, { useEffect } from 'react';
import { OffscreenActionTypes } from './types';

import { BackgroundActiontype } from '../Background/rpc';
import {
  initThreads,
  onCreatePresentationRequest,
  onCreateProverRequest,
  onNotarizationRequest,
  onProcessProveRequest,
  onVerifyProof,
  onVerifyProofRequest,
  startP2PProver,
  startP2PVerifier,
} from './rpc';

const Offscreen = () => {
  useEffect(() => {
    (async () => {
      await initThreads();
      // @ts-ignore
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.type) {
          case OffscreenActionTypes.notarization_request: {
            onNotarizationRequest(request);
            break;
          }
          case OffscreenActionTypes.create_prover_request: {
            onCreateProverRequest(request);
            break;
          }
          case OffscreenActionTypes.create_presentation_request: {
            onCreatePresentationRequest(request);
            break;
          }
          case BackgroundActiontype.process_prove_request: {
            onProcessProveRequest(request);
            break;
          }
          case BackgroundActiontype.verify_proof: {
            onVerifyProof(request, sendResponse);
            return true;
          }
          case BackgroundActiontype.verify_prove_request: {
            onVerifyProofRequest(request);
            break;
          }
          case OffscreenActionTypes.start_p2p_verifier: {
            startP2PVerifier(request);
            break;
          }
          case OffscreenActionTypes.start_p2p_prover: {
            startP2PProver(request);
            break;
          }
          default:
            break;
        }
      });
    })();
  }, []);

  return <div className="App" />;
};

export default Offscreen;
