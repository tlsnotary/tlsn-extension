# tlsn-extension 🚧🚧🚧

## Bind a rust websocket client
We used the example from [wasm-bindgen](https://rustwasm.github.io/docs/wasm-bindgen/examples/websockets.html) with the following changes:
1. Use webpack to bundle the javascript
2. Add a websocket server to listen to the messages from the browser


### Install `wasm-pack`
Do it with `yarn`, or you can install it in [other ways](https://rustwasm.github.io/wasm-pack/installer/).

```bash
yarn global add wasm-pack
```

### Compile rust to wasm and create a JS package binding

```bash
yarn build-rs
```

You can see the resulting JS package in `pkg/`.

```bash
tree pkg
pkg
├── README.md
├── package.json
├── tlsn_extension_rs.d.ts
├── tlsn_extension_rs.js
├── tlsn_extension_rs_bg.wasm
└── tlsn_extension_rs_bg.wasm.d.ts
```

### Install dependencies

```bash
yarn install
```

### Run the websocket server in another terminal
Open a new terminal and run the websocket server
```bash
yarn ws-server
```

### Run the web server
```bash
yarn start
```

### Open the browser
```bash
open http://localhost:8080
```

And you should see outputs from the browser console:
```
socket opened
tlsn_extension_rs.js:278 message successfully sent
tlsn_extension_rs.js:278 binary message successfully sent
tlsn_extension_rs.js:278 message event, received Text: "something"
```
