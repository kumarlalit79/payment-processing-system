# Payment Processing System

A production-grade payment processing backend built with Node.js, TypeScript, and PostgreSQL. Simulates real-world payment gateway behavior with retry logic, idempotency, concurrency control, and webhook handling.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun + Node.js |
| Framework | Express.js |
| Database | PostgreSQL + Prisma ORM |
| Queue | BullMQ + Redis |
| Logging | Winston |
| Testing | Bun Test + Supertest |
| Language | TypeScript (strict mode) |

---

## Features

- Payment lifecycle management (PENDING > PROCESSING > SUCCESS / FAILED)
- Idempotency: duplicate requests return the same response, no double charges
- Retry logic with exponential backoff (2s, 4s, 8s — max 3 retries)
- Concurrency control: pessimistic locking prevents parallel processing of the same payment
- Circuit breaker pattern: stops hitting a failing gateway repeatedly
- External gateway simulation: random SUCCESS, FAILED, TIMEOUT, and DELAY scenarios
- Webhook handling: duplicate and conflicting webhook detection
- Audit logs: full lifecycle traceability per payment
- Rate limiting: 100 requests per minute
- Structured logging: every lifecycle event logged with Winston

---

## Project Structure

```
payment-system/
├── src/
│   ├── config/            # env, database, logger, queue
│   ├── modules/
│   │   ├── payment/       # controller, service, repository, routes, validator
│   │   ├── webhook/       # controller, service, routes
│   │   └── gateway/       # gateway simulator
│   ├── workers/           # BullMQ retry worker
│   ├── middleware/        # error handler, rate limiter, validator
│   ├── utils/             # AppError, asyncHandler, circuitBreaker, idempotency
│   ├── app.ts
│   └── server.ts
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── payment.test.ts
│   ├── retry.test.ts
│   ├── webhook.test.ts
│   └── helpers/
│       ├── testDb.ts
│       └── setup.ts
└── .env
```

---

## Setup and Installation

### Prerequisites

- [Bun](https://bun.sh) installed
- PostgreSQL running locally or via Docker
- Redis running locally or via Docker

### Steps

**1. Clone the repo and install dependencies**

```bash
git clone <repo-url>
cd payment-system
bun install
```

**2. Create a `.env` file in the root directory**

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/payment_system"
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV=development
GATEWAY_TIMEOUT_MS=5000
MAX_RETRIES=3
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

**3. Run database migrations**

```bash
bunx --bun prisma migrate dev --name init
bunx --bun prisma generate
```

**4. Start the server**

```bash
bun run dev
```

Server starts at `http://localhost:3000`. You should see:

```
[info] Server started { port: 3000, environment: "development" }
[info] Redis connected
[info] Database connected
[info] Retry worker started
```

**5. Run tests**

```bash
bun test
```

---

## API Endpoints

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments` | Create a new payment |
| GET | `/api/payments` | Get all payments (paginated) |
| GET | `/api/payments/:id` | Get payment by ID |
| GET | `/api/payments/:id/audit` | Get audit logs for a payment |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/payment` | Receive gateway callback |
| GET | `/api/webhooks/payment/:paymentId/events` | Get webhook events for a payment |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |

---

## Example Requests

### Create Payment

```http
POST /api/payments
Content-Type: application/json
idempotency-key: unique-key-001

{
  "amount": 500.00,
  "currency": "INR",
  "paymentMethod": "upi",
  "description": "Order payment"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "isDuplicate": false,
  "message": "Payment initiated successfully",
  "data": {
    "id": "f1d8537a-fadb-4ea9-...",
    "status": "PENDING",
    "amount": 500,
    "currency": "INR",
    "paymentMethod": "upi",
    "retryCount": 0
  }
}
```

### Duplicate Request (same idempotency key)

```http
POST /api/payments
Content-Type: application/json
idempotency-key: unique-key-001

{
  "amount": 500.00,
  "currency": "INR",
  "paymentMethod": "upi"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "isDuplicate": true,
  "message": "Duplicate request - returning existing payment"
}
```

### Send Webhook

```http
POST /api/webhooks/payment
Content-Type: application/json

{
  "eventType": "payment.success",
  "paymentId": "f1d8537a-fadb-4ea9-...",
  "gatewayRef": "GW-REF-001",
  "status": "SUCCESS",
  "timestamp": "2026-05-06T12:00:00.000Z"
}
```

---

## Payment Flow

```
User creates payment
       |
       v
  [PENDING] -----> Gateway Simulator
       |                |
       |          +-----+-----+
       |          |     |     |
       |       SUCCESS FAIL TIMEOUT
       |          |     |     |
       v          v     v     v
  [PROCESSING]   |   Retry?  |
       |         |   (max 3) |
       |         v     |     v
       |     [SUCCESS] |  [PENDING] --> retry with backoff
       |               v
       |          [FAILED] (after 3 retries)
       v
  Gateway webhook arrives
       |
  Duplicate? --> log as DUPLICATE, ignore
  Conflict?  --> log as CONFLICTED, ignore
  Valid?     --> update payment status
```

---

## Key Design Decisions

**Idempotency** - Every payment request requires an idempotency key (auto-generated if not provided). The same key always returns the same response, preventing duplicate charges.

**Retry with Exponential Backoff** - Failed payments are retried via a BullMQ queue with delays of 2s, 4s, and 8s. After 3 attempts, the payment is permanently marked as FAILED.

**Concurrency Control** - Pessimistic locking via database-level lock fields (`lockedAt`, `lockedBy`) prevents two processes from handling the same payment simultaneously. Locks expire after 30 seconds as a safety net.

**Circuit Breaker** - After 5 consecutive gateway failures, the circuit opens and blocks further requests for 30 seconds, then tests with a single request (half-open state) before fully reopening.

**Webhook Safety** - Duplicate webhooks (same eventType + paymentId already processed) are detected and logged as DUPLICATE. Webhooks arriving after a terminal state are logged as CONFLICTED. Neither modifies the payment.

**Audit Trail** - Every state transition is recorded in the `audit_logs` table with timestamps and metadata for full traceability.

---

## Database Schema

Three tables:

- **payments** - Core payment record with status, amount, currency, retry tracking, lock fields, and gateway response
- **webhook_events** - Every incoming webhook logged with status (RECEIVED, PROCESSED, DUPLICATE, CONFLICTED)
- **audit_logs** - Every lifecycle event (CREATED, PROCESSING, SUCCESS, FAILED, RETRY_SCHEDULED) with from/to status and metadata

---

## Test Coverage

```
22 pass, 0 fail
Ran 22 tests across 3 files in ~3s
```

| Test File | Tests | What it covers |
|-----------|-------|---------------|
| `payment.test.ts` | 11 | Payment creation, idempotency, validation (negative amount, invalid currency, invalid method), auto-generated keys, get by ID, 404 handling, pagination, audit logs |
| `retry.test.ts` | 5 | Retry scheduling, max retries exhaustion, audit logs on retry, audit logs on permanent failure, terminal state protection |
| `webhook.test.ts` | 6 | Valid webhook processing, duplicate webhook detection, conflicting webhook detection, 404 for missing payment, validation, webhook event listing |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `REDIS_URL` | - | Redis connection string |
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment (development, production, test) |
| `GATEWAY_TIMEOUT_MS` | 5000 | Max time to wait for gateway response |
| `MAX_RETRIES` | 3 | Max retry attempts before permanent failure |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Rate limit window (1 minute) |
| `RATE_LIMIT_MAX` | 100 | Max requests per window |