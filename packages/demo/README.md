This folder contains a basic demo for running TLSNotary plugins.
The demo needs the TLSNotary extension to run the plugins in your browser.
In this demo, the plugins prove data from a server (e.g. Twitter). Of course you will also need the verifier counterpart. In this demo we will use the verifier server from the `packages/verifier` folder.

Prerequisites:
* Chromium browser
* internet connection

To run this demo:
1. Install the browser extension
2. Launch the verification server
3. A web socket proxy
4. Launch the demo

## 1. Install the browser extension

### Install from the Google Web Store
TODO

### Build from source

1. In this repository's main folder, run:
    ```sh
    npm ci
    npm run build
    ```
    This builds the extension in the `packages/extension/build/` folder.
2. Next load the extension in Chrome:
   * Navigate to `chrome://extensions/`
   * Enable **Developer mode** toggle (top right)
   * Click **Load unpacked**
   * Select the `packages/extension/build/` folder
  The extension is now installed

## 2. Launch the verifier server

Launch the verifier server
   ```sh
    cd packages/verifier
    cargo run --release
   ```

## 3. Websocket proxy
In the TLSNotary protocol the prover connects directly to the server serving the data. The prover sets up a TCP connection and to the server this looks like any other connection. Unfortunately, browsers do not offer the functionally to let browser extensions setup TCP connections. A workaround is to connect to a websocket proxy that sets up the TCP connection instead.

You can use the websocketproxy hosted by the TLSNotary team, or run your own proxy:
* TLSNotary proxy: `wss://notary.pse.dev/proxy?token=host`,
* Run a local proxy:
  1. Install [wstcp](https://github.com/sile/wstcp):
  ```shell
  cargo install wstcp
  ```
  1. Run a websocket proxy for `https://<host>`:
  ```shell
  wstcp --bind-addr 127.0.0.1:55688 <host>:443
  ```

## 4. Launch the demo

Run the demo with `npm run demo`.
You can now open the demo by opening http://localhost:8080 in your browser with the TLSNotary extension