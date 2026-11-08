import { req, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const logins = [];
    for (let i = 0; i < 4; i++) logins.push((await req(base, 'POST', '/auth/login', { body: {} })).status);
    ctx.record('4th POST /auth/login -> 429', logins.slice(0, 3).every((s) => s < 300) && logins[3] === 429, logins.join(','));
    const gets = [];
    for (let i = 0; i < 11; i++) gets.push((await req(base, 'GET', '/')).status);
    ctx.record('11th GET / -> 429 after 10 successes', gets.slice(0, 10).every((s) => s === 200) && gets[10] === 429, gets.join(','));
  });
  ctx.record('Uses @nestjs/throttler', Boolean(ctx.deps['@nestjs/throttler']), Object.keys(ctx.deps).join(', ').slice(0, 300));
}
