const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Google Play Console anti-impersonation token (ADI). Tied to the tlsnotary
// developer account; useless without the matching upload key. Public-by-design
// — it's bundled into every shipped APK in assets.
const ADI_TOKEN = 'DSBMHGT4FZT3EAAAAAAAAAAAAA';

module.exports = function adiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const assetsDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'adi-registration.properties'), ADI_TOKEN + '\n');
      return config;
    },
  ]);
};
