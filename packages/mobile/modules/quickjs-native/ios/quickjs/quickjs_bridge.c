/**
 * quickjs_bridge.c
 *
 * Implementation of the C bridge functions that wrap QuickJS macros
 * and inline functions for Swift accessibility.
 */

#include "quickjs_bridge.h"
#include <string.h>

/* ========================================================================= */
/* Context lifecycle                                                          */
/* ========================================================================= */

JSRuntime *qjsb_new_runtime(void) {
    return JS_NewRuntime();
}

JSContext *qjsb_new_context(JSRuntime *rt) {
    return JS_NewContext(rt);
}

void qjsb_free_context(JSContext *ctx) {
    JS_FreeContext(ctx);
}

void qjsb_free_runtime(JSRuntime *rt) {
    JS_FreeRuntime(rt);
}

/* ========================================================================= */
/* Evaluation                                                                 */
/* ========================================================================= */

JSValue qjsb_eval_global(JSContext *ctx, const char *code, size_t code_len,
                          const char *filename) {
    return JS_Eval(ctx, code, code_len, filename, JS_EVAL_TYPE_GLOBAL);
}

int qjsb_execute_pending_jobs(JSRuntime *rt) {
    int count = 0;
    JSContext *pctx;
    while (JS_ExecutePendingJob(rt, &pctx) > 0) {
        count++;
    }
    return count;
}

/* ========================================================================= */
/* Value creation and access                                                  */
/* ========================================================================= */

JSValue qjsb_undefined(void) {
    return JS_UNDEFINED;
}

JSValue qjsb_null(void) {
    return JS_NULL;
}

JSValue qjsb_new_object(JSContext *ctx) {
    return JS_NewObject(ctx);
}

JSValue qjsb_new_string(JSContext *ctx, const char *str) {
    return JS_NewString(ctx, str);
}

JSValue qjsb_new_error(JSContext *ctx) {
    return JS_NewError(ctx);
}

JSValue qjsb_get_global_object(JSContext *ctx) {
    return JS_GetGlobalObject(ctx);
}

/* ========================================================================= */
/* Property access                                                            */
/* ========================================================================= */

JSValue qjsb_get_property_str(JSContext *ctx, JSValue this_obj, const char *prop) {
    return JS_GetPropertyStr(ctx, this_obj, prop);
}

int qjsb_set_property_str(JSContext *ctx, JSValue this_obj, const char *prop,
                           JSValue val) {
    return JS_SetPropertyStr(ctx, this_obj, prop, val);
}

/* ========================================================================= */
/* Value inspection                                                           */
/* ========================================================================= */

int qjsb_is_exception(JSValue val) {
    return JS_IsException(val);
}

int qjsb_is_undefined(JSValue val) {
    return JS_IsUndefined(val);
}

int qjsb_is_string(JSValue val) {
    return JS_IsString(val);
}

int qjsb_is_object(JSValue val) {
    return JS_IsObject(val);
}

int qjsb_is_function(JSContext *ctx, JSValue val) {
    return JS_IsFunction(ctx, val);
}

/* ========================================================================= */
/* Exception handling                                                         */
/* ========================================================================= */

JSValue qjsb_get_exception(JSContext *ctx) {
    return JS_GetException(ctx);
}

/* ========================================================================= */
/* String conversion                                                          */
/* ========================================================================= */

const char *qjsb_to_cstring(JSContext *ctx, JSValue val) {
    return JS_ToCString(ctx, val);
}

void qjsb_free_cstring(JSContext *ctx, const char *ptr) {
    JS_FreeCString(ctx, ptr);
}

/* ========================================================================= */
/* JSON                                                                       */
/* ========================================================================= */

JSValue qjsb_json_stringify(JSContext *ctx, JSValue obj) {
    return JS_JSONStringify(ctx, obj, JS_UNDEFINED, JS_UNDEFINED);
}

JSValue qjsb_json_parse(JSContext *ctx, const char *buf, size_t buf_len) {
    return JS_ParseJSON(ctx, buf, buf_len, "<input>");
}

/* ========================================================================= */
/* Function calls                                                             */
/* ========================================================================= */

JSValue qjsb_call(JSContext *ctx, JSValue func_obj, JSValue this_obj,
                   int argc, JSValue *argv) {
    return JS_Call(ctx, func_obj, this_obj, argc, argv);
}

/* ========================================================================= */
/* Promise                                                                    */
/* ========================================================================= */

JSValue qjsb_new_promise(JSContext *ctx, JSValue resolving_funcs[2]) {
    return JS_NewPromiseCapability(ctx, resolving_funcs);
}

/* ========================================================================= */
/* Memory management                                                          */
/* ========================================================================= */

void qjsb_free_value(JSContext *ctx, JSValue val) {
    JS_FreeValue(ctx, val);
}
