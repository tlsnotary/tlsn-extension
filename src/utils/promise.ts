export const deferredPromise = (): {
  promise: Promise<never>;
  resolve: (data?: any) => void;
  reject: (reason?: any) => void;
} => {
  let resolve: (data?: any) => void, reject: (reason?: any) => void;

  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  // @ts-ignore
  return { promise, resolve, reject };
};

export type PromiseResolvers = ReturnType<typeof deferredPromise>;
