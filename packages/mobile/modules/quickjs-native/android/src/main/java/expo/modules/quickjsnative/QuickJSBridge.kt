package expo.modules.quickjsnative

/**
 * JNI bridge to the QuickJS C engine.
 * Native methods are implemented in quickjs_jni.c
 */
class QuickJSBridge {
    companion object {
        init {
            System.loadLibrary("quickjs-jni")
        }
    }

    external fun nativeCreateContext(): String
    external fun nativeEvalCode(contextId: String, code: String): String
    external fun nativeDisposeContext(contextId: String)
    external fun nativeExecutePendingJobs(contextId: String)
    external fun nativeResolvePromise(contextId: String, resolveCode: String)
}
