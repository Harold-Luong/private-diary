export function createHealthController(db, { timeoutMs = 3000 } = {}) {
  let pending;

  return async function health(_req, res) {
    // Share an unfinished probe so a database outage cannot queue more queries
    // on every health request. A response timeout does not cancel Prisma's query.
    pending ??= Promise.resolve()
      .then(() => db.$queryRaw`SELECT 1`)
      .then(() => true, () => false)
      .finally(() => { pending = undefined; });

    let timer;
    try {
      const connected = await Promise.race([
        pending,
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })
      ]);
      res.status(connected ? 200 : 503).json({
        status: connected ? 'ok' : 'unavailable',
        database: connected ? 'up' : 'down'
      });
    } finally {
      clearTimeout(timer);
    }
  };
}
