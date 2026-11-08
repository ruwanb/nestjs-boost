import { withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (_base, output) => {
    const boot = output().split('\n').filter((l) => /NestFactory|InstanceLoader|RoutesResolver|successfully started/.test(l));
    ctx.record('Bootstrap log lines contain [api]', boot.length > 0 && boot.every((l) => l.includes('[api]')), boot.slice(0, 3).join(' | ') || output().slice(0, 300));
  });
  const main = ctx.file('src/main.ts') ?? '';
  ctx.record('bufferLogs: true and logger obtained via app.get', /bufferLogs:\s*true/.test(main) && /useLogger\(\s*(await\s+)?app\.(get|resolve)\(/.test(main), main.slice(0, 600));
}
