import init from './pkg/tlsn_extension_rs.js';

window.addEventListener('load', async () => {
    await init('./pkg/tlsn_extension_rs_bg.wasm');
});
