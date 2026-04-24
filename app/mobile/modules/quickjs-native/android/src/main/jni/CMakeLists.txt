cmake_minimum_required(VERSION 3.22.1)
project(quickjs-native)

# Shared QuickJS C source files live in vendor/quickjs/ (see ../../QUICKJS_VERSION)
set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../vendor/quickjs")

file(GLOB QUICKJS_C_SOURCES "${VENDOR_DIR}/*.c")

# Exclude the standalone tools
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "qjs\\.c$")
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "qjsc\\.c$")
list(FILTER QUICKJS_C_SOURCES EXCLUDE REGEX "run-test262\\.c$")

# Build QuickJS as a shared library
add_library(quickjs SHARED ${QUICKJS_C_SOURCES})

target_include_directories(quickjs PRIVATE ${VENDOR_DIR})

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
target_include_directories(quickjs-jni PRIVATE ${VENDOR_DIR})
