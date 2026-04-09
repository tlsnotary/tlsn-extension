cmake_minimum_required(VERSION 3.22.1)
project(quickjs-native)

# QuickJS C source files — shared vendor directory (one copy for iOS + Android)
set(QUICKJS_VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../vendor/quickjs")
file(GLOB QUICKJS_C_SOURCES "${QUICKJS_VENDOR_DIR}/*.c")

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

# Headers live in the shared vendor directory
target_include_directories(quickjs PRIVATE ${QUICKJS_VENDOR_DIR})

# Build the JNI bridge
add_library(quickjs-jni SHARED quickjs_jni.c)
target_link_libraries(quickjs-jni quickjs log)
target_include_directories(quickjs-jni PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${QUICKJS_VENDOR_DIR})
