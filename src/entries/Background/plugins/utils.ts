import { addPlugin, addPluginConfig, addPluginMetadata } from '../db';
import { getPluginConfig } from '../../../utils/misc';

export async function installPlugin(
  urlOrBuffer: ArrayBuffer | string,
  origin = '',
  filePath = '',
  metadata: {[key: string]: string} = {},
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