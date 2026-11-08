import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { req, show } from './_lib.mjs';
export async function check(ctx) {
  const good = await ctx.boot({ DATABASE_URL: 'postgres://u:p@localhost:5432/app' });
  ctx.record('Starts with DATABASE_URL and listens on PORT', Boolean(good.base), good.base ? 'listening' : good.output().slice(-400));
  if (good.base) { const r = await req(good.base, 'GET', '/'); ctx.record('Serves requests', r.status === 200, show(r)); good.stop(); }
  // Hide any .env the agent created so the missing-variable path is really exercised.
  const envFile = join(ctx.workdir, '.env');
  const hidden = existsSync(envFile);
  if (hidden) renameSync(envFile, envFile + '.grader-hidden');
  try {
    const bad = await ctx.boot({ DATABASE_URL: '' });
    const out = bad.output();
    ctx.record('Refuses to start without DATABASE_URL, naming it', !bad.base && /DATABASE_URL/.test(out), bad.base ? 'started anyway' : out.slice(-400));
    if (bad.base) bad.stop();
  } finally {
    if (hidden) renameSync(envFile + '.grader-hidden', envFile);
  }
  const joi = ctx.deps.joi;
  if (joi) {
    const major = Number(String(joi).replace(/[^0-9.]/g, '').split('.')[0]);
    const cfg = ctx.src.map((f) => f.text).join('\n');
    const oldOpts = /validationOptions:\s*\{\s*(allowUnknown|abortEarly)/.test(cfg);
    ctx.record('Joi is v18+ and options under libraryOptions', major >= 18 && !oldOpts, `joi ${joi}; top-level joi options: ${oldOpts}`);
  } else {
    ctx.record('Joi is v18+ and options under libraryOptions', true, 'Joi not used');
  }
  const std = Boolean(ctx.deps.zod || ctx.deps.valibot || ctx.deps.arktype) || ctx.grep(/validate\s*[:(]/).length > 0;
  ctx.record('[docs] Standard Schema library or validate() instead of Joi', std && !ctx.deps.joi, `zod/valibot/arktype: ${Boolean(ctx.deps.zod || ctx.deps.valibot || ctx.deps.arktype)}; joi: ${ctx.deps.joi ?? 'no'}`);
}
