console.log('This is the background page.');
(async () => {
  // @ts-ignore
  chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'workers for multithreading',
  });
})();