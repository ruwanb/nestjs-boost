import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const r = await req(base, 'GET', '/');
    ctx.record('Helmet headers present (x-content-type-options: nosniff)', r.headers.get('x-content-type-options') === 'nosniff', `${show(r)}`);
    const pre = { 'access-control-request-method': 'POST' };
    const ok = await req(base, 'OPTIONS', '/', { headers: { origin: 'https://app.example.com', ...pre } });
    ctx.record('Preflight from app.example.com allowed with credentials', ok.headers.get('access-control-allow-origin') === 'https://app.example.com' && ok.headers.get('access-control-allow-credentials') === 'true', `${ok.status} acao=${ok.headers.get('access-control-allow-origin')} acac=${ok.headers.get('access-control-allow-credentials')}`);
    const bad = await req(base, 'OPTIONS', '/', { headers: { origin: 'https://evil.example', ...pre } });
    const acao = bad.headers.get('access-control-allow-origin');
    ctx.record('Other origins not allowed', acao !== 'https://evil.example' && acao !== '*', `acao=${acao}`);
  });
  const builtIn = ctx.grep(/useSecurityHeaders\(/);
  ctx.record('[docs] Uses built-in app.useSecurityHeaders() instead of helmet', builtIn.length > 0 && !ctx.deps.helmet, `useSecurityHeaders: ${builtIn.join(', ') || 'no'}; helmet dep: ${ctx.deps.helmet ?? 'no'}`);
}
