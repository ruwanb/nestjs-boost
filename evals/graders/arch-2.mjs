import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const r = await req(base, 'GET', '/payments/config');
    ctx.record('GET /payments/config returns the settings', r.status === 200 && r.json?.apiUrl === 'https://pay.example.com' && r.json?.timeoutMs === 5000, show(r));
  });
  const svc = ctx.src.filter((f) => /PaymentsService/.test(f.text) && /class PaymentsService/.test(f.text)).map((f) => f.text).join('\n');
  const tokenInject = /@Inject\(\s*[A-Za-z_.'"]+\s*\)/.test(svc);
  const abstractToken = ctx.grep(/abstract class \w+/).length > 0;
  ctx.record('Settings injected through a runtime token (@Inject(token) or abstract-class token)', tokenInject || abstractToken, svc.slice(0, 500) || 'PaymentsService not found');
}
