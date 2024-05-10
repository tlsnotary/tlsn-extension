function plugin() {
  const notaryUrl = Config.get('notaryUrl');
  const websocketProxyUrl = Config.get('websocketProxyUrl');
  const { get_response, has_request_uri } = Host.getFunctions();
  let mem = Memory.fromString(
    'https://api.twitter.com/1.1/account/settings.json',
  );
  console.log(`'from plugin: mem', ${JSON.stringify(mem)}`);

  let offset = has_request_uri(mem.offset);
  console.log(`'from plugin: offset', ${offset}`);

  let req = Memory.find(offset).readString();
  console.log(`'from plugin: req', ${req}`);
  req = JSON.parse(req);

  const headers = req.requestHeaders?.reduce(
    (acc, h) => {
      acc[h.name] = h.value;
      return acc;
    },
    { Host: 'api.twitter.com' },
  );

  mem = Memory.fromString(
    JSON.stringify({
      url: req.url,
      method: req.method,
      maxTranscriptSize: 16384,
      notaryUrl,
      websocketProxyUrl,
      headers,
    }),
  );
  get_response(mem.offset);

  Host.outputString(JSON.stringify('hahaha'));
}

function config() {
  Host.outputString(
    JSON.stringify({
      title: 'Twitter Profile',
      description: 'Notarize ownership of a twitter profile',
      cta: 'Go to www.twitter.com',
      action: 'getActiveUrl',
      steps: [
        {
          title: 'Go to twitter.com',
        },
        {
          title: 'Login to your account',
        },
        {
          title: 'Notarize',
        },
      ],
    }),
  );
}

module.exports = { plugin, config };
