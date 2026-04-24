Pod::Spec.new do |s|
  s.name           = 'QuickJSNative'
  s.version        = '1.0.0'
  s.summary        = 'Native QuickJS JavaScript sandbox for iOS'
  s.description    = 'Expo module wrapping the QuickJS C engine for sandboxed JS evaluation'
  s.author         = 'TLSNotary'
  s.homepage       = 'https://tlsnotary.org'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '13.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift module + bridge files + vendored QuickJS C sources
  s.source_files = 'ios/**/*.swift', 'ios/quickjs/*.{c,h}', 'vendor/quickjs/*.{c,h}'
  # Only expose bridge header as public — Swift uses it via the module map.
  # Internal QuickJS headers (quickjs.h, cutils.h etc.) are pulled in
  # transitively but not exported to other pods.
  s.public_header_files = 'ios/quickjs/quickjs_bridge.h'
  s.preserve_paths = 'ios/quickjs/**/*', 'vendor/quickjs/**/*'

  # Exclude standalone QuickJS tools from compilation
  s.exclude_files = '**/qjs.c', '**/qjsc.c', '**/run-test262.c'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # C compiler flags for QuickJS
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) _GNU_SOURCE=1 CONFIG_VERSION=\"2025\"',
    # Allow Swift to find C headers via the module map
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/ios/quickjs" "$(PODS_TARGET_SRCROOT)/vendor/quickjs"',
    'SWIFT_INCLUDE_PATHS' => '"$(PODS_TARGET_SRCROOT)/ios/quickjs" "$(PODS_TARGET_SRCROOT)/vendor/quickjs"',
  }
end
