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

  upsert(row, opts) {
    // Chainable so `.upsert(...).select().maybeSingle()` works like the real
    // client, which reflections rely on to get their generated id back.
    this._mutation = async () => {
      const r = await rpc('upsert', { table: this.table, row, onConflict: opts && opts.onConflict });
      const rows = r.rows || [];
      return { data: this._single ? (rows[0] || null) : rows, error: r.error || null };
    };
    return this;
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
      async getUser() {
        const { session } = await rpc('session', {});
        return { data: { user: session ? session.user : null } };
      },
      // The real fix for the sign-in journey: a session with no email at all.
      async signInAnonymously() {
        const r = await rpc('anon', {});
        if (r.error) return { data: {}, error: { message: r.error } };
        if (listener) setTimeout(() => listener('SIGNED_IN', r.session), 0);
        return { data: { session: r.session }, error: null };
      },
      async signInWithOtp({ email }) {
        await rpc('send-code', { email });
        return { data: {}, error: null };
      },
      async verifyOtp({ email, token, type }) {
        const r = await rpc('verify-code', { email, token, type });
        if (r.error) return { data: {}, error: { message: r.error } };
        if (listener) setTimeout(() => listener('SIGNED_IN', r.session), 0);
        return { data: { session: r.session }, error: null };
      },
      async updateUser({ email }) {
        const r = await rpc('send-code', { email, linking: true });
        return { data: {}, error: r.error ? { message: r.error } : null };
      },
      async signOut() { await rpc('signout', {}); return { error: null }; },
      onAuthStateChange(cb) { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };
}
