import { req, show, withApp } from './_lib.mjs';
const shaped = (j) => j && 'statusCode' in j && 'message' in j && typeof j.errorCode === 'string' && 'path' in j && 'timestamp' in j;
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const e = await req(base, 'POST', '/orders', { body: {} });
    ctx.record('POST /orders without items -> 400 ORDER_EMPTY with path and timestamp', e.status === 400 && e.json?.errorCode === 'ORDER_EMPTY' && e.json?.path === '/orders' && 'timestamp' in (e.json ?? {}), show(e));
    const ok = await req(base, 'POST', '/orders', { body: { items: [{ sku: 'A', qty: 1 }] } });
    ctx.record('POST /orders with items -> 201', ok.status === 201, show(ok));
    const nf = await req(base, 'GET', '/nope');
    ctx.record('Unknown route -> 404 in the standard shape', nf.status === 404 && shaped(nf.json), show(nf));
  });
  const g = ctx.grep(/APP_FILTER|useGlobalFilters\(/);
  ctx.record('Error shape applied globally', g.length > 0, g.join(', ') || 'no global filter');
  const usesOption = ctx.src.some((f) => /Exception\([^;]*\{[^}]*errorCode\s*:/s.test(f.text) && /^src\//.test(f.path));
  const customClass = ctx.grep(/class \w+ extends (HttpException|BadRequestException)/);
  ctx.record('[docs] Uses the v12 errorCode exception option', usesOption && customClass.length === 0, `errorCode option: ${usesOption}; custom exception classes: ${customClass.join(', ') || 'none'}`);
}
