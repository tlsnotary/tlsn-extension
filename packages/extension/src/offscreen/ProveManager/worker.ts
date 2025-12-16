import * as Comlink from 'comlink';
import initWasm, {
  LoggingLevel,
  initialize,
  Prover,
  CrateLogFilter,
  SpanEvent,
  LoggingConfig,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';

export default async function init(config?: {
  loggingLevel?: LoggingLevel;
  hardwareConcurrency?: number;
  crateFilters?: CrateLogFilter[];
}): Promise<void> {
  const {
    loggingLevel = 'Info',
    hardwareConcurrency = navigator.hardwareConcurrency || 4,
    crateFilters,
  } = config || {};

  try {
    await initWasm();
    console.log('[Worker] initWasm completed successfully');
  } catch (error) {
    console.error('[Worker] initWasm failed:', error);
    throw new Error(`WASM initialization failed: ${error}`);
  }

  // Build logging config - omit undefined fields to avoid WASM signature mismatch
  const loggingConfig: LoggingConfig = {
    level: loggingLevel,
    crate_filters: crateFilters || [],
    span_events: undefined,
  };

  try {
    await initialize(loggingConfig, hardwareConcurrency);
  } catch (error) {
    console.error('[Worker] Initialize failed:', error);
    console.error('[Worker] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

    // Try one more time with completely null config as fallback
    try {
      console.log('[Worker] Retrying with null config...');
      await initialize(null, 1);
      console.log('[Worker] Retry succeeded with null config');
    } catch (retryError) {
      console.error('[Worker] Retry also failed:', retryError);
      throw new Error(
        `Initialize failed: ${error}. Retry with null also failed: ${retryError}`,
      );
    }
  }
}

Comlink.expose({
  init,
  Prover,
});
