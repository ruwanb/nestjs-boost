import { req, show, fileText, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const r = await req(base, 'GET', '/');
    ctx.record('Built app still returns 401 without the key', r.status === 401, show(r));
  });
  const e2e = ctx.src.filter((f) => /\.e2e-spec\.ts$/.test(f.path)).map((f) => f.text).join('\n');
  const overrides = /override(Provider|Guard)\(/.test(e2e);
  const setsEnv = /process\.env\.API_KEY|x-api-key/i.test(e2e);
  ctx.record('Test overrides the guard via the testing module (no real key in tests)', overrides && !setsEnv, `override: ${overrides}; uses env/header key: ${setsEnv}`);
  const mod = fileText(ctx, /app\.module\.ts$/);
  ctx.record('Global guard registration remains in AppModule', /APP_GUARD/.test(mod), mod.slice(0, 500));
}
