export type Proof = ProofV0 | ProofV1;

export type ProofV0 = {
  version?: undefined;
  session: any;
  substrings: any;
  notaryUrl: string;
};

export type ProofV1 = {
  version: '1.0';
  data: string;
  meta: {
    notaryUrl: string;
    websocketProxyUrl: string;
    pluginUrl?: string;
  };
};
