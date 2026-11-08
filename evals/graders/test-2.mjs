import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export async function check(ctx) {
  const specs = ctx.src.filter((f) => /\.e2e-spec\.ts$/.test(f.path) && /\/users/.test(f.text));
  ctx.record('An e2e spec covers /users', specs.length > 0, specs.map((s) => s.path).join(', ') || 'none');
  const p = join(ctx.workdir, 'src/users/users.service.ts');
  const orig = readFileSync(p, 'utf8');
  writeFileSync(p, orig.replace(/throw new NotFoundException\([^;]*;/, 'return { id } as any;'));
  const mutated = ctx.run('npm run test:e2e');
  writeFileSync(p, orig);
  ctx.record('E2E tests catch broken 404 handling', !mutated.ok, mutated.ok ? 'e2e still passed after mutation' : 'e2e failed after mutation');
}
