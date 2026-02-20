/**
 * quickjs_bridge.h
 *
 * Thin C wrapper around QuickJS that exposes macros and inline functions
 * as regular C functions, making them accessible from Swift.
 *
 * Swift cannot import C macros or some inline functions, so this bridge
 * provides a clean API for the Swift Expo module.
 */

#ifndef QUICKJS_BRIDGE_H
#define QUICKJS_BRIDGE_H

#include "quickjs.h"
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ========================================================================= */
/* Context lifecycle                                                          */
/* ========================================================================= */

JSRuntime *qjsb_new_runtime(void);
JSContext *qjsb_new_context(JSRuntime *rt);
void qjsb_free_context(JSContext *ctx);
void qjsb_free_runtime(JSRuntime *rt);

/* ========================================================================= */
/* Evaluation                                                                 */
/* ========================================================================= */

/**
 * Evaluate JS code in global scope.
 * Returns JS_EXCEPTION on error.
 */
JSValue qjsb_eval_global(JSContext *ctx, const char *code, size_t code_len,
                          const char *filename);

/**
 * Execute pending microtask jobs. Returns number of jobs executed.
 */
int qjsb_execute_pending_jobs(JSRuntime *rt);

/* ========================================================================= */
/* Value creation and access                                                  */
/* ========================================================================= */

JSValue qjsb_undefined(void);
JSValue qjsb_null(void);
JSValue qjsb_new_object(JSContext *ctx);
JSValue qjsb_new_string(JSContext *ctx, const char *str);
JSValue qjsb_new_error(JSContext *ctx);
JSValue qjsb_get_global_object(JSContext *ctx);

/* ========================================================================= */
/* Property access                                                            */
/* ========================================================================= */

JSValue qjsb_get_property_str(JSContext *ctx, JSValue this_obj, const char *prop);
int qjsb_set_property_str(JSContext *ctx, JSValue this_obj, const char *prop,
                           JSValue val);

/* ========================================================================= */
/* Value inspection                                                           */
/* ========================================================================= */

int qjsb_is_exception(JSValue val);
int qjsb_is_undefined(JSValue val);
int qjsb_is_string(JSValue val);
int qjsb_is_object(JSValue val);
int qjsb_is_function(JSContext *ctx, JSValue val);

/* ========================================================================= */
/* Exception handling                                                         */
/* ========================================================================= */

JSValue qjsb_get_exception(JSContext *ctx);

/* ========================================================================= */
/* String conversion                                                          */
/* ========================================================================= */

const char *qjsb_to_cstring(JSContext *ctx, JSValue val);
void qjsb_free_cstring(JSContext *ctx, const char *ptr);

/* ========================================================================= */
/* JSON                                                                       */
/* ========================================================================= */

JSValue qjsb_json_stringify(JSContext *ctx, JSValue obj);
JSValue qjsb_json_parse(JSContext *ctx, const char *buf, size_t buf_len);

/* ========================================================================= */
/* Function calls                                                             */
/* ========================================================================= */

JSValue qjsb_call(JSContext *ctx, JSValue func_obj, JSValue this_obj,
                   int argc, JSValue *argv);

/* ========================================================================= */
/* Promise                                                                    */
/* ========================================================================= */

/**
 * Create a new Promise.
 * resolving_funcs[0] = resolve function
 * resolving_funcs[1] = reject function
 * Returns the promise object.
 */
JSValue qjsb_new_promise(JSContext *ctx, JSValue resolving_funcs[2]);

/* ========================================================================= */
/* Memory management                                                          */
/* ========================================================================= */

void qjsb_free_value(JSContext *ctx, JSValue val);

#ifdef __cplusplus
}
#endif

#endif /* QUICKJS_BRIDGE_H */
