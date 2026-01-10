(async () => {
  try {
    const resp = await fetch('http://localhost:7888/reconcile-advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'abivar@gmail.com' }),
    });
    const text = await resp.text();
    console.log('STATUS', resp.status);
    console.log(text);
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();
