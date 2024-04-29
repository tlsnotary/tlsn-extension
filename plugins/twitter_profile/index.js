function plugin() {
  // const csrfToken = Config.get('x-csrf-token');
  // const authToken = Config.get('authorization');
  // const cookie = Config.get('Cookie');
  const { get_response, has_request_uri } = Host.getFunctions();
  let mem = Memory.fromString(
    'https://api.twitter.com/1.1/account/settings.json',
  );
  console.log(`'from plugin: mem', ${JSON.stringify(mem)}`);

  let offset = has_request_uri(mem.offset);
  console.log(`'from plugin: offset', ${offset}`);

  let response = Memory.find(offset).readString();
  console.log(`'from plugin: response', ${response}`);
  // if (res.status != 200) throw new Error(`Got non 200 response ${res.status}`);

  Host.outputString(
    JSON.stringify({
      response,
    }),
  );
}

module.exports = { plugin };
