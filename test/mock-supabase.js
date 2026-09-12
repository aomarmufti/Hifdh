// Stands in for @supabase/supabase-js. Data lives in the Node test server, NOT
// in the browser, so clearing browser storage must not lose anything.
async function rpc(op, body) {
  const res = await fetch('/mock/' + op, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

class Query {
  constructor(table) { this.table = table; this.f = []; this._single = false; }
  select()          { return this; }
  order()           { return this; }
  maybeSingle()     { this._single = true; return this; }
  eq(c, v)          { this.f.push(['eq', c, v]);  return this; }
  lt(c, v)          { this.f.push(['lt', c, v]);  return this; }
  gte(c, v)         { this.f.push(['gte', c, v]); return this; }
  in(c, v)          { this.f.push(['in', c, v]);  return this; }

  async _run() {
    if (this._mutation) return this._mutation();
    const { rows } = await rpc('select', { table: this.table, filters: this.f });
    return { data: this._single ? (rows[0] || null) : rows, error: null };
  }
  then(res, rej) { return this._run().then(res, rej); }

  async upsert(row, opts) {
    const r = await rpc('upsert', { table: this.table, row, onConflict: opts && opts.onConflict });
    return { data: r.rows || null, error: r.error || null };
  }
  insert(rows) {
    this._mutation = async () => {
      const r = await rpc('insert', { table: this.table, rows: [].concat(rows) });
      return { data: r.rows, error: r.error || null };
    };
    return this;
  }
  update(row) {
    this._mutation = async () => {
      const r = await rpc('update', { table: this.table, row, filters: this.f });
      return { data: r.rows, error: r.error || null };
    };
    return this;
  }
  delete() {
    this._mutation = async () => {
      const r = await rpc('delete', { table: this.table, filters: this.f });
      return { data: null, error: r.error || null };
    };
    return this;
  }
}

export function createClient() {
  let listener = null;
  return {
    from: (t) => new Query(t),
    auth: {
      async getSession() {
        const { session } = await rpc('session', {});
        return { data: { session } };
      },
      async signInWithOtp({ email }) {
        const { session } = await rpc('signin', { email });
        if (listener) setTimeout(() => listener('SIGNED_IN', session), 0);
        return { data: {}, error: null };
      },
      async signOut() { await rpc('signout', {}); return { error: null }; },
      onAuthStateChange(cb) { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };
}
