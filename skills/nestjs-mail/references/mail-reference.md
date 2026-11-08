# @nestjs/mail reference

## Contents
- Module options
- FileTemplateEngine and template syntax
- Send options and results
- Transports
- Attachments and preview route
- Custom transports and template engines
- Events

## Module options

`MailModule.forRoot()` / `forRootAsync()` factory (or `MailOptionsFactory.createMailOptions()`):

| Option | Default | Notes |
| --- | --- | --- |
| `transport` | required | `MailTransport` instance or class (classes get DI) |
| `templates` | none | `MailTemplateEngine` instance or class; without one, `template` mails fail with `MailTemplateError` |
| `from` | none | default sender; missing → `MailMessageError` |
| `replyTo`, `headers` | none | defaults; message values win |
| `retry` | 3 attempts | `attempts`, `backoff` (`delay`, `factor`, `maxDelay`, `jitter` or a function), `retryIf` (narrows); `false` = one attempt |
| `imports` | none | modules a transport/engine class injects from |
| `isGlobal` | `true` | |

## FileTemplateEngine and template syntax

`new FileTemplateEngine({ dir, layout?, cache = true })`. Partials live in `dir/partials/`. Locale lookup: `name.pt-BR.html` → `name.pt.html` → `name.html` (same for `.txt`). Template names: letters, digits, `-` (and folders).

| Syntax | Meaning |
| --- | --- |
| `{{ a.b }}`, `{{ items.0 }}` | escaped value; missing = empty |
| `{{{ body }}}` | raw (layout's body; `html`-tagged values are raw anyway) |
| `{{#if x}} … {{else if y}} … {{else}} … {{/if}}` | falsy: false, 0, '', empty list, missing |
| `{{#unless x}} … {{/unless}}` | inverse |
| `{{#each items}} … {{else}} … {{/each}}` | `this`, `@index`, `@first`, `@last`, `@key`; `../x`, `@root.x` |
| `{{> signature}}` | partial in the mail's locale |
| `{{! note }}`, `{{!-- note --}}` | comments |
| `\{{` | literal braces |

Values only in element content and quoted attribute values; unquoted attributes or values between attributes are compile errors (`file:line:col` in the message).

## Send options and results

`mailer.send(MailClass, opts)` or `mailer.send(message)`:
`to`/`cc`/`bcc` (one address string, `{ name, address }`, or arrays; `bcc` envelope only), `data`, `locale`, `from`, `replyTo`, `subject`/`html`/`text` (inline), `template`/`context`, `attachments` (`filename`, `content` Buffer|string|stream or `path`, `contentType`, `cid`), `headers` (e.g. `List-Unsubscribe`), `retry`, `signal`, `idempotencyKey`.

Result: `messageId`, `providerMessageId`, `accepted`, `response`. `mailer.render(...)` returns the `MailMessage` without sending.

## Transports

| Transport | Options | Idempotency |
| --- | --- | --- |
| `SmtpTransport` | `url` or `host`/`port`/`secure`, `startTls` (`required` default; `opportunistic` for localhost; `never`), `auth` (`user` + `pass` or `accessToken`), `authMethod` (PLAIN, LOGIN, XOAUTH2), `name`, `tls`, `pool`, `timeouts`, `dkim` (`domainName`, `keySelector`, `privateKey`, `headers`) | derived `Message-ID` |
| `ResendTransport` | `apiKey`, `baseUrl`, `timeout`, `fetch` | `Idempotency-Key` (24 h) |
| `PostmarkTransport` | `serverToken`, `messageStream` (`outbound`), `baseUrl`, `timeout`, `fetch` | none |
| `SendGridTransport` | `apiKey`, `baseUrl`, `timeout`, `fetch` | none |
| `SesTransport` | `region`, `credentials`, `configurationSetName`, `endpoint`, `timeout`, `fetch` | none |
| `FileMailTransport` | `directory`, `log` | dev only |
| `LogMailTransport` | `body`, `logger` | dev only — logs links! |
| `InMemoryMailTransport` | — | tests |

SMTP `pool: true`: up to 5 connections, 100 messages each, 30 s idle (object form: `maxConnections`, `maxMessages`, `idleTimeout`). Default timeouts: 30 s connect, 30 s greeting, 1 min per command. When SMTP rejects any recipient, the transaction resets before DATA, so nobody receives a partial send.

## Attachments and preview route

- Never build an attachment `path` from user input; URLs are refused.
- Preview (development only — don't register in production):

```typescript
@Controller('dev/mail')
export class MailPreviewController {
  constructor(private readonly mailer: Mailer) {}
  @Get('order-confirmation') @Header('content-type', 'text/html; charset=utf-8')
  async orderConfirmation() {
    const message = await this.mailer.render(OrderConfirmationMail, { data: SAMPLE });
    return message.html;   // inline cid: images as data: URLs for browsers
  }
}
// NotificationsModule: controllers: process.env.NODE_ENV === 'production' ? [] : [MailPreviewController]
```

## Custom transports and template engines

- Transport: extend `MailTransport`, implement sending a built `MailMessage`; throw `MailError` subclasses with the right `permanent` flag; honour the `signal`.
- Template engine: implement `MailTemplateEngine` to plug in Handlebars, MJML or another engine (escaping becomes your engine's job).

## Events

`MailEvents.events$`, one event per send after retries; channels `nestjs:mail:sent` (`messageId`, `mail`, `recipients`, `subject`, `transport`, `attempts`, `durationMs`, `providerMessageId`) and `nestjs:mail:failed` (same + `error`, `permanent`). Invalid messages throw before any event.
