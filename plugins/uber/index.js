function isValidHost(urlString) {
  const url = new URL(urlString);
  return url.hostname === 'riders.uber.com';
}

function gotoUber() {
  const { redirect } = Host.getFunctions();
  const mem = Memory.fromString('https://riders.uber.com');
  redirect(mem.offset);
}

function start() {
  console.log(JSON.stringify('TLSN start'));
  if (!isValidHost(Config.get('tabUrl'))) {
    gotoUber();
    Host.outputString(JSON.stringify(false));
    return;
  }
  Host.outputString(JSON.stringify(true));
}

function two() {
  const cookies = JSON.parse(Config.get('cookies'))['riders.uber.com'];
  const headers = JSON.parse(Config.get('headers'))['riders.uber.com'];
  console.log("TLSN cookies");
  console.log(JSON.stringify(cookies));
  console.log("TLSN headers");
  console.log(JSON.stringify(headers));

  const sid = cookies.sid
  const csid = cookies.csid
  const jwt_session = cookies["jwt-session"]
  console.log("JWT")
  console.log(JSON.stringify(cookies["jwt-session"]))

  const query = '{ "query": "{ currentUser { email firstName lastName uuid formattedNumber signupCountry } }" }'

  Host.outputString(
    JSON.stringify({
      url: 'https://riders.uber.com/graphql',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Accept': '*/*',
        Cookie: `sid=${sid}; csid=${csid}; jwt-session=${jwt_session}`,
        'x-csrf-token': 'x',
        Host: 'riders.uber.com',
        'Accept-Encoding': 'identity',
        Connection: 'close',
      },
      body: query
    }),
  );
}

function three() {
  const params = JSON.parse(Host.inputString());
  const { notarize } = Host.getFunctions();

  if (!params) {
    Host.outputString(JSON.stringify(false));
  } else {
    const mem = Memory.fromString(JSON.stringify(params));
    console.log("notarize", JSON.stringify(mem))
    const idOffset = notarize(mem.offset);
    const id = Memory.find(idOffset).readString();
    Host.outputString(JSON.stringify(id));
  }
}

function config() {
  Host.outputString(
    JSON.stringify({
      title: 'Uber Profile',
      description: 'Notarize ownership of an Uber profile',
      icon: 'data:image/png;base64,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',
      steps: [
        {
          title: 'Visit Uber website',
          cta: 'Go to uber.com',
          action: 'start',
        },
        {
          title: 'Collect credentials',
          description: "Login to your account if you haven't already",
          cta: 'Checking cookies',
          action: 'two',
        },
        {
          title: 'Notarize Uber profile',
          cta: 'Notarize',
          action: 'three',
          prover: true,
        },
      ],
      hostFunctions: ['redirect', 'notarize'],
      cookies: ['riders.uber.com'],
      headers: ['riders.uber.com'],
      requests: [
        {
          url: 'https://riders.uber.com/graphql',
          method: 'POST',
        },
      ],
    }),
  );
}

module.exports = { start, config, two, three };
