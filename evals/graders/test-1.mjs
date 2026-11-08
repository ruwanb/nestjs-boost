import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export async function check(ctx) {
  const spec = ctx.src.find((f) => /users\.service\.spec\.ts$/.test(f.path));
  ctx.record('UsersService spec uses Test.createTestingModule', Boolean(spec) && /Test\.createTestingModule/.test(spec.text), spec?.path ?? 'no users.service.spec.ts');
  ctx.record('UsersRepository mocked (useValue / useFactory / overrideProvider)', Boolean(spec) && /provide:\s*UsersRepository[\s\S]{0,80}use(Value|Factory)|overrideProvider\(\s*UsersRepository/.test(spec.text), spec?.text.slice(0, 600) ?? '');
  const jestUse = ctx.src.filter((f) => /\.spec\.ts$/.test(f.path) && /\bjest\./.test(f.text)).map((f) => f.path);
  ctx.record('No jest.* globals in a Vitest project', jestUse.length === 0, jestUse.join(', ') || 'none');
  // Mutation: break not-found handling; a meaningful suite must fail.
  const p = join(ctx.workdir, 'src/users/users.service.ts');
  const orig = readFileSync(p, 'utf8');
  writeFileSync(p, orig.replace(/throw new NotFoundException\([^;]*;/, 'return undefined as any;'));
  const mutated = ctx.run('npx vitest run src/users');
  writeFileSync(p, orig);
  ctx.record('Unit tests catch broken NotFoundException handling', !mutated.ok, mutated.ok ? 'tests still passed after mutation' : 'tests failed after mutation');
}
