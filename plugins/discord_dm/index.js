function isValidHost(urlString) {
  const url = new URL(urlString);
  return url.hostname === 'discord.com' || url.hostname === 'discord.gg'
}

// https://discord.com/channels/@me/1252416264475770891
function gotoDiscord() {
  const { redirect } = Host.getFunctions();
  const mem = Memory.fromString('https://discord.com/channels/@me');
  redirect(mem.offset);
}

function extractConversationId(urlString) {
  const url = new URL(urlString);
  if (url.hostname === 'discord.com' && /\/channels\/@me\/(\d+)/.test(url.pathname)) {
    return url.pathname.split('/@me/')[1]
  }
}


function start() {
  if (!isValidHost(Config.get('tabUrl'))) {
    gotoDiscord();
    Host.outputString(JSON.stringify(false));
    return;
  }
  Host.outputString(JSON.stringify(true));
}

function two() {
  const conversationId = extractConversationId(Config.get('tabUrl'));
  const cookies = JSON.parse(Config.get('cookies'))['discord.com'];
  const headers = JSON.parse(Config.get('headers'))['discord.com'];

  console.log('COOKIES', cookies);
  console.log('HEADERS', headers);
}



function config() {
  Host.outputString(
    JSON.stringify({
      title: 'Discord DMs',
      description: 'Notarize your Discord DMs',

      steps: [
        {
          title: "Goto Discord DM's",
          description: "Log in to your discord if you haven't already",
          cta: "Go to discord.com",
          action: 'start'
        },
        {
          title: 'Open the DM you want to notarize',
          description: "Pick a short conversation (to meet the current size limits)",
          cta: 'Check',
          action: 'two'
        },
        {
          title: 'Notarize DM',
          cta: 'Notarize',
          action: 'three',
          prover: true
        }
      ],
      hostFunctions: ['redirect', 'notarize'],
      cookies: ['discord.com'],
      headers: ['discord.com'],
      requests: [
        {
          url: 'https://discord.com',
          method: 'GET',
        },
      ],
    }),
  );
}


module.exports = { start, two, config };
