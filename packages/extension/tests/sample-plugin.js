/* eslint-env node */
/* global useHeaders, createProver, sendRequest, transcript, subtractRanges, mapStringToRange, reveal, useEffect, openWindow, div, button, Buffer */

const config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
};

async function prove() {
  const [header] = useHeaders((headers) =>
    headers.filter((header) =>
      header.url.includes('https://api.x.com/1.1/account/settings.json'),
    ),
  );
  const headers = {
    cookie: header.requestHeaders.find((header) => header.name === 'Cookie')
      ?.value,
    'x-csrf-token': header.requestHeaders.find(
      (header) => header.name === 'x-csrf-token',
    )?.value,
    'x-client-transaction-id': header.requestHeaders.find(
      (header) => header.name === 'x-client-transaction-id',
    )?.value,
    Host: 'api.x.com',
    authorization: header.requestHeaders.find(
      (header) => header.name === 'authorization',
    )?.value,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  console.log('headers', headers);

  const proverId = await createProver(
    'api.x.com',
    'https://demo.tlsnotary.org',
  );
  console.log('prover', proverId);

  await sendRequest(proverId, 'wss://notary.pse.dev/proxy?token=api.x.com', {
    url: 'https://api.x.com/1.1/account/settings.json',
    method: 'GET',
    headers: headers,
  });

  const { sent, recv } = await transcript(proverId);

  const commit = {
    sent: subtractRanges(
      { start: 0, end: sent.length },
      mapStringToRange(
        [
          `x-csrf-token: ${headers['x-csrf-token']}`,
          `x-client-transaction-id: ${headers['x-client-transaction-id']}`,
          `cookie: ${headers['cookie']}`,
          `authorization: ${headers.authorization}`,
        ],
        Buffer.from(sent).toString('utf-8'),
      ),
    ),
    recv: [{ start: 0, end: recv.length }],
  };

  console.log('commit', commit);
  await reveal(proverId, commit);
}

function main() {
  const [header] = useHeaders((headers) =>
    headers.filter((header) =>
      header.url.includes('https://api.x.com/1.1/account/settings.json'),
    ),
  );

  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  return div(
    {
      style: {
        position: 'fixed',
        bottom: '0',
        right: '8px',
        width: '240px',
        height: '240px',
        borderRadius: '4px 4px 0 0',
        backgroundColor: '#b8b8b8',
        zIndex: '999999',
        fontSize: '16px',
        color: '#0f0f0f',
        border: '1px solid #e2e2e2',
        borderBottom: 'none',
        padding: '8px',
        fontFamily: 'sans-serif',
      },
    },
    [
      div(
        {
          style: {
            fontWeight: 'bold',
            color: header ? 'green' : 'red',
          },
        },
        [header ? 'Profile detected!' : 'No profile detected'],
      ),
      header
        ? button(
            {
              style: {
                color: 'black',
                backgroundColor: 'white',
              },
              onclick: 'prove',
            },
            ['Prove'],
          )
        : div({ style: { color: 'black' } }, ['Please login to x.com']),
    ],
  );
}

export default {
  main,
  prove,
  config,
};
