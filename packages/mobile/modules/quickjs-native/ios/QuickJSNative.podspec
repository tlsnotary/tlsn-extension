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

  # Swift module + QuickJS C source files (glob picks up whichever version)
  s.source_files = '**/*.swift', 'quickjs/*.{c,h}'
  # Only expose bridge header as public — Swift uses it via the module map.
  # Internal QuickJS headers (quickjs.h, cutils.h etc.) are pulled in
  # transitively but not exported to other pods.
  s.public_header_files = 'quickjs/quickjs_bridge.h'
  s.preserve_paths = 'quickjs/**/*'

  # Exclude standalone QuickJS tools from compilation
  s.exclude_files = 'quickjs/qjs.c', 'quickjs/qjsc.c', 'quickjs/run-test262.c'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # C compiler flags for QuickJS
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) _GNU_SOURCE=1 CONFIG_VERSION=\"2025\"',
    # Allow Swift to find C headers via the module map
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/quickjs"',
    'SWIFT_INCLUDE_PATHS' => '"$(PODS_TARGET_SRCROOT)/quickjs"',
  }
end
