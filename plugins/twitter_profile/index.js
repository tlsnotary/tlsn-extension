function plugin() {
  const csrfToken = Config.get('x-csrf-token');
  const authToken = Config.get('authorization');
  const cookie = Config.get('Cookie');
  const { get_response } = Host.getFunctions();
  let msg = 'Hello from js 1';
  let mem = Memory.fromString(msg);
  let offset = get_response(mem.offset);
  let response = Memory.find(offset).readString();
  console.log(response);
  Host.outputString(JSON.stringify({ csrfToken, authToken, cookie, response }));
}

module.exports = { plugin };
