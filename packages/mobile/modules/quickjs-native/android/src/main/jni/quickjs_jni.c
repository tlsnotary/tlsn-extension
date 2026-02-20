/**
 * JNI bridge between Android/Kotlin and QuickJS C engine.
 *
 * Provides native methods for:
 * - Creating/destroying JS contexts
 * - Evaluating JS code
 * - Registering host functions
 * - Resolving/rejecting pending host function calls
 */

#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include <android/log.h>
#include "quickjs.h"

#define TAG "QuickJSJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

#define MAX_CONTEXTS 32

typedef struct {
    char id[64];
    JSRuntime *runtime;
    JSContext *context;
    int active;
} ContextSlot;

static ContextSlot contexts[MAX_CONTEXTS] = {0};
static int context_counter = 0;

static ContextSlot* find_context(const char *id) {
    for (int i = 0; i < MAX_CONTEXTS; i++) {
        if (contexts[i].active && strcmp(contexts[i].id, id) == 0) {
            return &contexts[i];
        }
    }
    return NULL;
}

static ContextSlot* alloc_context(void) {
    for (int i = 0; i < MAX_CONTEXTS; i++) {
        if (!contexts[i].active) {
            return &contexts[i];
        }
    }
    return NULL;
}

/* ========================================================================= */
/* JNI Methods                                                                */
/* ========================================================================= */

JNIEXPORT jstring JNICALL
Java_expo_modules_quickjsnative_QuickJSBridge_nativeCreateContext(
    JNIEnv *env, jobject thiz)
{
    ContextSlot *slot = alloc_context();
    if (!slot) {
        LOGE("No free context slots");
        return (*env)->NewStringUTF(env, "");
    }

    context_counter++;
    snprintf(slot->id, sizeof(slot->id), "qjs-ctx-%d", context_counter);
    slot->runtime = JS_NewRuntime();
    slot->context = JS_NewContext(slot->runtime);
    slot->active = 1;

    /* Create the `env` global object for host functions */
    JSValue global = JS_GetGlobalObject(slot->context);
    JSValue env_obj = JS_NewObject(slot->context);
    JS_SetPropertyStr(slot->context, global, "env", env_obj);
    JS_FreeValue(slot->context, global);

    LOGI("Created context: %s", slot->id);
    return (*env)->NewStringUTF(env, slot->id);
}

JNIEXPORT jstring JNICALL
Java_expo_modules_quickjsnative_QuickJSBridge_nativeEvalCode(
    JNIEnv *env, jobject thiz, jstring contextId, jstring code)
{
    const char *ctx_id = (*env)->GetStringUTFChars(env, contextId, NULL);
    const char *js_code = (*env)->GetStringUTFChars(env, code, NULL);

    ContextSlot *slot = find_context(ctx_id);
    if (!slot) {
        LOGE("Context not found: %s", ctx_id);
        (*env)->ReleaseStringUTFChars(env, contextId, ctx_id);
        (*env)->ReleaseStringUTFChars(env, code, js_code);
        return (*env)->NewStringUTF(env, "{\"error\":\"Context not found\"}");
    }

    JSValue result = JS_Eval(slot->context, js_code, strlen(js_code),
                             "<eval>", JS_EVAL_TYPE_GLOBAL);

    jstring ret;
    if (JS_IsException(result)) {
        JSValue exception = JS_GetException(slot->context);
        const char *err_str = JS_ToCString(slot->context, exception);
        char error_json[2048];
        snprintf(error_json, sizeof(error_json),
                 "{\"error\":\"%s\"}", err_str ? err_str : "Unknown error");
        if (err_str) JS_FreeCString(slot->context, err_str);
        JS_FreeValue(slot->context, exception);
        ret = (*env)->NewStringUTF(env, error_json);
    } else {
        JSValue json_str = JS_JSONStringify(slot->context, result,
                                            JS_UNDEFINED, JS_UNDEFINED);
        const char *c_str = JS_ToCString(slot->context, json_str);
        ret = (*env)->NewStringUTF(env, c_str ? c_str : "null");
        if (c_str) JS_FreeCString(slot->context, c_str);
        JS_FreeValue(slot->context, json_str);
    }

    JS_FreeValue(slot->context, result);

    (*env)->ReleaseStringUTFChars(env, contextId, ctx_id);
    (*env)->ReleaseStringUTFChars(env, code, js_code);

    return ret;
}

JNIEXPORT void JNICALL
Java_expo_modules_quickjsnative_QuickJSBridge_nativeDisposeContext(
    JNIEnv *env, jobject thiz, jstring contextId)
{
    const char *ctx_id = (*env)->GetStringUTFChars(env, contextId, NULL);
    ContextSlot *slot = find_context(ctx_id);

    if (slot) {
        JS_FreeContext(slot->context);
        JS_FreeRuntime(slot->runtime);
        slot->active = 0;
        LOGI("Disposed context: %s", ctx_id);
    }

    (*env)->ReleaseStringUTFChars(env, contextId, ctx_id);
}

JNIEXPORT void JNICALL
Java_expo_modules_quickjsnative_QuickJSBridge_nativeExecutePendingJobs(
    JNIEnv *env, jobject thiz, jstring contextId)
{
    const char *ctx_id = (*env)->GetStringUTFChars(env, contextId, NULL);
    ContextSlot *slot = find_context(ctx_id);

    if (slot) {
        JSContext *pctx;
        while (JS_ExecutePendingJob(slot->runtime, &pctx) > 0) {
            /* continue executing jobs */
        }
    }

    (*env)->ReleaseStringUTFChars(env, contextId, ctx_id);
}

JNIEXPORT void JNICALL
Java_expo_modules_quickjsnative_QuickJSBridge_nativeResolvePromise(
    JNIEnv *env, jobject thiz, jstring contextId, jstring resolveCode)
{
    const char *ctx_id = (*env)->GetStringUTFChars(env, contextId, NULL);
    const char *code = (*env)->GetStringUTFChars(env, resolveCode, NULL);
    ContextSlot *slot = find_context(ctx_id);

    if (slot) {
        JSValue result = JS_Eval(slot->context, code, strlen(code),
                                 "<resolve>", JS_EVAL_TYPE_GLOBAL);
        JS_FreeValue(slot->context, result);

        /* Execute pending microtasks */
        JSContext *pctx;
        while (JS_ExecutePendingJob(slot->runtime, &pctx) > 0) {}
    }

    (*env)->ReleaseStringUTFChars(env, contextId, ctx_id);
    (*env)->ReleaseStringUTFChars(env, resolveCode, code);
}
