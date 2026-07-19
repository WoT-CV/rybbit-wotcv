# Rybbit Server Logging

## Runtime

`logger.ts` owns the server's logging policy and constructs one shared Pino root per process. Fastify receives that root through `loggerInstance`; background modules create children from the same root with `createServiceLogger`.

| Environment            | Default level | Output                                     |
| ---------------------- | ------------- | ------------------------------------------ |
| `production`           | `info`        | newline-delimited JSON on stdout           |
| `development` or unset | `debug`       | colorized single-line `pino-pretty` output |
| `test`                 | `silent`      | disabled unless `LOG_LEVEL` is set         |

`LOG_LEVEL` overrides the default in every environment. Supported Pino levels are `trace`, `debug`, `info`, `warn`, `error`, `fatal`, and `silent`.

## Fastify Requests

Use `request.log` in route handlers. Fastify binds the request ID to this child logger, which makes related events searchable together.

```typescript
export async function getUsers(request: FastifyRequest, reply: FastifyReply) {
  try {
    const users = await fetchUsers();
    request.log.debug({ userCount: users.length }, "Users fetched");
    return users;
  } catch (error) {
    request.log.error(error, "Failed to fetch users");
    throw error;
  }
}
```

Fastify's default request logging is disabled and replaced by `requestLogging.ts`. The replacement emits one lifecycle event per request with `method`, `url`, `route`, `statusCode`, `responseTimeMs`, and Fastify's bound `reqId`.

| Outcome                                      | Level   | Message                               |
| -------------------------------------------- | ------- | ------------------------------------- |
| thrown server failure                        | `error` | `Request failed` with `err`           |
| thrown client failure                        | `warn`  | `Request failed` with `err`           |
| handled response with status 500 or greater  | `error` | `Request completed with server error` |
| handled response with status 400–499         | `warn`  | `Request completed with client error` |
| successful response                          | `info`  | `Request completed`                   |
| successful ingestion or static-asset request | `debug` | `Request completed`                   |

Routes configured with `logLevel: "silent"`, such as health checks, emit no lifecycle event. Thrown failures are marked internally so the later response hook does not log the same lifecycle failure twice.

## Background Modules

Create a named child from the shared root:

```typescript
import { createServiceLogger } from "../../lib/logger/logger.js";

const logger = createServiceLogger("weekly-report");

logger.info({ organizationId }, "Starting weekly report");
```

The `service` field is included in structured output and remains visible in development output.

## Process Events

Use the shared `logger` for process-wide work such as cluster startup. Use `server.log` for Fastify lifecycle work. They share the same root and output policy.

## Event Shape

Prefer stable structured fields over interpolation:

```typescript
logger.info({ monitorId, region }, "Running monitor check");
```

For exceptions, pass the error directly or use Pino's `err` key:

```typescript
logger.error(error, "Monitor check failed");
logger.error({ err: error, monitorId }, "Monitor check failed");
```

Do not use `{ error }`: Pino does not apply its Error serializer to that key, so native errors become empty objects.

## Redaction

The shared runtime redacts common credentials, authentication headers, cookies, and structured AppSumo license fields. Redaction only applies to structured fields at configured paths; it cannot remove sensitive values interpolated into message strings.

Never log passwords, tokens, cookies, authentication headers, raw credentials, or full user records. Keep email addresses, phone numbers, prompts, queries, and request payloads out of logs unless the operational need and retention policy are explicit.

## Legacy Calls

Route and MCP modules no longer use direct `console` logging or the process-wide logger. Direct `console` logging still exists elsewhere in the server. New and modified code should use:

- `request.log` for request-bound work
- `server.log` for Fastify lifecycle work
- `createServiceLogger` for background modules
- `logger` for process-wide work

Remaining `console` migration in background modules is separate from request lifecycle logging.
