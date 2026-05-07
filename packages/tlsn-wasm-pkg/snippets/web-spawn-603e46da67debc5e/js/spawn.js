function registerMessageListener(target, type, callback) {
    const listener = async (event) => {
        const message = event.data;
        if (message && message.type === type) {
            await callback(message.data);
        }
    };

    target.addEventListener('message', listener);
}

// Register listener for the start spawner message.
registerMessageListener(self, 'web_spawn_start_spawner', async (data) => {
    const workerUrl = new URL(
        './spawn.js',
        import.meta.url
    );
    const [module, memory, spawnerPtr] = data;
    const pkg = await import('../../../tlsn_wasm.js');
    const exports = await pkg.default({ module, memory });

    const spawner = pkg.web_spawn_recover_spawner(spawnerPtr);
    postMessage('web_spawn_spawner_ready');
    await spawner.run(workerUrl.toString());

    exports.__wbindgen_thread_destroy();

    close();
});

// Register listener for the start worker message.
registerMessageListener(self, 'web_spawn_start_worker', async (data) => {
    const [module, memory, workerPtr] = data;

    const pkg = await import('../../../tlsn_wasm.js');
    const exports = await pkg.default({ module, memory });

    pkg.web_spawn_start_worker(workerPtr);

    exports.__wbindgen_thread_destroy();

    close();
});

/// Starts the spawner in a new worker.
export async function startSpawnerWorker(module, memory, spawner) {
    const workerUrl = new URL(
        './spawn.js',
        import.meta.url
    );
    const worker = new Worker(
        workerUrl,
        {
            name: 'web-spawn-spawner',
            type: 'module'
        }
    );

    const data = [module, memory, spawner.intoRaw()];
    worker.postMessage({
        type: 'web_spawn_start_spawner',
        data: data
    })

    await new Promise(resolve => {
        worker.addEventListener('message', function handler(event) {
            if (event.data === 'web_spawn_spawner_ready') {
                worker.removeEventListener('message', handler);
                resolve();
            }
        })
    })
}
