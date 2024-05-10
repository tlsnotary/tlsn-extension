function greet() {
  const { get_response } = Host.getFunctions();
  const msg = 'Hello';
  const memory = Memory.fromString(msg);
  const offset = get_response(memory);
  const config = Config.get('authorization');
  Host.outputString(config);
  console.log(config);

  return 'made it here';
}

module.exports = { greet };
