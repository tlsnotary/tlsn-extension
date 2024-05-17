# Plugin Development for the TLSNotary Browser Extension

This folder is dedicated to the development of plugins for the TLSNotary browser extension, utilizing the Extism framework. Currently, the folder includes a TypeScript-based plugin example, `twitter_profile`, with plans to add more plugins showcasing different programming languages and functionalities.

## Installation of Extism-js

1. **Download and Install Extism-js**: Begin by setting up `extism-js`, which enables you to compile and manage your plugins. Run these commands to download and install it:

    ```sh
    curl -O https://raw.githubusercontent.com/extism/js-pdk/main/install.sh
    sh install.sh
    ```

    This script installs the Extism JavaScript Plugin Development Kit from its GitHub repository, preparing your environment for plugin compilation.

## Building the Twitter Profile Plugin

Navigate to the `twitter_profile` directory within this folder and run the following command to build the plugin:

```sh
extism-js index.js -i index.d.ts -o index.wasm
```
This command compiles the TypeScript code in index.js into a WebAssembly module, ready for integration with the TLSNotary extension.

### Running the Twitter Plugin Example:

1.	Build the `twitter_profile` plugin as explained above.
2.	Build and install the `tlsn-extension` as documented in the [main README.md](../README.md).
3.	[Run a local notary server](https://github.com/tlsnotary/tlsn/blob/main/notary-server/README.md), ensuring `TLS` is disabled in the [config file](https://github.com/tlsnotary/tlsn/blob/main/notary-server/config/config.yaml#L18).
4.	Install the plugin: Click the **Add a Plugin (+)** button and select the `index.wasm` file you built in step 1. A **Twitter Profile** button should then appear below the default buttons.
5.	Click the **Twitter Profile** button. This action opens the Twitter webpage along with a TLSNotary sidebar.
6.	Follow the steps in the TLSNotary sidebar.
7.	Access the TLSNotary results by clicking the **History** button in the TLSNotary extension.

## Future Plugins

This directory will be expanded with more plugins designed to demonstrate the functionality of the TLSNotary extension. Plugins enable flexible use of the TLSNotary across a broad range of applications. The use of Extism facilitates plugin development in various languages, further enhancing flexibility.

## Create an icon

1. resize to 320x320 pixels:
    ```sh
    convert icon.png -resize 320x320! icon_320.png
    ```
2. convert to base64
    ```sh
    base64 -i icon_320.png -o icon_320.txt
    ```