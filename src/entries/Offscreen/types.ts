export enum OffscreenActionTypes {
  notarization_request = 'offscreen/notarization_request',
  notarization_response = 'offscreen/notarization_response',
  create_prover_request = 'offscreen/create_prover_request',
  create_prover_response = 'offscreen/create_prover_response',
  create_presentation_request = 'offscreen/create_presentation_request',
  create_presentation_response = 'offscreen/create_presentation_response',
  start_p2p_verifier = 'offscreen/start_p2p_verifier',
  start_p2p_prover = 'offscreen/start_p2p_prover',
  prover_started = 'offscreen/prover_started',
  prover_setup = 'offscreen/prover_setup',
  start_p2p_proof_request = 'offscreen/start_p2p_proof_request',
  end_p2p_proof_request = 'offscreen/end_p2p_proof_request',
}
