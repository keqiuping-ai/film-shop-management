// Preload only for the isolated recruiting integration test. Never used by the app.
// Every fetch must stay on loopback, including workers started by server.js.
const realFetch = globalThis.fetch;
globalThis.fetch = function recruitingLocalOnlyFetch(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(`Recruiting integration test blocked external network: ${url.hostname}`);
  }
  return realFetch(input, options);
};
