import { PresentationJSON as PresentationJSONa7 } from 'tlsn-js/build/types';

export type PresentationJSON = PresentationJSONa5 | PresentationJSONa7;

export type PresentationJSONa5 = {
  version?: undefined;
  session: any;
  substrings: any;
  notaryUrl: string;
};
