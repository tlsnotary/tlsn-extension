const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function excludeX86_64(config) {
  // Exclude x86_64 from the main Xcode project
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const cfg = configurations[key];
      if (cfg.buildSettings) {
        cfg.buildSettings['"EXCLUDED_ARCHS[sdk=iphonesimulator*]"'] = '"x86_64"';
      }
    }
    return config;
  });

  // Also exclude x86_64 from all Pod targets via Podfile post_install
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const snippet = `

    # Exclude x86_64 for simulator — native modules only have arm64 slices
    installer.pods_project.build_configurations.each do |bc|
      bc.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'
    end
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        bc.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'
      end
    end`;

      // Insert before the last two 'end' statements (end of post_install + end of target)
      podfile = podfile.replace(
        /(\s+react_native_post_install\([\s\S]*?\)\n)/,
        `$1${snippet}\n`
      );

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);

  return config;
};
