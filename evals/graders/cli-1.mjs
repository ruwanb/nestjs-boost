import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { req, show, fileText, withApp } from './_lib.mjs';
export async function check(ctx) {
  const files = ['orders.controller.ts', 'orders.service.ts', 'orders.module.ts', 'dto/create-order.dto.ts', 'dto/update-order.dto.ts', 'entities/order.entity.ts', 'orders.controller.spec.ts'];
  const missing = files.filter((f) => !existsSync(join(ctx.workdir, 'src/orders', f)));
  ctx.record('Standard resource files exist under src/orders', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'all present');
  ctx.record('AppModule imports OrdersModule', /OrdersModule/.test(fileText(ctx, /src\/app\.module\.ts$/)), fileText(ctx, /src\/app\.module\.ts$/).slice(0, 400));
  await withApp(ctx, ctx.env, async (base) => {
    const r = await req(base, 'GET', '/orders');
    ctx.record('GET /orders returns 200', r.status === 200, show(r));
  });
}
