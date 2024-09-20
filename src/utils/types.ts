export type Proof = ProofV0 | AttrAttestation;

export type ProofV0 = {
  version?: undefined;
  session: any;
  substrings: any;
  notaryUrl: string;
};

export type AttrAttestation = {
  version: '1.0';
  meta: {
    notaryUrl: string;
    websocketProxyUrl: string;
    pluginUrl?: string;
  };
  signature: string;
  signedSession: string;
  applicationData: string;
  attestations: string;
};
