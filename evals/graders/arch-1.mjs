import { req, show, fileText, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const c = await req(base, 'POST', '/users', { body: { email: 'neo@example.com', name: 'Neo', password: 'x' } });
    const n = await req(base, 'GET', '/notifications');
    ctx.record('POST /users then GET /notifications lists the new email', c.status === 201 && n.text.includes('neo@example.com'), `${show(c)} || ${show(n)}`);
  });
  const notif = fileText(ctx, /notifications?\.module\.ts$/);
  ctx.record('NotificationsModule exports NotificationsService', /exports:\s*\[[^\]]*NotificationsService/.test(notif), notif.slice(0, 400) || 'no notifications.module.ts');
  const users = fileText(ctx, /users\/users\.module\.ts$/);
  ctx.record('UsersModule imports NotificationsModule', /imports:\s*\[[^\]]*NotificationsModule/.test(users), users.slice(0, 400));
  ctx.record('NotificationsService not re-registered in UsersModule providers', !/providers:\s*\[[^\]]*NotificationsService/.test(users), users.slice(0, 400));
  const globals = ctx.grep(/@Global\(\)/);
  ctx.record('No @Global() module introduced', globals.length === 0, globals.join(', ') || 'none');
}
