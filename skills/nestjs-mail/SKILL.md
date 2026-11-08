---
name: nestjs-mail
description: Sends email from NestJS 12 with the first-party @nestjs/mail package — MailModule.forRoot/forRootAsync with transports (SmtpTransport, Resend, Postmark, SendGrid, SES, FileMailTransport for development, InMemoryMailTransport for tests), injectable Mailable classes rendering escaped HTML templates with FileTemplateEngine layouts and partials or the html tagged template, derived plain-text parts, attachments and inline images, per-locale templates, preview routes, sending after commit through @nestjs/outbox with idempotencyKey and retry:false, MailError permanent vs transient handling, MailEvents, and asserting sent mail and links in tests. Use when the user wants transactional emails (order confirmations, password resets, invites), email templates, SMTP or an email API, or testing that an email was sent. Not for push/SMS, newsletters at scale, or the outbox itself (nestjs-outbox).
compatibility: NestJS 12.x; @nestjs/mail; @nestjs/outbox recommended for transactional sending
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS mail (@nestjs/mail)

Prefer `@nestjs/mail` over hand-wiring nodemailer: it escapes template values, retries transient failures, derives text parts and has a test transport. If a project already uses `@nestjs-modules/mailer`/nodemailer, keep it unless asked to migrate.

```bash
npm i @nestjs/mail
```

## Setup

```typescript
MailModule.forRootAsync({
  useFactory: () => ({
    transport: mailTransport(),                                   // picks file | smtp | resend from env, fails at startup if misconfigured
    templates: new FileTemplateEngine({
      dir: join(import.meta.dirname, 'mail/templates'),
      layout: 'layout',
      cache: process.env.NODE_ENV === 'production',              // false in dev: edits show without restart
    }),
    from: process.env.MAIL_FROM ?? 'Orders <orders@example.com>',
  }),
}),
```

```json
// nest-cli.json — tsc doesn't copy HTML
{ "compilerOptions": { "assets": ["mail/templates/**/*"], "watchAssets": true } }
```

- Global; provides `Mailer`, `MailEvents`, `MailTransport` (override token in tests), `MailTemplateEngine`.
- Transports: `SmtpTransport({ url, pool: true, tls?, dkim? })` (STARTTLS required by default), `ResendTransport({ apiKey })`, `PostmarkTransport({ serverToken })`, `SendGridTransport({ apiKey })`, `SesTransport({ region, credentials })`; dev: `FileMailTransport({ directory: 'var/mail' })` (.eml files), `LogMailTransport`; tests: `InMemoryMailTransport`.
- Load env through validated config in real code (nestjs-configuration).

## Mail classes and templates

```typescript
@Injectable()
export class OrderConfirmationMail implements Mailable<{ order: Order; customer: Customer }> {
  constructor(private readonly invoices: InvoicePdf) {}
  render({ order, customer }: { order: Order; customer: Customer }) {
    return {
      subject: `Your order #${order.number}`,
      template: 'order-confirmation',                             // mail/templates/order-confirmation.html in the layout
      context: { customer, total: formatPrice(order.total), orderUrl: `${SHOP_URL}/orders/${order.id}` },
      attachments: [{ filename: `invoice-${order.number}.pdf`, content: this.invoices.render(order, customer), contentType: 'application/pdf' }],
    };
  }
}
```

- Register mail classes as providers. Format values (prices, links) in `render()` — templates are logic-less.
- Template syntax is a Handlebars subset: `{{ value }}` (escaped), `{{{ body }}}` (raw, layout only), `#if/#unless/#each`, `{{> partial }}` from `partials/`, comments. Values only in element content or **quoted** attributes; elsewhere is a compile error.
- Plain text is derived from HTML; add `name.txt` to write it yourself.
- Small mails inline: `html: html\`<p>Hi ${customer.name}</p>\`` (escaped tagged template).
- Locales: `send(Mail, { locale: 'pt-BR' })` picks `name.pt-BR.html` → `name.pt.html` → `name.html` (pair with nestjs-i18n for strings).
- Inline images: attachment with `cid`, referenced as `src="cid:logo@example.com"`.

## Sending

```typescript
await this.mailer.send(OrderConfirmationMail, { to: { name: customer.name, address: customer.email }, data: { order, customer } });
```

- `to` is an object or a string with **exactly one** address (comma lists throw); arrays for several. Also `cc`, `bcc`, `replyTo`, `headers`, `attachments`, `locale`, `retry`, `signal`, `idempotencyKey`.
- Never send inside a DB transaction. For mail that must go out iff the transaction commits, add an outbox message in the transaction and send from the handler:

```typescript
@OnOutboxMessage('order.placed', { consumer: 'order-confirmation-mail' })
async sendConfirmation(order: Order, { message, signal }: OutboxHandlerContext) {
  try {
    await this.mailer.send(OrderConfirmationMail, {
      to: …, data: …,
      idempotencyKey: `order-confirmation:${order.id}`,   // stable Message-ID across redeliveries
      signal, retry: false,                               // the outbox retries; don't multiply
    });
  } catch (error) {
    if (error instanceof MailError && error.permanent) throw new NonRetryableMessageError(error.message);   // → dead letter
    throw error;
  }
}
```

- Errors extend `MailError` (`permanent`, `code`): `MailMessageError`, `MailConnectionError`, `MailTimeoutError`, `MailSmtpError` (5xx permanent), `MailRecipientsRejectedError`, `MailTemplateError`, `MailProviderError`.
- Default retry: 3 attempts, backoff 1s→30s with jitter; `Retry-After` honoured for HTTP providers.

## Testing

```typescript
const mailbox = new InMemoryMailTransport();
// .overrideProvider(MailTransport).useValue(mailbox)
const mail = mailbox.assertSent({ to: 'ada@example.com', mail: OrderConfirmationMail });
expect(mail.subject).toBe('Your order #1001');
expect(mail.link('/orders/').pathname).toBe(`/orders/${order.id}`);
expect(mail.attachment('invoice-1001.pdf').contentType).toBe('application/pdf');
mailbox.failNext(new MailSmtpError('RCPT TO', { code: 550, text: 'User unknown' }));
```

`assertNotSent()`, `filter()`, `find()`, `mails`, `clear()`, `raw`; `mailer.render(Mail, { data })` for template unit tests.

## Production checklist

SPF/DKIM/DMARC; STARTTLS + certificate verification on (`tls.ca` for private CAs); credentials from a secret store; outbox + `idempotencyKey` + `retry: false` in handlers; alert on dead letters and `MailEvents` `failed` (`nestjs:mail:failed`); never File/Log transports in production; ship templates as assets with cache on; no preview routes in production; `app.enableShutdownHooks()`.

## Workflow

- [ ] 1. Install; env-driven transport factory; `FileTemplateEngine` with layout; assets in `nest-cli.json`.
- [ ] 2. Mail class + template (+ partials, attachments); register as provider.
- [ ] 3. Send after commit via the outbox handler (or directly for non-critical mail).
- [ ] 4. Tests with `InMemoryMailTransport` (assert recipients, subject, links). Build, lint, run tests, start the app and check `var/mail`.

## Reference files

- `references/mail-reference.md`: module/engine/send options, every transport's options, SMTP pool and timeouts, template syntax table, events and the preview route pattern. Read when configuring transports or writing complex templates.

Sources: [Mail](https://docs.nestjs.com/application/mail)
