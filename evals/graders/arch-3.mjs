import { req, show, fileText, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const r = await req(base, 'GET', '/orders/user/1');
    ctx.record('GET /orders/user/1 returns orders', r.status === 200 && Array.isArray(r.json?.orders) && r.json.orders.length === 1, show(r));
  });
  const users = fileText(ctx, /users\/users\.module\.ts$/);
  ctx.record('UsersModule exports UsersService', /exports:\s*\[[^\]]*UsersService/.test(users), users.slice(0, 400));
  const orders = fileText(ctx, /orders\/orders\.module\.ts$/);
  ctx.record('UsersService not added to OrdersModule providers', !/providers:\s*\[[^\]]*UsersService/.test(orders), orders.slice(0, 400));
  const globals = ctx.grep(/@Global\(\)/);
  ctx.record('No @Global() module introduced', globals.length === 0, globals.join(', ') || 'none');
}
