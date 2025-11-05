This folder contains a html to run a local demo server with TLSNotary plugins.

To run this demo:
1. Build and install the extension (../../README.md)
2. Launch the verifier server
   ```bash
    cd ../packages/verifier
    cargo run --release
    ```
3. Run the demo `npm run demo`.
4. Open http://localhost:8080