cmake_minimum_required(VERSION 3.22.1)
project(quickjs-native)

# QuickJS C source files
# These must be copied here by running: ./setup.sh
# Use file(GLOB ...) to pick up whichever files exist, since the file set
# changed between QuickJS versions (libbf.c → dtoa.c, etc.)
file(GLOB QUICKJS_C_SOURCES "*.c")

# Exclude our JNI bridge from the QuickJS library sources
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "quickjs_jni\\.c$")
# Exclude the standalone tools
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "qjs\\.c$")
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "qjsc\\.c$")
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "run-test262\\.c$")

# Build QuickJS as a shared library
add_library(quickjs SHARED ${QUICKJS_C_SOURCES})

target_compile_definitions(quickjs PRIVATE
    _GNU_SOURCE
    CONFIG_VERSION="2024-02-14"
)

target_compile_options(quickjs PRIVATE
    -Wno-implicit-fallthrough
    -Wno-sign-compare
    -Wno-missing-field-initializers
    -Wno-unused-parameter
    -Wno-unused-variable
    -Wno-shift-negative-value
    -Wno-unused-but-set-variable
)

# Build the JNI bridge
add_library(quickjs-jni SHARED quickjs_jni.c)
target_link_libraries(quickjs-jni quickjs log)
target_include_directories(quickjs-jni PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
