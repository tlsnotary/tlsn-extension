import ReactDOM from 'react-dom/client';
import { PeerToPeerPage } from './PeerToPeerPage';

// Separate, cross-origin-isolated entry (see vite.config.ts). The WASM verifier
// needs SharedArrayBuffer, which requires COOP/COEP on this document. No analytics
// here so the isolation doesn't block cross-origin scripts.
//
// Note: no React.StrictMode here — its dev-only double-mount would tear down and
// recreate the long-lived PeerJS connection and WASM session mid-proof.
ReactDOM.createRoot(document.getElementById('root')!).render(<PeerToPeerPage />);
