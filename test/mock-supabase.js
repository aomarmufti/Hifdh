// Stands in for @supabase/supabase-js. The data lives in the Node test
// server, NOT in the browser, so clearing browser storage must not lose it.
async function rpc(op, body) {
  const res = await fetch('/mock/' + op, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

class Query {
  constructor(table) { this.table = table; this.f = []; this._single = false; }
  select() { return this; }
  order()  { return this; }
  gte(col, val) { this.f.push(['gte', col, val]); return this; }
  maybeSingle() { this._single = true; return this; }
  async _run() {
    const { rows } = await rpc('select', { table: this.table, filters: this.f });
    return { data: this._single ? (rows[0] || null) : rows, error: null };
  }
  then(res, rej) { return this._run().then(res, rej); }
  async upsert(row, opts) {
    const r = await rpc('upsert', { table: this.table, row, onConflict: opts && opts.onConflict });
    return { data: null, error: r.error || null };
  }
}

export function createClient() {
  let listener = null;
  let session = null;
  return {
    from: (t) => new Query(t),
    auth: {
      async getSession() {
        const { session: s } = await rpc('session', {});
        session = s;
        return { data: { session: s } };
      },
      async signInWithOtp({ email }) {
        const { session: s } = await rpc('signin', { email });
        session = s;
        if (listener) setTimeout(() => listener('SIGNED_IN', s), 0);
        return { data: {}, error: null };
      },
      async signOut() { await rpc('signout', {}); return { error: null }; },
      onAuthStateChange(cb) {
        listener = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    }
  };
}
