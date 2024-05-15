# Building plugins

## Extism

make sure you have [extism-js](https://github.com/extism/js-pdk) installed:
```
curl -O https://raw.githubusercontent.com/extism/js-pdk/main/install.sh
sh install.sh
```

## Build plugin
```
extism-js index.js
```
---
# Plugin Development for the TLSNotary browser extension

This folder is dedicated to the development of plugins for the TLSNotary browser extension, utilizing the Extism framework. Currently, the folder includes a TypeScript-based plugin example, `twitter_profile`, with plans to add more plugins showcasing different programming languages and functionalities.

## Installation of Extism-js

1. **Download and Install extism-js**: Start by setting up `extism-js`, which will allow you to compile and manage your plugins. Run these commands to download and install it:

    ```sh
    curl -O https://raw.githubusercontent.com/extism/js-pdk/main/install.sh
    sh install.sh
    ```

    This script will install the Extism JavaScript Plugin Development Kit from its GitHub repository, setting up your environment for plugin compilation.

## Building the Twitter Profile Plugin

Navigate to the `twitter_profile` directory within this folder and run the following command to build the plugin:

```sh
extism-js index.js
```
This command compiles the TypeScript code in index.js into a WebAssembly module, ready for integration with the TLSNotary extension.

## Future Plugins

This directory will be expanded with more plugins designed to demonstrate the functionality of the TLSNotary extension. Plugins enable flexible use of the TLSNotary across a broad range of applications. The use of Extism facilitates plugin development in various languages, further enhancing flexibility.
