import { addPlugin, addPluginConfig, addPluginMetadata } from '../db';
import { getPluginConfig } from '../../../utils/misc';

export async function installPlugin(
  url: string,
  origin = '',
  filePath = '',
  metadata: {[key: string]: string} = {},
) {
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();

  const config = await getPluginConfig(arrayBuffer);
  const hex = Buffer.from(arrayBuffer).toString('hex');
  const hash = await addPlugin(hex, url);

  await addPluginConfig(url, config);
  await addPluginMetadata(url, {
    ...metadata,
    origin,
    filePath,
  });
  return hash;
}

export function mapSecretsToRange(secrets: string[], text: string) {
  return secrets
    .map((secret: string) => {
      const index = text.indexOf(secret);
      return index > -1
        ? {
          start: index,
          end: index + secret.length,
        }
        : null;
    })
    .filter((data: any) => !!data) as { start: number; end: number }[]
}