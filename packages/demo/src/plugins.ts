import { getPluginsForPlatform } from '@tlsn/plugins';
import { Plugin } from './types';

export const plugins: Record<string, Plugin> = Object.fromEntries(
  getPluginsForPlatform('demo').map((p) => [
    p.id,
    {
      name: p.name,
      description: p.description,
      logo: p.logo,
      file: `/plugins/${p.id}.js`,
      parseResult: (json) => json.results[json.results.length - 1].value,
    } satisfies Plugin,
  ]),
);
