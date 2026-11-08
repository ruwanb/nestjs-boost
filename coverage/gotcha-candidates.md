# Gotcha candidates (docs warning boxes, by owner)

Each item is a candidate for the owning skill's Gotchas section. Keep only those an agent would plausibly get wrong; confirm against baseline failures in Phase 3.

## `core-guidelines` (0)

- none

## `nestjs-architecture` (13)

- Because resolution relies on the emitted type, the annotation must refer to something that exists at runtime, that is, a **class**. Interfaces and type aliases are erased during compilation. If `AppConfig` is an interface, `constructor(private config: AppConfig)` leaves Nest with no token to look up, and the application fails at startup with a "Nest can't resolve dependencies" error. The same happens when you import a class with `import type`, because the import is erased as well. To inject something that isn't a class, register it under a token and inject it explicitly with `@Inject()`, as described in [Custom providers](/fundamentals/custom-providers#interfaces-and-abstract-classes). ([Providers](https://docs.nestjs.com/providers))
- If your class doesn't extend another class, prefer **constructor-based** injection. The constructor states explicitly which dependencies the class requires, which makes the code easier to follow than properties annotated with `@Inject()`. ([Providers](https://docs.nestjs.com/providers))
- As mentioned above, making everything global **is not a good design decision**. ([Modules](https://docs.nestjs.com/modules))
- Besides strings, you can also use JavaScript [symbols](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) or TypeScript [enums](https://www.typescriptlang.org/docs/handbook/enums.html) as token values. ([Custom providers](https://docs.nestjs.com/fundamentals/custom-providers))
- Some providers must act as singletons and should not use request-scoped providers, like [_Passport strategies_](/recipes/passport#request-scoped-strategies) or _Cron controllers_. ([Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes))
- This strategy is not ideal for applications with a large number of tenants. ([Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes))
- A circular dependency can also be caused by using "barrel files" (`index.ts` files) to group imports. Avoid barrel files for module and provider classes. In particular, don't use a barrel file to import files within the same directory as the barrel file, i.e., `cats/cats.controller` should not import `cats` to import the `cats/cats.service` file. For more details, see [this GitHub issue on barrel files and circular dependencies](https://github.com/nestjs/nest/issues/1181#issuecomment-430197191). ([Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency))
- The order of instantiation is indeterminate. Make sure your code does not depend on which constructor is called first. Circular dependencies that depend on providers with `Scope.REQUEST` can lead to undefined dependencies. See [this GitHub issue on request-scoped circular dependencies](https://github.com/nestjs/nest/issues/5778) for more information. ([Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency))
- You can't retrieve scoped providers (transient or request-scoped, including providers that are implicitly request-scoped through their dependencies) with the `get()` method. Instead, use the technique described in <a href="/fundamentals/module-ref#resolving-scoped-providers">Resolving scoped providers</a> below. Learn how to control scopes in the [injection scopes](/fundamentals/injection-scopes) chapter. ([Module reference](https://docs.nestjs.com/fundamentals/module-ref))
- [Lifecycle hook methods](/fundamentals/lifecycle-events) are not invoked in lazy loaded modules and services. ([Lazy-loading modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules))
- If you use **webpack**, update your `tsconfig.json` file: set `compilerOptions.module` to `"esnext"` and add the `compilerOptions.moduleResolution` property with `"node"` as its value: ([Lazy-loading modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules))
- The lifecycle hooks listed above are not triggered for **request-scoped** classes. Request-scoped classes are not tied to the application lifecycle, and their lifespan is unpredictable. They are created exclusively for each request and garbage-collected after the response is sent. ([Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events))
- Due to inherent platform limitations, NestJS has limited support for application shutdown hooks on Windows. You can expect `SIGINT` to work, as well as `SIGBREAK` and, to some extent, `SIGHUP`. However, `SIGTERM` never works on Windows, because killing a process in the Task Manager is unconditional (there is no way for an application to detect or prevent it). To learn more about how `SIGINT`, `SIGBREAK`, and other signals are handled on Windows, see the [libuv signal handling documentation](https://docs.libuv.org/en/v1.x/signal.html) and the Node.js documentation on [signal events](https://nodejs.org/api/process.html#process_signal_events). ([Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events))

## `nestjs-request-pipeline` (19)

- Nest detects when a handler uses either `@Res()` or `@Next()`, which indicates that you have chosen the library-specific option. If both approaches are used at the same time, the standard approach is **automatically disabled** for that route and no longer works as expected. To combine them (for example, to inject the response object only to set cookies or headers while leaving the rest to the framework), set the `passthrough` option to `true` in the `@Res({{ '{' }} passthrough: true {{ '}' }})` decorator. ([Controllers](https://docs.nestjs.com/controllers))
- Since **Fastify** does not support nested routers, use the default Express adapter or the Node adapter if you rely on sub-domain routing. ([Controllers](https://docs.nestjs.com/controllers))
- Express and Fastify handle middleware differently and provide different method signatures, while the Node adapter uses the Express signature. See the [HTTP adapters](/http/performance#middleware) chapter for details. ([Middleware](https://docs.nestjs.com/middleware))
- With the Express adapter, Nest registers the `json` and `urlencoded` body parsers (`express.json()` and `express.urlencoded()`) by default. To customize these parsers through the `MiddlewareConsumer`, disable the defaults by setting the `bodyParser` option to `false` when creating the application with `NestFactory.create()`. ([Middleware](https://docs.nestjs.com/middleware))
- Because middleware runs before a route handler is selected, only **global** exception filters (registered with `app.useGlobalFilters()` or the `APP_FILTER` token) catch exceptions thrown from middleware. Method-scoped and controller-scoped filters are not invoked, and binding filters to a middleware class with `@UseFilters()` is not supported. ([Middleware](https://docs.nestjs.com/middleware))
- If you are using `@nestjs/platform-fastify`, use `response.send()` instead of `response.json()`, and import the corresponding types from `fastify`. ([Exception filters](https://docs.nestjs.com/exception-filters))
- The `useGlobalFilters()` method does not set up filters for gateways or hybrid applications. ([Exception filters](https://docs.nestjs.com/exception-filters))
- When combining a catch-everything filter with one bound to a specific exception type, declare the catch-everything filter **first**, so the more specific filter can still handle the type it is bound to. ([Exception filters](https://docs.nestjs.com/exception-filters))
- Method-scoped and controller-scoped filters that extend the `BaseExceptionFilter` should not be instantiated with `new`. Instead, let the framework instantiate them automatically. ([Exception filters](https://docs.nestjs.com/exception-filters))
- TypeScript interfaces disappear during transpilation. If a method parameter's type is declared as an interface instead of a class, the `metatype` value is `Object`. ([Pipes](https://docs.nestjs.com/pipes))
- The `zod` library requires the `strictNullChecks` compiler option to be enabled in your `tsconfig.json` file. ([Pipes](https://docs.nestjs.com/pipes))
- The techniques in this section require TypeScript and are not available if your app is written in vanilla JavaScript. ([Pipes](https://docs.nestjs.com/pipes))
- The code above uses the [class-transformer](https://github.com/typestack/class-transformer) library, which is made by the same author as the **class-validator** library, so the two work well together. ([Pipes](https://docs.nestjs.com/pipes))
- In a hybrid application, `useGlobalPipes()` doesn't set up pipes for connected microservices by default (see [Hybrid application](/faq/hybrid-application) to change this behavior). In a standard (non-hybrid) microservice application, `useGlobalPipes()` does mount the pipes globally. ([Pipes](https://docs.nestjs.com/pipes))
- In a hybrid application, `useGlobalGuards()` doesn't set up guards for connected microservices by default (see [Hybrid application](/faq/hybrid-application) to change this behavior). In a standard (non-hybrid) microservice application, `useGlobalGuards()` does mount the guards globally. ([Guards](https://docs.nestjs.com/guards))
- The `matchRoles()` function is not provided by Nest. Its logic can be as simple or as sophisticated as your application requires; the point of this example is to show how guards fit into the request/response cycle. ([Guards](https://docs.nestjs.com/guards))
- Interceptors, like controllers, providers, guards, and so on, can **inject dependencies** through their `constructor`. ([Interceptors](https://docs.nestjs.com/interceptors))
- Response mapping doesn't work with the library-specific response strategy, i.e., when a route handler injects the response object with `@Res()` and sends the response itself. To combine the two, enable the `passthrough` option (see [Library-specific approach](/controllers#library-specific-approach)). ([Interceptors](https://docs.nestjs.com/interceptors))
- The `@ApiHideProperty()` decorator from the `@nestjs/swagger` package is not composable and does not work correctly with the `applyDecorators()` function. ([Custom decorators](https://docs.nestjs.com/custom-decorators))

## `nestjs-validation-serialization` (3)

- If your application uses the `@nestjs/swagger` package, see [this chapter](/openapi/mapped-types) for more information about mapped types. Likewise, if you use the `@nestjs/graphql` package, see [this chapter](/graphql/mapped-types). Both packages rely heavily on type metadata, so they export their own versions of these utilities. Importing them from `@nestjs/mapped-types` instead of `@nestjs/swagger` or `@nestjs/graphql` can cause undocumented side effects. ([Validation](https://docs.nestjs.com/application/validation))
- The handler must return an instance of the class. A plain JavaScript object, such as `{{ '{' }} user: new UserEntity() {{ '}' }}`, is not serialized correctly. To serialize plain objects, see [Transform plain objects](#transform-plain-objects). ([Serialization](https://docs.nestjs.com/application/serialization))
- The response is shaped by the `type` class, not by the class of the returned value. A value that isn't an instance of the `type` class, such as an instance of another entity, is converted like a plain object: the decorators of its own class, such as `@Exclude()`, are ignored, and properties that the `type` class doesn't declare are copied unchanged. To send only the properties of the `type` class, decorate each of them with `@Expose()` and add `excludeExtraneousValues: true` to the options of the same `@SerializeOptions()` decorator. ([Serialization](https://docs.nestjs.com/application/serialization))

## `nestjs-configuration` (4)

- `@nestjs/config` requires TypeScript 4.1 or later. ([Configuration](https://docs.nestjs.com/application/configuration))
- The Node.js parser behind these APIs isn't fully compatible with dotenv. For example, a UTF-8 BOM ends up in the first key name, a quote inside a quoted value ends the value (`'it's here'` becomes `it`), and a value made only of spaces swallows the next line, so the variable defined there is lost. Its behavior has also changed across Node.js 20.x and 22.x minor releases. Node.js doesn't expand variables, and `parseEnv()` returns the keys sorted by name, so don't combine the `parser` option with [`expandVariables`](/application/configuration#expandable-variables): a reference to a variable whose name sorts later resolves as if that variable weren't set. ([Configuration](https://docs.nestjs.com/application/configuration))
- The Nest CLI doesn't automatically copy your "assets" (non-TS files) to the `dist` folder during the build process. To make sure that your YAML files are copied, specify them in the `compilerOptions#assets` object in the `nest-cli.json` file. As an example, if the `config` folder is at the same level as the `src` folder, add `compilerOptions#assets` with the value `"assets": [{{ '{' }}"include": "../config/*.yaml", "outDir": "./dist/config"{{ '}' }}]`. See [Assets](/cli/monorepo#assets) for details. ([Configuration](https://docs.nestjs.com/application/configuration))
- In some circumstances, you may need to access properties loaded through partial registration in the `onModuleInit()` hook rather than in a constructor. This is because the `forFeature()` method runs during module initialization, and the order of module initialization is indeterminate. If you access values loaded this way by another module in a constructor, the module that the configuration depends on may not have initialized yet. The `onModuleInit()` method runs only after all the modules it depends on have been initialized, so this technique is safe. ([Configuration](https://docs.nestjs.com/application/configuration))

## `nestjs-testing` (1)

- The `resolve()` method returns a unique instance of the provider from its own **DI container sub-tree**. Each sub-tree has a unique context identifier. If you call this method more than once and compare the instance references, you'll see that they are not equal. ([Testing](https://docs.nestjs.com/fundamentals/testing))

## `nestjs-cli-tooling` (8)

- In monorepo mode, a project's `compilerOptions` are not merged with the top-level `compilerOptions`. For example, a project-level `assets` array replaces the top-level `assets` array instead of adding to it. To also copy a library's assets when building an application, list the library in `includeLibraryAssets`. ([Workspaces](https://docs.nestjs.com/cli/monorepo))
- When you specify `spec` as an object, the schematic keys don't support aliases. For example, if you set `service: false` and then generate a service through its alias `s`, the spec file is still generated. To cover both the schematic name and its alias, specify both, as shown below. ([Workspaces](https://docs.nestjs.com/cli/monorepo))
- Generate options are applied in the following order of precedence: options passed on the command line take precedence over project-specific options, which in turn override global options. ([Workspaces](https://docs.nestjs.com/cli/monorepo))
- Setting `watchAssets` in a top-level `compilerOptions` property overrides any `watchAssets` settings within the `assets` property. ([Workspaces](https://docs.nestjs.com/cli/monorepo))
- The `paths` mapping is understood only by the TypeScript compiler. Test runners resolve modules on their own. If you run an application's end-to-end tests with Jest, mirror each alias in that application's e2e Jest config `moduleNameMapper` option, for example: `"moduleNameMapper": {{ '{' }} "^@app/my-library(|/.*)$": "<rootDir>/../../libs/my-library/src/$1" {{ '}' }}`. Otherwise, imports through the alias fail at test runtime even though the project compiles. ([Libraries](https://docs.nestjs.com/cli/libraries))
- `nest upgrade` only bumps the **local** `@nestjs/cli` dependency. Update a globally installed CLI yourself with `npm i -g @nestjs/cli@latest`, and do it **before** running the upgrade, because the command itself ships with the CLI. ([Usage](https://docs.nestjs.com/cli/usages))
- `webpack` doesn't automatically copy your assets (e.g., `graphql` files) to the `dist` folder. Similarly, `webpack` isn't compatible with static glob paths (e.g., the `entities` property in `TypeOrmModule`). ([Hot reload](https://docs.nestjs.com/recipes/hot-reload))
- As of NestJS v12, the webpack builder is **deprecated** and Rspack is the default bundler for monorepos. This recipe targets webpack-based CommonJS projects, which is why the examples below use `module.hot` and a plain `bootstrap()` call rather than the ESM top-level `await` used elsewhere in these docs. For new projects, prefer `--builder rspack`. ([Hot reload](https://docs.nestjs.com/recipes/hot-reload))

## `nestjs-logging` (2)

- If a provider factory or a lifecycle hook calls `process.exit()` itself (for example, after a failed connection check), or a startup step never settles (such as a connection that keeps retrying), nothing in the buffer is printed, not even when you stop the process with `Ctrl+C`. Throw an error instead, so that initialization fails and Nest flushes the buffer. ([Logging](https://docs.nestjs.com/application/logger))
- While this technique is useful for many use cases, it inherently obscures the code flow (by creating implicit context), so use it responsibly, and especially avoid creating contextual "[God objects](https://en.wikipedia.org/wiki/God_object)". ([Async local storage](https://docs.nestjs.com/recipes/async-local-storage))

## `nestjs-security-hardening` (8)

- `'unsafe-inline'` in `script-src` gives up most of the protection that CSP offers against cross-site scripting, for every page your application serves. Avoid it in production. ([Security headers](https://docs.nestjs.com/security/helmet))
- On Fastify, a cross-origin `PUT`, `PATCH`, or `DELETE` is rejected at the preflight stage unless you list the method yourself. The same application code works on Express. ([CORS](https://docs.nestjs.com/security/cors))
- Origins allowed by [CORS](/security/cors) are not trusted automatically. If a cross-origin frontend sends state-changing requests with credentials, list its origin in `trustedOrigins` too. ([CSRF Protection](https://docs.nestjs.com/security/csrf))
- A predicate receives the raw request, so none of the matching rules above apply to it. For example, a predicate that tests whether `request.url` starts with `/public/` also skips the check for `/public/../account`, which a router or proxy may resolve to `/account`. Prefer a list of routes where you can. ([CSRF Protection](https://docs.nestjs.com/security/csrf))
- As noted in the [csrf-csrf documentation](https://github.com/Psifi-Solutions/csrf-csrf?tab=readme-ov-file#getting-started), this middleware requires session middleware or `cookie-parser` to be initialized beforehand. `doubleCsrf()` also returns a function that generates the tokens your routes hand to clients. Please refer to the documentation for further details. ([CSRF Protection](https://docs.nestjs.com/security/csrf))
- As explained in the [@fastify/csrf-protection documentation](https://github.com/fastify/csrf-protection#usage), this plugin requires a storage plugin (`@fastify/cookie`, `@fastify/session`, or `@fastify/secure-session`) to be registered first. ([CSRF Protection](https://docs.nestjs.com/security/csrf))
- In Fastify v5.12.1 and later, which `@nestjs/platform-fastify` v12 installs, a number passed as `trustProxy` (a hop count such as `1`) makes Fastify trust no proxy at all. `request.ip` is then the proxy's address, and the throttler counts every client behind the proxy as one. Pass the address or range of your proxy instead, as in the example above. ([Rate limiting](https://docs.nestjs.com/security/rate-limiting))
- The `ttl` is now in **milliseconds**. To keep your `ttl` in seconds for readability, use the `seconds` helper from this package, which multiplies the value by 1000. ([Rate limiting](https://docs.nestjs.com/security/rate-limiting))

## `nestjs-http-platform` (13)

- Trust only the proxies in front of your application. A client that can reach the application directly can send any `X-Forwarded-*` header. ([HTTP adapters](https://docs.nestjs.com/http/performance))
- This feature works only if the built-in global body parser middleware is enabled, i.e., you must not pass `bodyParser: false` when creating the application. ([Raw body](https://docs.nestjs.com/faq/raw-body))
- Make sure you pass the correct application type to the `NestFactory.create()` call. For Express applications, the correct type is `NestExpressApplication`; otherwise, the `useBodyParser()` method won't be found. ([Raw body](https://docs.nestjs.com/faq/raw-body))
- Make sure you pass the correct application type to the `NestFactory.create()` call. For Fastify applications, the correct type is `NestFastifyApplication`; otherwise, the `useBodyParser()` method won't be found. ([Raw body](https://docs.nestjs.com/faq/raw-body))
- This recipe does not work with [GraphQL subscriptions](/graphql/subscriptions). ([HTTPS & multiple servers](https://docs.nestjs.com/faq/multiple-servers))
- With URI Versioning, the version is automatically added to the URI after the <a href="faq/global-prefix">global path prefix</a> (if one exists) and before any controller or route paths. ([Versioning](https://docs.nestjs.com/http/versioning))
- By default, the version in the URI is automatically prefixed with `v`. To change the prefix, set the `prefix` key to your desired value, or set it to `false` to disable it. ([Versioning](https://docs.nestjs.com/http/versioning))
- With the Express adapter, make your `extractor` return a single version (a string, or an array with one element). Selecting the highest matching version from a multi-element array **does not reliably work** in Express due to design limitations of the adapter. If you need that behavior, use the Fastify adapter, which supports both single-version and highest-matching-version selection. ([Versioning](https://docs.nestjs.com/http/versioning))
- If versioning is enabled for the application but a controller or route does not specify a version (and no [global default version](/http/versioning#global-default-version) is set), that controller or route behaves like a [`VERSION_NEUTRAL`](/http/versioning#version-neutral) one. With URI Versioning, it is served only at its path without a version (`/cats`, while `/v1/cats` receives a `404` response status). With the other versioning types, it is served whatever version the request contains, or none. A request containing a version that has no corresponding controller or route receives a `404` response status, as does a request without a version when only versioned controllers or routes match its path. ([Versioning](https://docs.nestjs.com/http/versioning))
- With URI Versioning, a `VERSION_NEUTRAL` resource does not have the version in its URI. ([Versioning](https://docs.nestjs.com/http/versioning))
- Register a version-neutral controller or route, or one that does not specify a version when no [global default version](/http/versioning#global-default-version) is set, after any versioned controllers or routes that share its path: list it later in the module's `controllers` array, declare it below them in the same controller, or put it in a module registered after theirs. A module's own controllers are registered before those of the modules it imports, and imported modules in the order of the `imports` array. With the Express adapter and any versioning type other than URI Versioning, routes that share a path are tried in registration order, so a version-neutral route registered first also receives the requests meant for the versioned ones. ([Versioning](https://docs.nestjs.com/http/versioning))
- With Header, Media Type or Custom Versioning, all versions of an endpoint share one path, so the middleware runs for the requests to every version of `/cats`. To run code for a single version with these versioning types, use a guard or an interceptor on that version's controller or route handler instead. ([Versioning](https://docs.nestjs.com/http/versioning))
- Make sure you pass the `NestFastifyApplication` type when creating the application. Otherwise, the `register()` method isn't available to apply the plugin. ([Compression](https://docs.nestjs.com/http/compression))

## `nestjs-http-web-features` (13)

- `@Cookies()` does not verify signatures. Its values come straight from the client and may have been tampered with, so read any value you need to trust with `@SignedCookies()` instead (see [Signing cookies](#signing-cookies)). ([Cookies](https://docs.nestjs.com/http/cookies))
- To leave the response handling logic to the framework, set the `passthrough` option to `true`, as shown above. See the [library-specific approach](/controllers#library-specific-approach) section of the Controllers chapter for details. ([Cookies](https://docs.nestjs.com/http/cookies))
- `maxAge` is expressed in **seconds**, as in RFC 6265 and `@fastify/cookie`. Express' `res.cookie()` method takes `maxAge` in **milliseconds**, so a value carried over from it unchanged makes the cookie live 1000 times longer. For one day, pass `60 * 60 * 24`. ([Cookies](https://docs.nestjs.com/http/cookies))
- A `secret` that is `undefined`, for example because an environment variable is not set, counts as no secret at all. The application starts, and the error only surfaces when a request sets or reads a signed cookie. Validate your configuration at startup, for example as described in the [Configuration](/application/configuration#schema-validation) chapter. ([Cookies](https://docs.nestjs.com/http/cookies))
- Signing protects the integrity of a cookie, not its confidentiality: the value is stored in plain text, and the client can read it. Do not store sensitive data in a signed cookie. Also note that, as with the `cookie-signature` package, the cookie name is not part of the signed data, so a value signed for one cookie also verifies when the client sends it under another name. ([Cookies](https://docs.nestjs.com/http/cookies))
- The default server-side session storage is purposely not designed for a production environment. It leaks memory under most conditions, does not scale past a single process, and is meant for debugging and development. Read more in the [express-session repository](https://github.com/expressjs/session). ([Session](https://docs.nestjs.com/http/session))
- Multer cannot process data that is not in the `multipart/form-data` format. ([File upload and streaming](https://docs.nestjs.com/http/file-upload))
- `FileInterceptor()` may not be compatible with third party cloud providers like Google Firebase or others. ([File upload and streaming](https://docs.nestjs.com/http/file-upload))
- Multer does not limit the size of uploaded files by default. When you keep files in memory, always set `limits.fileSize`. ([File upload and streaming](https://docs.nestjs.com/http/file-upload))
- Registering `@fastify/multipart` directly on the Fastify instance (`app.getHttpAdapter().getInstance().register(multipart)`), or passing a dynamic `import()` of it to `app.register()`, only works before `app.init()` (which `app.listen()` calls for you). After that, the adapter has already registered the plugin for your upload interceptors, and Fastify fails with an `FST_ERR_DEC_ALREADY_PRESENT` error. Use `app.register(multipart)` or the `multipart` option instead, or set the option to `false` to manage the plugin yourself. ([File upload and streaming](https://docs.nestjs.com/http/file-upload))
- Server-Sent Events routes must return an `Observable` stream (or a `Promise` that resolves to one, as shown [below](/http/server-sent-events#client-disconnection)). ([Server-Sent Events](https://docs.nestjs.com/http/server-sent-events))
- Cleanup wired to the `abort` event may run alongside the `Observable`'s teardown function, so make it idempotent. ([Server-Sent Events](https://docs.nestjs.com/http/server-sent-events))
- By default, `renderPath` matches all paths, and the module responds with the `index.html` file. This enables client-side routing for your SPA, while routes declared in your controllers are still handled by the server. You can change this behavior by combining the `serveRoot` and `renderPath` options with the other options. With the Fastify adapter, set `serveStaticOptions.fallthrough` to `true` to mimic the Express fallthrough behavior, i.e., to send `index.html` instead of a 404 error for routes that don't exist. ([Serve static](https://docs.nestjs.com/recipes/serve-static))

## `nestjs-authentication` (0)

- none

## `nestjs-passport-auth` (3)

- For **any** Passport strategy you choose, you always need the `@nestjs/passport` and `passport` packages. You also need the strategy-specific package (e.g., `passport-jwt` or `passport-local`) that implements the authentication strategy you are building. You can also install the type definitions for the strategy, as shown above with `@types/passport-local`, to get type checking and editor assistance while writing TypeScript code. ([Passport (auth)](https://docs.nestjs.com/recipes/passport))
- In a real application, never store a password in plain text. Instead, use a library like [bcrypt](https://github.com/kelektiv/node.bcrypt.js#readme) with a salted one-way hash algorithm. With that approach, you store only hashed passwords and compare the stored hash to a hashed version of the **incoming** password, so user passwords are never stored or exposed in plain text. To keep our sample app simple, we violate that rule and use plain text. **Don't do this in your real app.** ([Passport (auth)](https://docs.nestjs.com/recipes/passport))
- **Do not expose this key publicly**. We've done so here to make it clear what the code is doing, but in a production system **you must protect this key** using appropriate measures, such as a secrets vault, an environment variable, or a configuration service. ([Passport (auth)](https://docs.nestjs.com/recipes/passport))

## `nestjs-authorization` (3)

- Other authentication guards, such as a subclass of Passport's `AuthGuard()`, carry no such marker, so the check can only go by their class names. In the wrong order, it logs an error, the app starts, and every `@Can()` check treats signed-in users as guests. Register such a guard with `APP_GUARD`, not with `app.useGlobalGuards()`: Nest runs the guards added that way after every `APP_GUARD`, so they always come after the authorization guard, and the check can't see them. ([Authorization](https://docs.nestjs.com/security/authorization))
- `before()` skips every ability of its policy, including rules that should bind everyone. That's why `OrderPolicy` gets no admin bypass: "nobody refunds a shipped order" has to hold for Ada too. If a policy needs both, check the ability name that `before()` receives, and return nothing for the abilities it must not skip. Implement `PolicyBefore<User, Ability<OrderPolicy>>` and type the name as `Ability<OrderPolicy>`, so a misspelled exclusion doesn't compile. ([Authorization](https://docs.nestjs.com/security/authorization))
- Policies must be singletons. A request-scoped or transient policy, or one that depends on a request-scoped provider, throws at startup. Keep per-request state out of policies, and pass what an ability needs as arguments. ([Authorization](https://docs.nestjs.com/security/authorization))

## `nestjs-database-typeorm` (6)

- Don't use `synchronize: true` in production; otherwise, you can lose production data. ([TypeORM](https://docs.nestjs.com/data/typeorm))
- Don't forget to import the `UsersModule` into the root `AppModule`. ([TypeORM](https://docs.nestjs.com/data/typeorm))
- Entities that aren't registered through `forFeature()`, and are only referenced from another entity (via a relation), aren't included by the `autoLoadEntities` setting. ([TypeORM](https://docs.nestjs.com/data/typeorm))
- If you provide the `target` option, the `name` option must match the name of the target class. If you don't provide `target`, you can use any name. ([TypeORM](https://docs.nestjs.com/data/typeorm))
- If you don't set a `name` for a data source, its name is `default`. Don't register multiple data sources without a name, or with the same name; otherwise, they override each other. ([TypeORM](https://docs.nestjs.com/data/typeorm))
- If you use `TypeOrmModule.forRootAsync()`, you must **also** set the data source name outside `useFactory`. For example: ([TypeORM](https://docs.nestjs.com/data/typeorm))

## `nestjs-database-drizzle` (4)

- You can also pass a `db` instance to `forRoot()`, e.g., one exported by a `db` file that your seed scripts import too. Such an instance is created once, when its file is first imported. Every application created from `AppModule` shares it, and the first application to shut down closes it, which breaks e2e test suites that create a new application for each test. In that case, set `autoCloseConnection` to `false` and close the client yourself. ([Drizzle](https://docs.nestjs.com/data/drizzle))
- Repository methods query the injected database, not a transaction's `tx`. With a connection pool, they run on a different connection than a transaction started elsewhere with `db.transaction()`, so they aren't part of it. To run them in a transaction, accept `tx` as a parameter, or propagate the transaction with `nestjs-cls` as described above. ([Drizzle](https://docs.nestjs.com/data/drizzle))
- When several instances of your application start at the same time, each of them tries to apply the migrations. In such deployments, run `drizzle-kit migrate` as a separate step of your release process instead. ([Drizzle](https://docs.nestjs.com/data/drizzle))
- A database registered without a `name` is named `default`. Don't register multiple databases without a name, or with the same name: they would share one injection token, and only one of them would be injected. ([Drizzle](https://docs.nestjs.com/data/drizzle))

## `nestjs-database-mongoose` (1)

- Don't create multiple connections without a name or with the same name, otherwise they will override each other. ([MongoDB](https://docs.nestjs.com/data/mongodb))

## `nestjs-database-prisma` (1)

- Install Prisma ORM 7 explicitly, as shown above. At the time of writing, the `latest` tag of the `prisma` package on npm points to a Prisma 8 pre-release, which is a different CLI that doesn't provide the `prisma migrate` and `prisma generate` commands used in this chapter. Keep `prisma` and `@prisma/client` on the same major version. ([Prisma](https://docs.nestjs.com/data/prisma))

## `nestjs-database-mikro-orm` (5)

- With `scope: Scope.REQUEST`, every provider that depends on the `EntityManager` (including repositories) becomes request-scoped as well. This affects performance, as described in the [injection scopes chapter](/fundamentals/injection-scopes#performance). ([MikroORM](https://docs.nestjs.com/data/mikroorm))
- Place `@CreateRequestContext()` directly above the method, below other method decorators such as `@Cron()`. The decorator replaces the method with a wrapper. Decorators listed above it attach their metadata to that wrapper, but decorators listed below it attach their metadata to the original method, which Nest never sees (in this example, the cron job wouldn't be registered). ([MikroORM](https://docs.nestjs.com/data/mikroorm))
- Don't use [Nest's built-in serializer](/application/serialization) (the `ClassSerializerInterceptor`) with MikroORM entities. It relies on `class-transformer`, which doesn't understand the wrappers that MikroORM uses for relations: it serializes the internal structure of a `Reference`, and traversing a `Collection` leads to infinite recursion (a "Maximum call stack size exceeded" error). ([MikroORM](https://docs.nestjs.com/data/mikroorm))
- If you use `MikroOrmModule.forRootAsync()`, set the `contextName` next to `useFactory`, not inside the options object that the factory returns. ([MikroORM](https://docs.nestjs.com/data/mikroorm))
- Set the `driver` option next to `useFactory`, as shown above. The module needs to know the driver before it calls the factory, to register the driver-specific `EntityManager` and `MikroORM` classes as injection tokens. Without it, injecting the `EntityManager` from your driver package fails with a dependency resolution error. ([MikroORM](https://docs.nestjs.com/data/mikroorm))

## `nestjs-database-sequelize` (3)

- Don't forget to import the `UsersModule` into the root `AppModule`. ([Sequelize](https://docs.nestjs.com/data/sequelize))
- Note that models that aren't registered through the `forFeature()` method, but are only referenced from the model (via an association), won't be included. ([Sequelize](https://docs.nestjs.com/data/sequelize))
- If you don't set the `name` for a connection, its name is set to `default`. Please note that you shouldn't have multiple connections without a name, or with the same name, otherwise they will get overridden. ([Sequelize](https://docs.nestjs.com/data/sequelize))

## `nestjs-caching` (4)

- The default in-memory store keeps a reference to the value instead of a copy: `get()` returns the same object that was passed to `set()`, so changing that object afterwards also changes the cached entry. Treat cached values as read-only, or copy a value before changing it. The Keyv stores in [Using alternative Cache stores](/data/caching#using-alternative-cache-stores) serialize values to JSON instead, so class instances come back as plain objects and `Date` objects come back as strings. ([Caching](https://docs.nestjs.com/data/caching))
- In [GraphQL](/graphql/quick-start) applications, interceptors are executed separately for each field resolver. As a result, `CacheModule` (which uses interceptors to cache responses) doesn't work properly there. ([Caching](https://docs.nestjs.com/data/caching))
- By default, only `GET` endpoints are cached (an explicit `@CacheKey()` on a route handler bypasses this check). Also, HTTP routes that inject the native response object (`@Res()`) can't use the `CacheInterceptor`. See [response mapping](/interceptors#response-mapping) for more details. ([Caching](https://docs.nestjs.com/data/caching))
- Always attach an `'error'` listener to the Redis store, as shown above. When the Redis connection drops, the store emits an `'error'` event, and Keyv throws if nothing listens for it, which can crash your application. ([Caching](https://docs.nestjs.com/data/caching))

## `nestjs-http-client` (1)

- Retries multiply along a chain of services. If service A calls B, B calls C, and every hop makes 3 attempts, one failing request to C turns into 9 calls to C, which arrive exactly when C is already struggling. Retry at one layer only, usually the service that calls the external dependency, and set `retry: false` on clients that call your own services. ([HTTP client](https://docs.nestjs.com/application/http-client))

## `nestjs-events` (0)

- none

## `nestjs-scheduling` (2)

- Call `forRoot()` in one module only. Each additional import registers every `@Cron()`, `@Interval()` and `@Timeout()` handler in your app again, so importing it in three modules makes each job run three times. ([Task scheduling](https://docs.nestjs.com/application/task-scheduling))
- Remember to inject the `SchedulerRegistry` before accessing it. Import `CronJob` from the `cron` package. ([Task scheduling](https://docs.nestjs.com/application/task-scheduling))

## `nestjs-queues` (4)

- This doesn't work with BullMQ. Read on for the BullMQ approach. ([Queues](https://docs.nestjs.com/application/queues))
- Because your function runs in a forked process, dependency injection (and the IoC container) isn't available. Your processor function must contain (or create) all instances of the external dependencies it needs. ([Queues](https://docs.nestjs.com/application/queues))
- When using named jobs, you must create a processor for each unique name added to a queue, or the queue reports that a processor for the given job is missing. See <a href="application/queues#consumers">consumers</a> for more information on consuming named jobs. ([Queues](https://docs.nestjs.com/application/queues))
- When you define multiple consumers for the same queue, the `concurrency` option in `@Process({{ '{' }} concurrency: 1 {{ '}' }})` doesn't take effect. The minimum `concurrency` matches the number of consumers defined. This applies even if the `@Process()` handlers use different names to handle named jobs. ([Queues](https://docs.nestjs.com/application/queues))

## `nestjs-mail` (2)

- Never build an attachment `path` from user input. The file at that path is attached, whatever it is. URLs are refused, not fetched. ([Mail](https://docs.nestjs.com/application/mail))
- Pass the locale explicitly. `I18nService` falls back to the current request's locale, and mail is often sent outside the recipient's request: from an outbox handler, as here, or from a request made by someone else, such as an admin. That request's locale is the wrong one. ([Mail](https://docs.nestjs.com/application/mail))

## `nestjs-i18n` (1)

- The locale middleware doesn't wrap subscriptions, which run over WebSockets, or a GraphQL driver that is mounted outside it. That includes the common case of a [global prefix](/faq/global-prefix): Nest mounts the middleware under the prefix, while Apollo stays at `/graphql`, so set `useGlobalPrefix: true` on `GraphQLModule` when you use one. Where the middleware doesn't run, the package falls back to a global interceptor, which reads the locale from the request on the GraphQL context (for a subscription, the WebSocket handshake) and runs after guards. Field resolvers, including those of subscription events, are only covered if you set `fieldResolverEnhancers: ['interceptors']`, guards don't see the locale, and responses carry no `Content-Language`. ([Internationalization](https://docs.nestjs.com/application/i18n))

## `nestjs-file-storage` (1)

- The function classifies the start of the file. It doesn't validate the file: a price list with the right header can hold anything after it. `PriceListsService.import()` must read the whole file, check every row, and delete `file.key` when it rejects the list, as with any check that runs after the interceptor. ([File storage](https://docs.nestjs.com/application/file-storage))

## `nestjs-webhooks` (2)

- With `NODE_ENV=production` and no store registered, startup fails, unless you set `allowInMemoryStorage: true`. ([Webhooks](https://docs.nestjs.com/http/webhooks))
- GitHub signs neither a timestamp nor an id. A captured request verifies forever, and deduplication keys by default on the `X-GitHub-Delivery` header, which isn't signed: the same request replayed with a new value in that header runs the handler again. ([Webhooks](https://docs.nestjs.com/http/webhooks))

## `nestjs-observability` (10)

- Treat `appKey` and `appSecret` like any other credential: read them from environment variables or a secrets manager, never commit them to source control. You can revoke a key from the same page at any time; applications still using it can no longer send telemetry. ([Overview](https://docs.nestjs.com/observability/overview))
- The SDK requires `@nestjs/core` v11.1.4 or later (it relies on the `instrument` application option introduced in that release), and `@nestjs/graphql` v13.4.4 or later if your application uses GraphQL. Earlier versions lack the hooks the SDK needs. ([SDK](https://docs.nestjs.com/observability/sdk))
- With `FastifyAdapter` (or any explicit adapter), the adapter takes the second argument, so the application options - and therefore `instrument` - move to the **third**: ([SDK](https://docs.nestjs.com/observability/sdk))
- Approve only a code you started yourself, and only when it matches your terminal. The code is typed rather than carried in a URL so that nobody can send you a link that approves a key for them. ([SDK](https://docs.nestjs.com/observability/sdk))
- Enabling this ships fragments of your application's source code (usually a few lines around the error) to your dashboard, where they are stored alongside the error. Frames inside `node_modules` and Node internals are never read, only application source. Turn it off if shipping any source is not acceptable for your codebase. ([SDK](https://docs.nestjs.com/observability/sdk))
- The same `traceIdGenerator` is called with HTTP requests and RPC contexts alike. In a [hybrid application](/faq/hybrid-application) that serves both HTTP and a microservice transport, write the generator defensively: check for `headers` first, then fall back to the transport's context. ([Distributed tracing](https://docs.nestjs.com/observability/distributed-tracing))
- Trace inheritance for jobs requires `@nestjs/observe` 0.3.0 or later on **both** the service that adds the job and the service that processes it. With an older producer, jobs carry no id and each run opens its own trace, as before. ([Distributed tracing](https://docs.nestjs.com/observability/distributed-tracing))
- Source context ships a few lines of your application's source code to your dashboard, stored alongside the error. Set `sourceContext: false` if shipping any source is not acceptable for your codebase. ([Error monitoring](https://docs.nestjs.com/observability/error-monitoring))
- NestJS Observe and the OpenTelemetry SDK both hook the database drivers. The combination is tested with `pg`; try it with the drivers you use in a staging environment before production. ([OpenTelemetry](https://docs.nestjs.com/observability/opentelemetry))
- At the time of writing, `@opentelemetry/instrumentation-nestjs-core` supports `@nestjs/core` versions below 12. On NestJS 12 the three spans above aren't recorded, and a trace contains the HTTP and database spans only. Check the package's supported versions for the release you install. ([OpenTelemetry](https://docs.nestjs.com/observability/opentelemetry))

## `nestjs-health-checks` (3)

- A health indicator built with `up()`, `down()`, and `degraded()` reports its state by returning one of them. An error thrown by such an indicator is treated as a bug, not an unhealthy state: it aborts the whole health check and results in a `500` response instead of a `503`. If your indicator wraps an operation that may throw, use `attempt()`, which translates a thrown error into a `'down'` state. ([Health checks](https://docs.nestjs.com/reliability/terminus))
- The `timeout` option of the built-in indicators (e.g., `this.db.pingCheck('database', {{ '{' }} timeout: 1500 {{ '}' }})`) is deprecated. Chain `.withTimeout()` on the returned attempt instead. ([Health checks](https://docs.nestjs.com/reliability/terminus))
- The delay is only applied on `SIGTERM`, which is the signal orchestrators such as Kubernetes send when stopping a container. Other signals (e.g. `SIGINT` from `Ctrl+C`) still switch the health check to `'shutting_down'` but shut the application down immediately. Make sure [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown) are enabled; otherwise, Terminus never receives the signal. ([Health checks](https://docs.nestjs.com/reliability/terminus))

## `nestjs-resilience` (0)

- none

## `nestjs-idempotency` (0)

- none

## `nestjs-outbox` (2)

- With `NODE_ENV=production` and no store registered, startup fails, unless you set `allowInMemoryStorage: true`. ([Transactional outbox](https://docs.nestjs.com/reliability/outbox))
- Over TCP, "published" only means the bytes left the order API. If the analytics service crashes after receiving an event but before processing it, the event is lost. For events you can't lose, use a transport whose broker acknowledges receipt: Kafka, RabbitMQ with publisher confirms, or NATS JetStream. `ClientProxyTransport` accepts a `toPacket` option that maps a message to that transport's record, with its own key and headers. ([Transactional outbox](https://docs.nestjs.com/reliability/outbox))

## `nestjs-workflows` (1)

- With `NODE_ENV=production` and no store registered, startup fails, unless you set `allowInMemoryStorage: true`. ([Durable workflows](https://docs.nestjs.com/reliability/workflows))

## `nestjs-locks` (0)

- none

## `nestjs-cqrs` (0)

- none

## `nestjs-graphql` (29)

- `@nestjs/apollo` v14 requires **Apollo Server v5** (the `@apollo/server` package). If you are upgrading from an older Apollo Server version, see the [Apollo Server migration guide](https://www.apollographql.com/docs/apollo-server/migration/). ([Quick start](https://docs.nestjs.com/graphql/quick-start))
- The `graphql-playground` IDE was removed in `@nestjs/graphql` v14. The `playground` option remains only as a **deprecated boolean alias for GraphiQL**: `playground: false` disables the landing page and `playground: true` enables GraphiQL. Use `graphiql` in new code. ([Quick start](https://docs.nestjs.com/graphql/quick-start))
- The `playground` option still exists, but only as a **deprecated boolean alias** for `graphiql`. If both are set, `graphiql` takes precedence. Migrate `playground: false` to `graphiql: false` and `playground: true` to `graphiql: true`. ([Quick start](https://docs.nestjs.com/graphql/quick-start))
- The logic inside the `AuthorsService` and `PostsService` classes can be as simple or sophisticated as needed. The point of this example is to show how to construct resolvers and how they interact with other providers. ([Resolvers](https://docs.nestjs.com/graphql/resolvers))
- The logic inside the `AuthorsService` and `PostsService` classes can be as simple or sophisticated as needed. The point of this example is to show how to construct resolvers and how they interact with other providers. ([Resolvers](https://docs.nestjs.com/graphql/resolvers))
- Using the `@Resolver` decorator at the method level is not supported with the **code first** approach. ([Resolvers](https://docs.nestjs.com/graphql/resolvers))
- To enable automatic validation of your inputs (and parameters), use `ValidationPipe`. Learn more in the [Validation](/application/validation) and [Pipes](/pipes) chapters. ([Resolvers](https://docs.nestjs.com/graphql/resolvers))
- Support for `subscriptions-transport-ws` was **removed** in `@nestjs/graphql` v14. The package is no longer a dependency, and the `'subscriptions-transport-ws'` key is no longer accepted in the `subscriptions` options object. If you are upgrading, replace that key with `'graphql-ws'` and update your clients to the newer protocol. The two protocols are wire-incompatible, so clients still using `subscriptions-transport-ws` fail to connect. The `onConnect` callback signature differs as well: with `graphql-ws`, it receives the connection context, and extra context values belong in its `extra` field (see [Authentication over WebSockets](/graphql/subscriptions#authentication-over-websockets) below). ([Subscriptions](https://docs.nestjs.com/graphql/subscriptions))
- `PubSub` is a class that exposes a simple `publish` and `subscribe` API. Learn more in the [graphql-subscriptions setup guide](https://www.apollographql.com/docs/graphql-subscriptions/setup.html). The Apollo docs warn that the [default implementation](https://github.com/apollographql/graphql-subscriptions#getting-started-with-your-first-subscription) is not suitable for production. Production apps should use a `PubSub` implementation backed by an external store (see the list of [PubSub implementations](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations)). ([Subscriptions](https://docs.nestjs.com/graphql/subscriptions))
- If you use the `resolve` option, return the unwrapped payload (in our example, return the `newComment` object directly, not a `{{ '{' }} commentAdded: newComment {{ '}' }}` object). ([Subscriptions](https://docs.nestjs.com/graphql/subscriptions))
- `PubSub` is a class that exposes a simple `publish` and `subscribe` API. To register a custom `PubSub` class, see [Subscriptions with custom PubSub](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md#subscriptions-with-custom-pubsub) in the Mercurius documentation. ([Subscriptions](https://docs.nestjs.com/graphql/subscriptions))
- Directives applied through the `@Directive()` decorator are not reflected in the generated schema definition file. ([Directives](https://docs.nestjs.com/graphql/directives))
- TypeScript interfaces cannot be used to define GraphQL interfaces. ([Interfaces](https://docs.nestjs.com/graphql/interfaces))
- This requires setting the `inheritResolversFromInterfaces` property to `true` in the `GraphQLModule` configuration. ([Interfaces](https://docs.nestjs.com/graphql/interfaces))
- Add a const assertion (`as const`) to the array returned by the `types` property of the `createUnionType` function. Without it, TypeScript generates an incorrect declaration file at compile time, and using the union from another project fails with an error. ([Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums))
- This chapter applies only to the code first approach. ([Field middleware](https://docs.nestjs.com/graphql/field-middleware))
- Field middleware functions can't inject dependencies or access Nest's DI container. They are designed to be lightweight and shouldn't perform potentially time-consuming operations (like retrieving data from the database). If you need to call external services or query a data source, do it in a guard or interceptor bound to a root query or mutation handler, and assign the result to the `context` object. You can then access it from within the field middleware (through the `MiddlewareContext` object). ([Field middleware](https://docs.nestjs.com/graphql/field-middleware))
- Field middleware can be applied only to `ObjectType` classes. For more details, see [this GitHub issue](https://github.com/nestjs/graphql/issues/2446). ([Field middleware](https://docs.nestjs.com/graphql/field-middleware))
- If enhancers are enabled at the field resolver level (see [executing enhancers at the field resolver level](/graphql/other-features#execute-enhancers-at-the-field-resolver-level)), field middleware functions run before any interceptors, guards, etc., **bound to the method** (but after the root-level enhancers registered for query or mutation handlers). ([Field middleware](https://docs.nestjs.com/graphql/field-middleware))
- This chapter applies only to the code first approach. ([Mapped types](https://docs.nestjs.com/graphql/mapped-types))
- The returned field metadata is shared with the schema builder. Treat it as read-only, and pass copies of the options (e.g., `{{ '{' }} ...field.options {{ '}' }}`) to `@Field()`. A class without a GraphQL type decorator makes `getFieldsAndDecoratorForType()` throw an `UnableToFindFieldsError`. ([Mapped types](https://docs.nestjs.com/graphql/mapped-types))
- [mercurius-upload](https://github.com/mercurius-js/mercurius-upload) is an exception: register it in the main file. ([Plugins](https://docs.nestjs.com/graphql/plugins))
- This chapter applies only to the code first approach. ([Complexity](https://docs.nestjs.com/graphql/complexity))
- This chapter applies only to the code first approach. ([Extensions](https://docs.nestjs.com/graphql/extensions))
- This chapter applies only to the code first approach. ([CLI Plugin](https://docs.nestjs.com/graphql/cli-plugin))
- This chapter applies only to the code first approach. ([Generating SDL](https://docs.nestjs.com/graphql/generating-sdl))
- This chapter applies only to the code first approach. ([Sharing models](https://docs.nestjs.com/graphql/sharing-models))
- Enabling enhancers for field resolvers can cause performance issues when you return many records and your field resolver runs thousands of times. For this reason, when you enable `fieldResolverEnhancers`, skip the enhancers that aren't strictly necessary for your field resolvers. You can do this with the following helper function: ([Other features](https://docs.nestjs.com/graphql/other-features))
- Mercurius doesn't fully support Federation 2. See Apollo's list of [subgraph libraries that support Federation 2](https://www.apollographql.com/docs/federation/supported-subgraphs#javascript--typescript). ([Federation](https://docs.nestjs.com/graphql/federation))

## `nestjs-websockets` (7)

- Gateways are not instantiated until they are referenced in the providers array of an existing module. ([Gateways](https://docs.nestjs.com/websockets/gateways))
- If your `data` field relies on `ClassSerializerInterceptor`, return a class instance that implements `WsResponse`, because the interceptor ignores plain JavaScript object responses. ([Gateways](https://docs.nestjs.com/websockets/gateways))
- Nest doesn't wait for an async `handleConnection()` to finish before it handles the client's messages, so the hook isn't a gate: messages that arrive before it disconnects the client are still handled. To check each message, bind [guards](/websockets/guards) to the message handlers. To reject a client before any of its messages are handled, use connection-level middleware instead: socket.io's `server.use()` in `afterInit()`, or, with `WsAdapter`, a `verifyClient` function in the `@WebSocketGateway()` options. ([Gateways](https://docs.nestjs.com/websockets/gateways))
- The `@WebSocketServer()` decorator is imported from the `@nestjs/websockets` package. ([Gateways](https://docs.nestjs.com/websockets/gateways))
- As with HTTP, request-scoped providers add per-connection instantiation overhead. Use the default singleton scope unless you need per-connection state. ([Gateways](https://docs.nestjs.com/websockets/gateways))
- Global exception filters (registered with `app.useGlobalFilters()` or the `APP_FILTER` token) don't apply to gateways. Bind WebSocket exception filters at the gateway or method level with `@UseFilters()`. ([Exception filters](https://docs.nestjs.com/websockets/exception-filters))
- To use socket.io with multiple load-balanced instances, you must either disable polling by setting `transports: ['websocket']` in your clients' socket.io configuration, or enable cookie-based routing (sticky sessions) in your load balancer. Redis alone is not enough. See [Enabling sticky session](https://socket.io/docs/v4/using-multiple-nodes/#enabling-sticky-session) in the socket.io documentation for more information. ([Adapters](https://docs.nestjs.com/websockets/adapter))

## `nestjs-mcp-server` (2)

- Over HTTP, this works with clients of the 2026-07-28 revision. A client of a 2025 revision is asked through a request from the server, which needs a session, and the endpoint keeps none: the call ends with a tool error. Over stdio, both work. ([Primitives](https://docs.nestjs.com/mcp/primitives))
- Global guards, interceptors and filters (`app.useGlobalGuards()`, `APP_GUARD`) run on MCP calls too, as they do on GraphQL resolvers, and on the HTTP request that carries them. An enhancer written for HTTP routes that reads `context.switchToHttp().getRequest()` should check `context.getType() === 'http'` first. ([Primitives](https://docs.nestjs.com/mcp/primitives))

## `nestjs-microservices` (11)

- As of NestJS v12, the NATS transporter targets **NATS v3** and uses the `@nats-io/transport-node` driver. If you are upgrading from an earlier version, uninstall the legacy `nats` package (`npm uninstall nats`) and install `@nats-io/transport-node` instead. See the [migration guide](/migration-guide#nats-v3) for details. ([NATS](https://docs.nestjs.com/microservices/nats))
- This section is relevant only if you use the [request-response](/microservices/basics#request-response) message style (the `@MessagePattern()` decorator and the `ClientKafkaProxy.send()` method). Subscribing to the response topic is not necessary for [event-based](/microservices/basics#event-based) communication (the `@EventPattern()` decorator and the `ClientKafkaProxy.emit()` method). ([Kafka](https://docs.nestjs.com/microservices/kafka))
- For event handlers (event-based communication), all unhandled exceptions are considered **retriable exceptions** by default. ([Kafka](https://docs.nestjs.com/microservices/kafka))
- Nest handles a message as a request only when it carries the `kafka_correlationId` and `kafka_replyTopic` headers that `ClientKafkaProxy.send()` adds. Any other message, such as one written by a producer other than Nest, is handled as an event, even when it reaches a `@MessagePattern()` handler: its unhandled exceptions are retriable, and the next message of the partition is only processed once the stream the handler returns completes. For topics that other producers write to, make sure message handlers return streams that complete, and handle the messages they cannot process instead of throwing, unless these should be redelivered. ([Kafka](https://docs.nestjs.com/microservices/kafka))
- To support full-duplex interaction with the `@GrpcStreamMethod()` decorator, the controller method must return an RxJS `Observable`. ([gRPC](https://docs.nestjs.com/microservices/grpc))
- This chapter doesn't implement a fully-featured Google Cloud Pub/Sub server, as that would require diving into transporter-specific technical details. ([Custom transporters](https://docs.nestjs.com/microservices/custom-transport))
- This chapter doesn't implement a fully-featured Google Cloud Pub/Sub client, as that would require diving into transporter-specific technical details. ([Custom transporters](https://docs.nestjs.com/microservices/custom-transport))
- An event handler has no response stream. An error that a filter rethrows for an `@EventPattern()` handler never reaches the producer, so handle the error inside the filter. ([Exception filters](https://docs.nestjs.com/microservices/exception-filters))
- Global exception filters registered on the main HTTP application don't apply to microservices connected to a [hybrid application](/faq/hybrid-application) unless you set the `inheritAppConfig` option. See [sharing configuration](/faq/hybrid-application#sharing-configuration). ([Exception filters](https://docs.nestjs.com/microservices/exception-filters))
- If a hook doesn't call `next()`, the handler never runs. This is the same contract as HTTP middleware. ([Pre-request hooks](https://docs.nestjs.com/microservices/pre-request-hooks))
- The order of these calls matters. With `await app.startAllMicroservices()` first (as above), the microservices begin consuming messages **before** the application's lifecycle hooks (such as `onModuleInit` and `onApplicationBootstrap`) have completed. Call `app.listen()` (or `app.init()`) before `startAllMicroservices()` if your handlers must not receive messages until every module has fully initialized. ([Hybrid application](https://docs.nestjs.com/faq/hybrid-application))

## `nestjs-openapi` (5)

- If you use Fastify, also install `@fastify/static`: ([Introduction](https://docs.nestjs.com/openapi/introduction))
- If you call `createDocument()` eagerly (rather than in a factory function, as shown above), make sure `app.enableVersioning()` runs first. Otherwise, the generated `paths` are missing the version prefix. The factory pattern is unaffected, because the document isn't built until it is first requested. ([Introduction](https://docs.nestjs.com/openapi/introduction))
- When you register `helmet` directly with Fastify instead, its [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) can block the Swagger UI. To resolve this conflict, configure the CSP as shown below: ([Introduction](https://docs.nestjs.com/openapi/introduction))
- Always narrow by vendor before calling a library-specific converter. Passing a Valibot schema to `createSchema()` (or the reverse) throws at document generation time instead of failing gracefully. ([Introduction](https://docs.nestjs.com/openapi/introduction))
- The `parent` and `kind` fields belong to the OpenAPI 3.2 Tag Object. You must call `setOpenAPIVersion('3.2.0')`. Otherwise, the generated document still declares `openapi: 3.0.0`, and strict validators reject these fields. Hierarchy fields can only be defined through `DocumentBuilder.addTag()`. The `@ApiTags()` decorator ignores them and logs a warning. ([Operations](https://docs.nestjs.com/openapi/operations))

## `nestjs-standalone-apps` (0)

- none

## `nestjs-deployment` (1)

- If you use the `@nestjs/swagger` package, serving the Swagger UI from a serverless function requires one extra step. Behind API Gateway, the request's `originalUrl` may lack the trailing slash Swagger UI expects, which causes an endless redirect loop. Register a middleware that restores it **before** calling `SwaggerModule.setup()`: ([Serverless](https://docs.nestjs.com/faq/serverless))

## `nestjs-upgrading` (3)

- If you stay on Jest, note that it can load the ESM-only v12 packages only on Node.js v24.9 or later (older versions fail with `ERR_REQUIRE_ASYNC_MODULE`). Run your test suite on Node.js v24.9+, or consider migrating to Vitest. `nest upgrade` bumps Jest to v30 and warns about this. ([Migration guide](https://docs.nestjs.com/migration-guide))
- This section and the next one are **not** part of upgrading to v12, which is why they come last. A CommonJS application runs on v12 unchanged: `nest upgrade` doesn't touch your module format, and nothing in the framework requires you to switch. Read on only if you *want* to move your project to ESM, on whatever schedule suits you. ([Migration guide](https://docs.nestjs.com/migration-guide))
- `"module": "nodenext"` derives the module format of each file from the nearest `package.json`. Adding `"type": "module"` therefore changes how **every** `.ts` file in the project is emitted, and TypeScript starts reporting the missing import extensions described below. Expect to fix them in the same pass rather than incrementally. ([Migration guide](https://docs.nestjs.com/migration-guide))
