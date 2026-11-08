import { req, show, withApp } from './_lib.mjs';
export async function check(ctx) {
  await withApp(ctx, ctx.env, async (base) => {
    const c = await req(base, 'POST', '/users', { body: { email: 'kim@example.com', name: 'Kim', password: 'correct horse' } });
    const stored = c.json?.passwordHash;
    ctx.record('Stored password is not the plaintext', c.status === 201 && stored !== 'correct horse', stored === undefined ? 'passwordHash not exposed (checked via login + source)' : `passwordHash=${String(stored).slice(0, 40)}`);
    const good = await req(base, 'POST', '/auth/login', { body: { email: 'kim@example.com', password: 'correct horse' } });
    ctx.record('Correct password -> { ok: true }', good.status < 300 && good.json?.ok === true, show(good));
    const bad = await req(base, 'POST', '/auth/login', { body: { email: 'kim@example.com', password: 'wrong' } });
    ctx.record('Wrong password -> 401', bad.status === 401, show(bad));
  });
  const strong = ctx.grep(/PasswordHasher|scrypt|argon2|bcrypt/);
  const weak = ctx.grep(/createHash\(\s*['"](sha\d+|md5)/);
  ctx.record('Uses a password-hashing algorithm, not a plain digest', strong.length > 0 && weak.length === 0, `strong: ${strong.join(', ') || 'none'}; weak: ${weak.join(', ') || 'none'}`);
}
