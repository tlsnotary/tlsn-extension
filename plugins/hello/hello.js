function hello() {
  const name = Host.inputString();
  Host.outputString(`Hello, ${name}`);
}

module.exports = { hello };
