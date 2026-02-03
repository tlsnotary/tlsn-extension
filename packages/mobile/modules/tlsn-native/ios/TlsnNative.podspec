Pod::Spec.new do |s|
  s.name           = 'TlsnNative'
  s.version        = '1.0.0'
  s.summary        = 'TLSNotary native bindings for iOS'
  s.description    = 'Native iOS module providing TLSNotary proof generation capabilities'
  s.author         = 'TLSNotary'
  s.homepage       = 'https://tlsnotary.org'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '13.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift source files (paths relative to podspec location)
  s.source_files = '**/*.swift'

  # Static library
  s.vendored_libraries = 'lib/libtlsn_mobile.a'

  # Link required system frameworks
  s.frameworks = 'Security', 'SystemConfiguration'
  s.libraries = 'c++'

  # Header search paths for FFI types
  s.preserve_paths = 'include/**/*'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_INCLUDE_PATHS' => '$(PODS_TARGET_SRCROOT)/include',
    'HEADER_SEARCH_PATHS' => '$(PODS_TARGET_SRCROOT)/include'
  }
end
