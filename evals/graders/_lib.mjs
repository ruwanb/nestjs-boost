// Shared helpers for graders.
export async function req(base, method, path, { headers = {}, body } = {}) {
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(5000) };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  try {
    const res = await fetch(base + path, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  } catch (err) {
    return { status: 0, headers: new Headers(), text: String(err), json: null };
  }
}

export const show = (r) => `${r.status} ${r.text.slice(0, 200)}`;

// Text of a file whose path matches re, or ''.
export const fileText = (ctx, re) => ctx.src.filter((f) => re.test(f.path)).map((f) => f.text).join('\n');

// Boot, run fn(base), always stop. Records a failed boot assertion if needed.
export async function withApp(ctx, env, fn) {
  const app = await ctx.boot(env);
  ctx.record('App boots', Boolean(app.base), app.base ? 'listening' : app.output().slice(-500));
  if (!app.base) return false;
  try { await fn(app.base, app.output); } finally { app.stop(); }
  return true;
}
