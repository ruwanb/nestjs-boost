"""Write trigger-queries.train.json / .validation.json for the foundation skills.

Usage: python3 -I build_trigger_queries.py <evals-dir>
Each query is labeled with the skill that should load (or "none"). Queries for
conditional skills appear as near-misses here and gain their own positives when
those skills are built. Split is per label, ~60/40, with a fixed seed so every
iteration is compared on the same sets.
"""
import json
import random
import sys

Q = {
    "nestjs-architecture": [
        "Nest can't resolve dependencies of the ReportsService (?). argument ConfigService at index [0] — what's wrong",
        "how should I split my billing stuff into its own module so other parts of the app can use it",
        "I have a circular import between OrdersModule and CustomersModule, how do I fix it properly",
        "make the tenant service request-scoped so each request gets its own tenant",
        "inject a third-party SDK client instance into my services, it's created with new StripeClient(key)",
        "build a reusable module that takes options like forRoot({ apiKey }) and forRootAsync",
        "run some code once all modules are initialized, before the app starts listening",
        "my provider typed as an interface isn't being injected, getting Object at index 0",
        "lazy load the heavy reporting module only when someone hits the export endpoint",
        "close the redis connection cleanly when the app shuts down (SIGTERM in k8s)",
    ],
    "nestjs-request-pipeline": [
        "only admins should be able to hit these routes, check the role on the user object",
        "why isn't my guard running before my interceptor? what's the actual order of execution",
        "wrap every response in { data: ... } automatically",
        "return a consistent error JSON for every exception including 404s",
        "make a @CurrentUser() param decorator that pulls req.user",
        "add middleware that logs method and url for every request, but skip /health",
        "GET /orders/latest is being matched by /orders/:id",
        "time every handler and add an X-Response-Time header",
        "add a global /api prefix but keep /health at the root",
        "convert the id route param to a number and 400 if it's not one",
    ],
    "nestjs-validation-serialization": [
        "validate the request body for creating a customer — email must be valid, age optional int >= 18",
        "strip unknown properties from incoming payloads",
        "use zod schemas to validate the body instead of class-validator",
        "never send the password field back in responses",
        "query params are strings, I need page and limit as numbers with defaults",
        "make UpdateUserDto the same as CreateUserDto but all fields optional",
        "validation errors should list every field that failed, grouped by field",
        "nested array of line items in the order body isn't being validated",
        "rename created_at to createdAt in the output and add a computed fullName",
        "validate a discriminated union body: payment is either card or bank transfer",
    ],
    "nestjs-configuration": [
        "read settings from .env and fail at boot if a required var is missing",
        "different config for dev, staging and prod env files",
        "typed config object for the database settings instead of configService.get('DB_HOST')",
        "use the port from config in main.ts",
        "ConfigService is undefined in my feature module",
        "configure TypeOrmModule asynchronously using values from the config service",
        "load extra settings from a config.yaml file",
        "expand ${VAR} references inside the .env file",
        "upgrading: my Joi validationSchema options allowUnknown/abortEarly stopped working",
        "make env vars available everywhere without importing the config module each time",
    ],
    "nestjs-testing": [
        "write unit tests for PaymentsService and mock the repository",
        "e2e test for POST /orders with supertest",
        "my e2e tests get 401 because of the global auth guard, how do I bypass it in tests only",
        "mock the ConfigService in a unit test",
        "test a request-scoped provider",
        "jest.fn is not defined in my spec file",
        "override a provider with a fake in the testing module",
        "auto-mock all the dependencies of a service in a test",
        "e2e tests use express but the app runs on fastify, tests behave differently",
        "how do I get a coverage report for my nest tests",
    ],
    "nestjs-cli-tooling": [
        "generate a full CRUD resource for invoices",
        "scaffold a new controller and service for shipments",
        "turn the repo into a monorepo with an api app and a worker app sharing a lib",
        "builds are really slow, can we use swc",
        "start:dev restarts take forever, set up hot reload",
        "I want a REPL to call my services against the running app",
        "nest build --webpack is deprecated, what do I use instead",
        "what does nest g library do and how do I import from it",
        "set up nest devtools to see the dependency graph",
        "run nest build for all projects in parallel in CI",
    ],
    "nestjs-logging": [
        "switch to JSON logs in production for datadog",
        "add a correlation id to every log line for a request",
        "use a custom logger everywhere, including the startup logs",
        "log structured fields like orderId with the message",
        "logs before app.useLogger are printed with the default logger",
        "replace the nest logger with pino",
        "disable debug and verbose logs in production",
        "store the current user and tenant per request without passing them around",
        "add timestamps to log lines",
        "inject a logger into a service with the class name as context",
    ],
    "nestjs-security-hardening": [
        "add rate limiting, 100 req per minute per ip",
        "login endpoint gets brute-forced, limit attempts",
        "add security headers",
        "allow CORS only from our frontend domain with cookies",
        "protect cookie-based forms against CSRF",
        "behind a load balancer the rate limiter sees the same IP for everyone",
        "hash passwords before saving users",
        "encrypt a field before storing it and decrypt it later",
        "skip throttling for the health check",
        "helmet breaks the swagger UI",
    ],
    # Near-misses: share vocabulary with foundation skills but belong elsewhere.
    "nestjs-openapi": ["add swagger docs for all endpoints", "document the bearer auth scheme in the openapi spec"],
    "nestjs-authentication": ["add email/password sign-in with sessions and password reset", "add google login and 2FA"],
    "nestjs-passport-auth": ["implement JWT auth with passport-jwt strategy"],
    "nestjs-database-typeorm": ["create a typeorm entity for orders with a relation to customers"],
    "nestjs-graphql": ["add a graphql resolver for products", "my guard doesn't work on graphql resolvers"],
    "nestjs-microservices": ["validation pipe isn't applied to my kafka message handlers"],
    "nestjs-queues": ["process image resizing in a background job with retries"],
    "nestjs-http-client": ["call the shipping carrier's REST API with retries and a timeout"],
    "nestjs-observability": ["set up tracing so I can see slow requests in production"],
    "none": [
        "explain the difference between let and const in typescript",
        "write a SQL query that returns the top 5 customers by revenue",
        "set up a GitHub Actions workflow that runs npm test",
        "fix this React useEffect infinite loop",
    ],
}

SEED = 20261105  # fixed so the split is identical across iterations


def main():
    out_dir = sys.argv[1]
    rng = random.Random(SEED)
    train, val = [], []
    for label, queries in Q.items():
        items = [{"query": q, "expected_skill": label} for q in queries]
        rng.shuffle(items)
        cut = max(1, round(len(items) * 0.6)) if len(items) > 1 else 1
        train += items[:cut]
        val += items[cut:]
    for name, data in (("trigger-queries.train.json", train), ("trigger-queries.validation.json", val)):
        with open(f"{out_dir}/{name}", "w") as f:
            json.dump(data, f, indent=2)
    print(f"train={len(train)} validation={len(val)} total={len(train) + len(val)}")


if __name__ == "__main__":
    main()
