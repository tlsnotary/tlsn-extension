import { addPlugin, addPluginConfig, addPluginMetadata } from '../db';
import { getPluginConfig } from '../../../utils/misc';
import { bytesSize, indexOfString } from '../../../utils/utf8';

export async function installPlugin(
  urlOrBuffer: ArrayBuffer | string,
  origin = '',
  filePath = '',
  metadata: { [key: string]: string } = {},
) {
  let arrayBuffer;

  if (typeof urlOrBuffer === 'string') {
    const resp = await fetch(urlOrBuffer);
    arrayBuffer = await resp.arrayBuffer();
  } else {
    arrayBuffer = urlOrBuffer;
  }

  const config = await getPluginConfig(arrayBuffer);
  const hex = Buffer.from(arrayBuffer).toString('hex');
  const hash = await addPlugin(hex);
  await addPluginConfig(hash!, config);
  await addPluginMetadata(hash!, {
    ...metadata,
    origin,
    filePath,
  });
  return hash;
}

export function mapSecretsToRange(secrets: string[], text: string) {
  return secrets
    .map((secret: string) => {
      const byteIdx = indexOfString(text, secret);
      return byteIdx > -1
        ? {
          start: byteIdx,
          end: byteIdx + bytesSize(secret)
        }
        : null;
    })
    .filter((data: any) => !!data) as { start: number; end: number }[]
}