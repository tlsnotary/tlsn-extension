const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26's clang tightened C++20 `consteval` enforcement, and the `fmt`
// library bundled inside RCT-Folly no longer compiles ("call to consteval
// function ... is not a constant expression" in RCT-Folly's json.cpp /
// json_pointer.cpp). Disable fmt's consteval path on the targets that compile
// fmt code so it falls back to runtime format-string checks.
//
// TODO: remove once we're on an Expo SDK that bundles the upstream fmt fix
// (React Native >= 0.83). Tracking: https://github.com/expo/expo/issues/44229
module.exports = function fmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const snippet = `
    # Xcode 26 clang breaks fmt's consteval path; disable it for fmt/RCT-Folly.
    installer.pods_project.targets.each do |target|
      next unless ['fmt', 'RCT-Folly'].include?(target.name)
      target.build_configurations.each do |bc|
        defs = bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
        defs = [defs] unless defs.is_a?(Array)
        defs << 'FMT_USE_CONSTEVAL=0' unless defs.include?('FMT_USE_CONSTEVAL=0')
        bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
      end
    end`;

      // Insert after react_native_post_install (idempotent — skip if already present)
      const sentinel = '# [fmt-consteval-fix-plugin]';
      if (!podfile.includes(sentinel)) {
        podfile = podfile.replace(
          /(\s+react_native_post_install\([\s\S]*?\)\n)/,
          `$1\n    ${sentinel}${snippet}\n`,
        );
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
