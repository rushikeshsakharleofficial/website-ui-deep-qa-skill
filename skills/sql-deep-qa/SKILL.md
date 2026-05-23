---
name: sql-deep-qa
description: Use when a SQL database, schema, query layer, migration, or ORM needs auditing — AI-generated or hand-written — and you see missing constraints, slow queries, injection risk, data leaks, broken migrations, connection pool issues, multi-tenant isolation gaps, unnecessary indexes, or poor query patterns in application code. Also triggers on: pre-deploy migration review, "is our DB layer safe?", ORM usage audit, or performance investigation.
---

# SQL Deep QA

## Mission

Act as a strict database QA engineer. Audit the full SQL layer of an application: schema design, query correctness and safety, index strategy, performance, migration hygiene, access control, ORM patterns, and data exposure. Assume the database layer may contain AI-generated or hastily written code with no parameterization, wrong indexes, missing constraints, unvalidated migrations, exposed credentials, or broken tenant isolation.

## Non-negotiable rule

**Never run destructive operations.**

Never execute `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, `ALTER TABLE` without explicit user confirmation and a stated rollback plan. Never run migrations against production without explicit confirmation. Read-only analysis only unless the user explicitly requests otherwise.

## Initial assumptions to state

At the start of the report, state:

- database engine and version (PostgreSQL, MySQL 8, SQLite, MSSQL, etc.)
- whether access is read-only or read-write
- whether testing is against local, staging, or production
- whether source code is available for static analysis
- ORM detected and version (Prisma, SQLAlchemy, TypeORM, ActiveRecord, Drizzle, Sequelize, Hibernate, GORM, etc.)
- which checks were skipped and why

---

## Discovery phase

### Source code inspection

Scan for these patterns across all source files:

**Raw SQL usage:**
```
db.execute(      cursor.execute(    db.query(         db.run(
$queryRaw        $executeRaw        .raw(             db.rawQuery(
knex.raw(        sequelize.query(   connection.query(
```
Template literal SQL:
```
`SELECT          f"SELECT           f'SELECT          "SELECT " +
```

**ORM files to inspect:**
```
models.py        schema.prisma      *.entity.ts       db/schema.rb
migrations/      **/migrations/     *.sql             typeorm.config.*
database.yml     config/database.*  knexfile.*        drizzle.config.*
```

**Credential locations to scan:**
```
.env             .env.*             config/**         src/config/**
app.config.*     settings.py        database.go       application.properties
appsettings.json secrets.*          *.yaml (DB keys)
```

Flag: any `DATABASE_URL`, `DB_PASSWORD`, `DB_HOST`, connection string found in tracked source files.

Also scan git history:
```bash
git log -S "password" --all --oneline
git log -S "DATABASE_URL" --all --oneline
git log --all --full-history -- "*.env"
```

---

## Check 1 — SQL Injection (Critical first)

For **every** query string found in source:

### Pattern: Direct string concatenation

```python
# ❌ CRITICAL
cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")
cursor.execute("SELECT * FROM users WHERE name = '" + name + "'")
db.query(`SELECT * FROM orders WHERE id = ${req.params.id}`)
User.where("name = '#{params[:name]}'")  # ActiveRecord
```

```python
# ✅ Safe
cursor.execute("SELECT * FROM users WHERE name = %s", (name,))
cursor.execute("SELECT * FROM users WHERE name = :name", {"name": name})
db.query("SELECT * FROM orders WHERE id = $1", [req.params.id])
User.where(name: params[:name])
```

### Pattern: ORM raw escape hatches

```typescript
// ❌ TypeORM — template literal in raw query
repo.query(`SELECT * FROM users WHERE email = '${email}'`)

// ✅ TypeORM — parameterized
repo.query("SELECT * FROM users WHERE email = $1", [email])
```

```python
# ❌ SQLAlchemy — text() with f-string
db.execute(text(f"SELECT * FROM users WHERE role = '{role}'"))

# ✅ SQLAlchemy — bound params
db.execute(text("SELECT * FROM users WHERE role = :role"), {"role": role})
```

```javascript
// ❌ Sequelize
sequelize.query(`SELECT * FROM users WHERE id = ${id}`)

// ✅ Sequelize
sequelize.query("SELECT * FROM users WHERE id = ?", { replacements: [id] })
```

### Pattern: Second-order injection

Stored user input retrieved from DB and later concatenated into another query — trace full data flow, not just entry points.

### Pattern: Stored procedures

- Parameters must be typed and bound — never concatenated inside `EXEC` / `CALL` body.
- Check `SECURITY DEFINER` functions — they run as owner (elevated privilege). Verify no injection path inside.
- Audit `GRANT EXECUTE ON FUNCTION` — ensure only intended roles have execute rights.

```sql
-- ❌ SECURITY DEFINER + injection
CREATE OR REPLACE FUNCTION get_user(p_name text) RETURNS SETOF users
SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY EXECUTE 'SELECT * FROM users WHERE name = ''' || p_name || '''';
END;
$$ LANGUAGE plpgsql;

-- ✅ SECURITY DEFINER + parameterized
CREATE OR REPLACE FUNCTION get_user(p_name text) RETURNS SETOF users
SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT * FROM users WHERE name = p_name;
END;
$$ LANGUAGE plpgsql;
```

### Automated scanning with sqlmap (authorized testing only)

```bash
# Basic scan — URL with injectable parameter
sqlmap -u "http://localhost:3000/users?id=1" --batch

# POST body scan
sqlmap -u "http://localhost:3000/login" \
  --data "username=admin&password=test" --batch

# Test all injection types
sqlmap -u "http://localhost:3000/api/users?id=1" \
  --technique=BEUSTQ --level=3 --risk=2 --batch

# Enumerate databases (read-only, safe)
sqlmap -u "http://localhost:3000/api/users?id=1" --dbs --batch

# WAF bypass with tamper scripts
sqlmap -u "http://localhost:3000/api?id=1" \
  --tamper="space2comment,between" --batch

# Important: only run on systems you own or have written authorization for
```

**Severity: Critical for any confirmed injection surface.**

---

## Check 2 — Schema integrity

For every table, verify:

### Primary keys

- Every table has a primary key?
- PK is not a mutable business identifier (email, username) — use surrogate key?
- UUIDs: generated server-side or DB-side? Not client-supplied without validation?

### Foreign keys

- Every relationship has an FK constraint defined?
- `ON DELETE` behavior is intentional:
  - `CASCADE` — deleting parent removes children (usually correct for owned entities)
  - `RESTRICT` / `NO ACTION` — prevents orphan check (correct for referenced entities)
  - `SET NULL` — only valid if FK column is nullable
- Missing FKs mean orphaned rows accumulate silently

### NOT NULL

- Required columns marked `NOT NULL`?
- Columns always populated in app code but NOT `NOT NULL` in schema → schema lies, data drift risk

### UNIQUE constraints

- Columns assumed unique by app logic (email, username, slug, external_id) have `UNIQUE` constraint?
- Unique constraint missing = race condition on concurrent inserts

### Column types

| Usage | Wrong type | Correct type |
|-------|-----------|--------------|
| Money / currency | `FLOAT`, `DOUBLE` | `DECIMAL(19,4)` / `NUMERIC` |
| Timestamps | `VARCHAR` | `TIMESTAMP WITH TIME ZONE` |
| Booleans (MySQL) | `TINYINT(1)` with no convention | `BOOLEAN` / `TINYINT(1)` explicitly |
| Enum-like | `VARCHAR` with no constraint | `ENUM` type or `CHECK` constraint |
| IP addresses | `VARCHAR(45)` | `INET` (PostgreSQL) |
| UUIDs | `VARCHAR(36)` | `UUID` type (PostgreSQL) |
| Large text | `VARCHAR(255)` truncating silently | `TEXT` |
| JSON blobs | `TEXT` | `JSON` / `JSONB` (PostgreSQL) |

### Check constraints

- Numeric ranges validated at DB level? (`price > 0`, `quantity >= 0`)
- Status columns constrained to valid values? (`CHECK (status IN ('active','inactive','pending'))`)
- End date > start date where applicable?

### Soft delete

- `deleted_at TIMESTAMP` column present but no partial index → full scans include deleted rows
- App filters `WHERE deleted_at IS NULL` everywhere — or does it miss this on some queries?

---

## Check 3 — Index strategy

### Indexes that must exist

An index is **required** for every column that appears in:

1. `WHERE` clause of frequent queries
2. `JOIN ... ON` conditions (FK columns especially)
3. `ORDER BY` on large result sets
4. `GROUP BY` on large tables
5. High-cardinality filter columns

### Over-indexing (unnecessary indexes)

Flag indexes that hurt write performance without helping reads:

| Situation | Problem |
|-----------|---------|
| Index on `BOOLEAN` or low-cardinality column (e.g., `status` with 2 values, `is_active`) | Query planner ignores it; full scan often cheaper |
| Duplicate indexes — `idx_a_b` and `idx_a` where `idx_a` is a prefix of `idx_a_b` | `idx_a` is redundant |
| Index on column never used in WHERE/JOIN/ORDER | Write overhead with zero read benefit |
| Index on tiny table (<1000 rows) | Planner uses sequential scan anyway |
| Multiple single-column indexes when a composite serves all queries | Query planner picks one; others unused |

### Composite index column order

Composite index `(a, b, c)` supports queries on `a`, `(a, b)`, and `(a, b, c)` — but NOT `b` alone or `c` alone. Wrong order = index unused.

```sql
-- Query: WHERE tenant_id = ? AND created_at > ?
-- ✅ Correct composite:
CREATE INDEX idx_orders_tenant_created ON orders(tenant_id, created_at);

-- ❌ Wrong order — tenant_id filter can't use this:
CREATE INDEX idx_orders_created_tenant ON orders(created_at, tenant_id);
```

### Partial indexes

Use partial indexes to exclude irrelevant rows:

```sql
-- ✅ Only index active users (soft-delete pattern)
CREATE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;

-- ✅ Only index pending jobs
CREATE INDEX idx_jobs_pending ON jobs(created_at) WHERE status = 'pending';
```

Partial indexes are smaller, faster to build, and cheaper to maintain. Flag any table with a soft-delete column that lacks partial indexes on its main query columns.

### Index health queries (PostgreSQL)

```sql
-- Unused indexes (no scans since last stats reset)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexname NOT LIKE '%pkey%'
ORDER BY schemaname, tablename;

-- Missing FK indexes
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes pi
    WHERE pi.tablename = tc.table_name
      AND pi.indexdef LIKE '%' || kcu.column_name || '%'
  );

-- Index bloat
SELECT tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;
```

---

## Check 4 — Query performance

### N+1 detection

N+1 = loading a list, then running one query per row. Most common ORM anti-pattern:

```python
# ❌ N+1 — runs 1 + N queries
orders = Order.objects.all()
for order in orders:
    print(order.user.name)  # hits DB for each

# ✅ Eager load — 2 queries total
orders = Order.objects.select_related('user').all()
```

```typescript
// ❌ TypeORM N+1
const orders = await orderRepo.find();
for (const order of orders) {
  order.user = await userRepo.findOne(order.userId);  // N queries
}

// ✅ TypeORM eager
const orders = await orderRepo.find({ relations: ['user'] });
```

```ruby
# ❌ Rails N+1
Order.all.each { |o| puts o.user.name }

# ✅ Rails includes
Order.includes(:user).all.each { |o| puts o.user.name }
```

### Unbounded queries

Any query without `LIMIT` on a table that can grow:

```python
# ❌ Returns all rows — crashes at scale
users = User.objects.all()
orders = db.execute("SELECT * FROM orders")

# ✅ Paginated
users = User.objects.all()[:50]
```

### Offset pagination at scale

```sql
-- ❌ Slow at large offsets — scans and discards all prior rows
SELECT * FROM events ORDER BY created_at DESC LIMIT 20 OFFSET 100000;

-- ✅ Cursor-based — consistent O(log n)
SELECT * FROM events
WHERE created_at < :last_seen_cursor
ORDER BY created_at DESC
LIMIT 20;
```

Flag any pagination using `OFFSET` on tables expected to exceed 100k rows.

### SELECT * usage

```python
# ❌ Fetches all columns including large TEXT/BLOB fields
users = db.execute("SELECT * FROM users")

# ✅ Fetch only needed columns
users = db.execute("SELECT id, name, email FROM users")
```

Particular risk: `SELECT *` on tables with `profile_photo BYTEA`, `description TEXT`, or JSON blobs.

### Subquery vs JOIN

```sql
-- ❌ Correlated subquery — re-runs for every row
SELECT name, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count
FROM users u;

-- ✅ JOIN with aggregation — runs once
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

### EXPLAIN analysis protocol

For every query flagged as suspicious:

```sql
-- PostgreSQL — full analysis with buffer stats
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>;

-- Always run ANALYZE first if statistics may be stale
ANALYZE <table_name>;

-- MySQL
EXPLAIN FORMAT=JSON <query>;

-- SQLite
EXPLAIN QUERY PLAN <query>;
```

Flag:
- `Seq Scan` on table with >10k rows and no `LIMIT 1`
- Estimated rows >> actual rows (stale statistics → `ANALYZE` needed)
- `Hash Join` on large tables that could use an index
- `Sort` operation with no supporting index
- High `Buffers: shared hit` + `read` ratio (cache miss pressure)
- `cost=0.00..5.04 rows=1 width=...` — cost is in arbitrary planner units; high costs signal expensive ops

### pg_stat_statements queries (PostgreSQL)

Requires `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` in postgresql.conf (`shared_preload_libraries = 'pg_stat_statements'`).

```sql
-- Top 10 slowest queries by mean execution time
WITH statements AS (
  SELECT * FROM pg_stat_statements pss
  JOIN pg_roles pr ON (userid = oid)
  WHERE rolname = current_user
)
SELECT calls, mean_exec_time, query
FROM statements
WHERE calls > 500 AND shared_blks_hit > 0
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Cache hit ratio — values <95% indicate memory pressure
WITH statements AS (
  SELECT * FROM pg_stat_statements pss
  JOIN pg_roles pr ON (userid = oid)
  WHERE rolname = current_user
)
SELECT calls, shared_blks_hit, shared_blks_read,
  shared_blks_hit / (shared_blks_hit + shared_blks_read)::NUMERIC * 100 AS hit_cache_ratio,
  query
FROM statements
WHERE calls > 500
ORDER BY calls DESC, hit_cache_ratio ASC
LIMIT 10;

-- High variance queries (unpredictable performance — plan instability)
WITH statements AS (
  SELECT * FROM pg_stat_statements pss
  JOIN pg_roles pr ON (userid = oid)
  WHERE rolname = current_user
)
SELECT calls, min_exec_time, max_exec_time, mean_exec_time,
  stddev_exec_time, (stddev_exec_time / mean_exec_time) AS coeff_of_variance, query
FROM statements
WHERE calls > 500
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Additional query anti-patterns

```sql
-- ❌ Cartesian product (missing JOIN condition) — returns M×N rows
SELECT * FROM users, orders;  -- forgot: WHERE users.id = orders.user_id

-- ❌ Function on indexed column — index not used
SELECT * FROM orders WHERE LOWER(email) = 'admin@example.com';
-- ✅ Fix: create functional index
CREATE INDEX idx_orders_email_lower ON orders(LOWER(email));

-- ❌ Implicit type conversion — index not used
SELECT * FROM orders WHERE user_id = '12345';  -- user_id is INT, '12345' is VARCHAR
-- ✅ Fix: match types explicitly
SELECT * FROM orders WHERE user_id = 12345;

-- ❌ LIKE with leading wildcard — no index
SELECT * FROM users WHERE email LIKE '%@example.com';
-- ✅ For suffix search: use reverse index or pg_trgm
CREATE INDEX idx_users_email_trgm ON users USING gin(email gin_trgm_ops);

-- ❌ OR conditions preventing index use
SELECT * FROM users WHERE id = 1 OR email = 'admin@example.com';
-- ✅ Use UNION for index utilization
SELECT * FROM users WHERE id = 1
UNION
SELECT * FROM users WHERE email = 'admin@example.com';
```

### Table and index bloat (PostgreSQL)

Bloat accumulates when dead tuples (from UPDATE/DELETE + MVCC) are not vacuumed.

```sql
-- Requires: CREATE EXTENSION IF NOT EXISTS pgstattuple;
-- Actual bloat (full scan — slow on large tables)
SELECT objectname,
  pg_size_pretty(size_bytes) AS object_size,
  pg_size_pretty(free_space_bytes) AS reusable_space,
  pg_size_pretty(dead_tuple_size_bytes) AS dead_tuple_space,
  free_percent
FROM (
  SELECT relname AS objectname,
    pg_relation_size(oid) AS size_bytes,
    (pgstattuple(oid)).free_space AS free_space_bytes,
    (pgstattuple(oid)).dead_tuple_len AS dead_tuple_size_bytes,
    (pgstattuple(oid)).free_percent AS free_percent
  FROM pg_class WHERE relkind = 'r'
) t
WHERE free_percent > 20
ORDER BY size_bytes DESC
LIMIT 20;

-- Fast approximate bloat (PostgreSQL 9.5+)
SELECT relname, pg_size_pretty(pg_relation_size(oid)),
  (pgstattuple_approx(oid)).free_percent
FROM pg_class WHERE relkind = 'r'
ORDER BY pg_relation_size(oid) DESC LIMIT 20;
```

Flag tables with `free_percent > 30%` — indicates VACUUM not keeping up with write load.

### Smart query patterns to recommend

```sql
-- Upsert (avoid SELECT then INSERT race condition)
INSERT INTO user_settings (user_id, theme)
VALUES (:user_id, :theme)
ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme;

-- Batch insert instead of loop
INSERT INTO events (user_id, type, created_at)
SELECT unnest(:user_ids), :type, now();

-- Window function instead of self-join
SELECT id, amount,
       SUM(amount) OVER (PARTITION BY user_id ORDER BY created_at) AS running_total
FROM transactions;

-- CTEs for readability + optimizer hints
WITH active_users AS (
  SELECT id FROM users WHERE last_seen_at > now() - interval '30 days'
)
SELECT COUNT(*) FROM orders WHERE user_id IN (SELECT id FROM active_users);

-- EXISTS instead of COUNT for presence check
-- ❌ Counts all matching rows
SELECT COUNT(*) FROM orders WHERE user_id = ? > 0

-- ✅ Stops at first match
SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = ?)
```

---

## Check 5 — Migration safety

For each migration file, verify all of the following:

### Reversibility

- Does a `down()` / rollback function exist?
- Does the rollback actually work, or is it a stub?
- Data-destructive migrations (column drop, type change) cannot be reversed — flag and require explicit acknowledgment.

### Dangerous DDL patterns

| Operation | Risk | Safe alternative |
|-----------|------|-----------------|
| `ADD COLUMN NOT NULL` without default | Rewrites table or fails on populated DB | Add nullable first, backfill, then add NOT NULL |
| `DROP COLUMN` | Data loss, deploy-order issue | Deprecate column first, remove in later migration |
| `RENAME COLUMN` | Breaks old app code if deployed before new code | Alias with generated column, dual-write period |
| `ALTER COLUMN TYPE` | Rewrites table, long lock | Add new column, backfill, swap, drop old |
| `ADD INDEX` without `CONCURRENTLY` (PostgreSQL) | Locks table for duration | `CREATE INDEX CONCURRENTLY` |
| `ADD CONSTRAINT` on populated table | Validates all rows, may lock | `NOT VALID` then `VALIDATE CONSTRAINT` separately |

### Lock timeout patterns (zero-downtime migrations)

```sql
-- ❌ ALTER TABLE without lock timeout — blocks entire table until complete
ALTER TABLE orders ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending';

-- ✅ Set lock timeout so migration fails fast instead of queuing indefinitely
SET lock_timeout = '5s';
SET statement_timeout = '30s';
ALTER TABLE orders ADD COLUMN status VARCHAR(50);

-- Then backfill + add NOT NULL in a subsequent migration:
UPDATE orders SET status = 'pending' WHERE status IS NULL;
ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
```

PostgreSQL lock conflict: any `ALTER TABLE` acquiring `ACCESS EXCLUSIVE` blocks all reads and writes, plus queues all subsequent statements behind it.

```sql
-- ✅ CREATE INDEX without table lock (PostgreSQL)
CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);

-- ✅ ADD CONSTRAINT without immediate validation
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','shipped','delivered')) NOT VALID;
-- Later validate in separate transaction:
ALTER TABLE orders VALIDATE CONSTRAINT orders_status_check;
```

### Deploy order safety

Three-phase deploy check for breaking changes:

1. **Phase 1 (DB migration):** Schema change must be backward-compatible with old app code
2. **Phase 2 (App deploy):** New code uses new schema
3. **Phase 3 (Cleanup migration):** Remove compatibility shims

Flag any migration that requires simultaneous DB + app deploy to avoid breakage.

### Migration ordering

- No two migrations with same timestamp?
- Migration numbering is sequential with no gaps?
- Each migration depends only on prior migrations in sequence?

---

## Check 6 — Connection management

```python
# ❌ No pool config — new connection per request
engine = create_engine("postgresql://...")

# ✅ Explicit pool
engine = create_engine(
    "postgresql://...",
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=3600,
)
```

Check:
- `pool_size` / `maxConnections` configured and appropriate for expected concurrency?
- `pool_timeout` set (no indefinite wait)?
- `connection_timeout` set?
- `idle_timeout` set to reclaim connections from idle workers?
- Are connections closed in all error paths? (try/finally, context managers, `async with`)
- In async code: is the session/connection used across `await` points where it might be released?
- Are `connection.close()` calls missing in except blocks?
- Is `DATABASE_URL` pointing to a PgBouncer / RDS Proxy in production? (recommended for serverless)

---

## Check 7 — Sensitive data exposure

### Schema scan

Flag columns with names matching:

```
password  passwd    secret    token     api_key   apikey
ssn       tax_id    sin       credit_card  card_number  cvv  cvc
dob       birthday  salary    income    medical   health
session   auth_token  refresh_token  access_token  private_key
```

For each flagged column:
- Password columns: is value a bcrypt/argon2/scrypt hash? Check format: `$2b$`, `$argon2`, etc.
- Token columns: stored as hash (not raw token)?
- PII columns: encryption at rest or column-level encryption configured?

### Over-fetching in API layer

```python
# ❌ Returns hashed password to API consumer
return db.execute("SELECT * FROM users WHERE id = ?", [id])

# ✅ Explicit column selection
return db.execute("SELECT id, name, email, role FROM users WHERE id = ?", [id])
```

### Log hygiene

```python
# ❌ Logs full SQL with bound params
logger.debug(f"Running query: {query} with params {params}")

# ❌ Logs ORM query including sensitive values
logging.getLogger('sqlalchemy.engine').setLevel(logging.DEBUG)  # in production
```

### Response leak scan

On every API endpoint that queries user/account/order tables:

- Does the JSON response contain `password`, `token`, `secret`, `api_key`?
- Does a regular user's response contain another user's `id`, `email`, `data`?

---

## Check 8 — Access control and multi-tenancy

### DB user privileges

```sql
-- Check what the application DB user can do
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'app_user';
```

Flag:
- Application connects as `postgres`, `root`, or `admin`?
- Application user has `DROP`, `CREATE`, `TRUNCATE` privilege?
- Separate read-only replica user for read endpoints?

### Row-level tenant isolation

For every table with a `tenant_id`, `org_id`, `account_id`, or `workspace_id` column:

```python
# ❌ Missing tenant filter — returns all tenants' data
orders = db.execute("SELECT * FROM orders WHERE status = 'pending'")

# ✅ Tenant-scoped
orders = db.execute(
    "SELECT * FROM orders WHERE tenant_id = %s AND status = 'pending'",
    (current_tenant_id,)
)
```

Trace:
1. Where does `tenant_id` come from? JWT claim? Session? URL param?
2. Is it validated server-side, or trusted from user input?
3. Every query touching tenant-scoped tables has the filter?
4. Is PostgreSQL Row Level Security (RLS) enabled as a safety net?

### RLS example (PostgreSQL)

```sql
-- Recommended belt-and-suspenders for multi-tenant apps
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Ownership checks

```python
# ❌ Fetches resource by ID with no ownership check
order = Order.get(id=request.order_id)

# ✅ Ownership enforced at query level
order = Order.get(id=request.order_id, user_id=current_user.id)
```

---

## Check 9 — Credential and config hygiene

```bash
# Scan for hardcoded credentials
grep -rn "password\s*=" --include="*.py" --include="*.ts" --include="*.js" src/
grep -rn "DATABASE_URL" --include="*.py" --include="*.ts" --include="*.js" --include="*.env*" .
grep -rn "postgresql://" --include="*.py" --include="*.ts" --include="*.js" src/
```

Flag:
- Credentials in source files committed to git (check `.gitignore` includes `.env`)
- `DATABASE_URL` in frontend bundle (check Webpack/Vite config for leakage)
- DB port 5432/3306 open to public internet in cloud security groups
- No SSL/TLS on DB connection in production (`sslmode=disable` in connection string)
- Credentials in CI/CD logs (connection strings printed at startup)

---

## Check 10 — ORM-specific deep checks

### Prisma

```typescript
// ❌ Injection via $queryRaw with template literal
const users = await prisma.$queryRaw`SELECT * FROM users WHERE name = ${name}`;
// Note: Prisma's tagged template $queryRaw IS safe — it parameterizes automatically
// But $queryRawUnsafe is NOT:
const users = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE name = '${name}'`); // ❌

// Check for:
// - $queryRawUnsafe usage
// - Missing select fields (returns all columns by default)
// - No error handling on transactions
// - Cascading deletes not configured in schema
```

### SQLAlchemy

```python
# ❌ Lazy loading causing N+1
for order in session.query(Order).all():
    print(order.user.name)  # separate query per row

# ✅ Eager load
from sqlalchemy.orm import joinedload
for order in session.query(Order).options(joinedload(Order.user)).all():
    print(order.user.name)

# Check for:
# - Session not closed (session.close() missing in non-context-manager usage)
# - text() with f-strings
# - expire_on_commit=True (default) causing extra queries after commit
# - Missing .scalar() / .first() when expecting single result (full load)
```

### ActiveRecord (Rails)

```ruby
# N+1 detection
# ❌
User.all.each { |u| u.orders.count }

# ✅
User.includes(:orders).all.each { |u| u.orders.size }

# Check for:
# - find_by_sql usage
# - where() with string interpolation
# - Missing counter_cache for count queries
# - joins vs includes (joins = filtering, includes = loading)
# - select() missing on queries where not all columns needed
```

### TypeORM

```typescript
// Check for:
// - createQueryBuilder with unsanitized inputs
// - Missing @Index() decorators on FK columns
// - Relations loaded without select specification (loads all fields)
// - synchronize: true in production config (auto-migrates, dangerous)
// - cache: true without TTL on mutable queries
```

### Sequelize

```javascript
// Check for:
// - literal() with user input
// - where: { [Op.like]: `%${userInput}%` } — safe, but verify Op is used
// - raw: true bypassing model layer
// - Missing paranoid: true on soft-delete models
// - findAll without limit
```

### GORM (Go)

```go
// ❌ Raw string injection
db.Where("name = '" + name + "'").Find(&users)

// ✅
db.Where("name = ?", name).Find(&users)

// Check for:
// - Preload vs Joins (Preload = N+1 risk on large result sets)
// - Missing transaction rollback on error
// - AutoMigrate in production startup (locks tables)
```

---

## Check 11 — Backup and recovery

Verify:

- Automated backup configured (WAL archiving, daily snapshot, etc.)?
- Backup retention period ≥ business requirement (typically 7–30 days)?
- Point-in-time recovery (PITR) enabled for production?
- Backup files themselves are encrypted?
- Backup files accessible without DB credentials (i.e., backup bucket is public)?
- Last backup restore was tested (not just configured)?
- Recovery time objective (RTO) and recovery point objective (RPO) documented?

---

## Check 12 — Transaction and concurrency safety

### Missing transactions on multi-step writes

```python
# ❌ Partial failure leaves inconsistent state
db.execute("INSERT INTO orders (user_id, total) VALUES (?, ?)", (uid, total))
db.execute("UPDATE inventory SET qty = qty - ? WHERE product_id = ?", (qty, pid))

# ✅ Atomic
with db.transaction():
    db.execute("INSERT INTO orders ...")
    db.execute("UPDATE inventory ...")
```

### Isolation level awareness

| Level | Prevents | Risk |
|-------|----------|------|
| `READ UNCOMMITTED` | Nothing | Dirty reads — almost never correct |
| `READ COMMITTED` (default most DBs) | Dirty reads | Non-repeatable reads |
| `REPEATABLE READ` | Dirty + non-repeatable | Phantom reads |
| `SERIALIZABLE` | All anomalies | Performance cost |

Flag: financial or inventory operations running at READ COMMITTED without application-level locks.

### Deadlock patterns

```python
# ❌ Consistent lock order not enforced — deadlock risk
# Thread A: locks user 1 then order 1
# Thread B: locks order 1 then user 1

# ✅ Always lock in consistent order
# Always acquire user lock before order lock
```

### Optimistic vs pessimistic locking

```python
# Optimistic (version column)
UPDATE orders SET status = 'shipped', version = version + 1
WHERE id = ? AND version = ?;
-- If 0 rows updated: concurrent modification detected

# Pessimistic (SELECT FOR UPDATE)
SELECT * FROM orders WHERE id = ? FOR UPDATE;
-- Holds row lock until transaction commits
```

Flag: balance/inventory updates that need serializable reads but use default isolation.

---

---

## Check 13 — Database configuration security

### PostgreSQL hardening checklist

**pg_hba.conf audit:**

```bash
# Locate and inspect the file
psql -U postgres -c "SHOW hba_file;"
cat /etc/postgresql/*/main/pg_hba.conf
```

Flag immediately:
- `trust` auth method for any non-local connection — no password required
- `md5` auth method — use `scram-sha-256` instead (md5 is broken)
- `host all all 0.0.0.0/0 md5` — allows all IPs with weak hash
- No `hostssl` entries — plain TCP allowed even with SSL configured

```
# ❌ Dangerous pg_hba.conf entry
host    all    all    0.0.0.0/0    trust

# ✅ Production-ready
hostssl all    app_user    10.0.0.0/8    scram-sha-256
local   all    postgres                  peer
```

**postgresql.conf security settings:**

```bash
psql -U postgres -c "SHOW ssl;"
psql -U postgres -c "SHOW ssl_min_protocol_version;"
psql -U postgres -c "SHOW log_connections;"
psql -U postgres -c "SHOW log_disconnections;"
psql -U postgres -c "SHOW password_encryption;"
```

Flag:
- `ssl = off` — plaintext connections
- `ssl_min_protocol_version` not set to `TLSv1.2` or `TLSv1.3`
- `password_encryption = md5` — change to `scram-sha-256`
- `log_connections = off` in production (can't audit who connected)
- Port 5432 reachable from `0.0.0.0` (cloud security group)

**Connection string audit in app code:**

```bash
grep -rn "sslmode=disable" --include="*.py" --include="*.ts" --include="*.go" .
grep -rn "sslmode=disable" --include="*.env*" .
```

Flag `sslmode=disable` in any non-localhost connection string.

---

### MySQL/MariaDB hardening checklist

```sql
-- Run after install: mysql_secure_installation equivalent checks
-- Check for anonymous users
SELECT user, host FROM mysql.user WHERE user = '';

-- Check remote root access
SELECT user, host FROM mysql.user WHERE user = 'root' AND host != 'localhost';

-- Check for test database
SHOW DATABASES LIKE 'test';

-- Check user privileges
SELECT user, host, Grant_priv, Super_priv, File_priv
FROM mysql.user WHERE user = 'app_user';

-- Check SSL requirement
SHOW VARIABLES LIKE 'require_secure_transport';

-- Check bind address
SHOW VARIABLES LIKE 'bind_address';
```

Flag:
- Anonymous user accounts exist
- Root accessible from non-localhost hosts
- `test` database exists (accessible by all users by default)
- `app_user` has `GRANT`, `SUPER`, or `FILE` privileges
- `require_secure_transport = OFF` on production
- `bind_address = 0.0.0.0` (binds to all interfaces)

---

## Check 14 — Audit logging and compliance

### PostgreSQL audit logging (pgaudit)

```bash
# Check if pgaudit is installed
psql -c "SELECT * FROM pg_extension WHERE extname = 'pgaudit';"
psql -c "SHOW pgaudit.log;"
```

For PCI DSS / HIPAA / SOC2 compliance, verify `pgaudit.log` includes:
- `READ` — all SELECT on PII/financial tables
- `WRITE` — all INSERT/UPDATE/DELETE
- `DDL` — schema changes
- `ROLE` — privilege changes

```sql
-- Minimal pgaudit config for compliance
-- In postgresql.conf:
-- pgaudit.log = 'write, ddl, role'
-- pgaudit.log_catalog = on
-- pgaudit.log_relation = on

-- Verify pgaudit is capturing logins
SELECT * FROM pg_file_settings WHERE name LIKE 'pgaudit%';
```

### MySQL audit logging

```sql
-- Check if audit plugin is active
SHOW PLUGINS;  -- look for 'audit_log' status = ACTIVE

-- Check general log (performance cost — only in dev/short windows)
SHOW VARIABLES LIKE 'general_log';
SHOW VARIABLES LIKE 'general_log_file';
```

### Compliance checklist

| Regulation | DB requirement |
|-----------|----------------|
| PCI DSS | Audit all access to cardholder data tables; encrypt CHD columns; restrict DB access to need-to-know; log all admin actions |
| HIPAA | Audit access to PHI columns; encryption in transit (SSL) and at rest; access control; backup integrity verification |
| SOC2 | Least-privilege DB users; audit logs retained ≥ 1 year; encryption at rest; change management for DDL |
| GDPR | Ability to delete all user data by ID (right to erasure); log who accessed personal data; data minimization (no unnecessary PII columns) |

---

## Check 15 — Data integrity

### Orphaned records (FK violations in data)

```sql
-- Find orders with no matching user
SELECT COUNT(*) FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;

-- Generic orphan check pattern
SELECT 'orphaned_orders' AS issue, COUNT(*)
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = o.user_id);

-- Find orphaned child rows across all FK relationships
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS fk_column,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
-- Then for each result: run the LEFT JOIN orphan check above
```

### Constraint validation

```sql
-- Check for rows violating CHECK constraints (after adding NOT VALID constraint)
ALTER TABLE orders VALIDATE CONSTRAINT orders_status_check;
-- If this fails: data violations exist

-- Find duplicate values in "unique" columns without UNIQUE constraint
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;

-- Nulls in NOT NULL columns (catch data load issues)
SELECT COUNT(*) FROM users WHERE email IS NULL OR name IS NULL;
```

### Referential integrity audit queries

```sql
-- Tables with no PK
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
    SELECT table_name FROM information_schema.table_constraints
    WHERE constraint_type = 'PRIMARY KEY'
  );

-- FK columns missing indexes (cross-reference with Check 3)
-- Orphaned rows count per FK relationship
-- Rows with end_date < start_date (temporal data integrity)
SELECT COUNT(*) FROM subscriptions WHERE end_date < start_date;
```

---

## Check 16 — NoSQL injection (if applicable)

Apply when the application uses MongoDB, Redis, Elasticsearch, or similar.

### MongoDB injection

```javascript
// ❌ User input directly in query object
const user = await db.collection('users').findOne({ username: req.body.username });
// Attack: req.body.username = { "$ne": null }  → returns first user (auth bypass)

// ❌ $where with user input — allows JS execution
db.users.find({ $where: `this.username == '${username}'` });

// ✅ Type validation before query
const user = await db.collection('users').findOne({
  username: String(req.body.username)  // ensure string type
});
// Better: use schema validation library (Joi, Zod) before querying
```

Detection patterns in code:
```
db.collection(   .findOne(    .find(    .aggregate(
mongoose.find(   Model.findOne(   .updateOne(   .deleteOne(
```

Check: is `req.body.*` or `req.query.*` used directly as a MongoDB query filter without type enforcement?

### Redis injection

```bash
# Risk: user controls Redis key patterns
# ❌
KEYS "user:${userInput}:*"   # userInput = "*" dumps all keys

# ✅ Use SCAN with specific prefix + exact match
SCAN 0 MATCH "user:12345:*" COUNT 100
```

Check: `KEYS` command usage in application code — always replace with `SCAN`.

### Elasticsearch injection

```javascript
// ❌ Query string injection
GET /users/_search?q=name:${userInput}
// Attack: userInput = "admin OR _exists_:password"

// ❌ Lucene injection in query_string
{ "query": { "query_string": { "query": userInput } } }

// ✅ Use match query (no injection surface)
{ "query": { "match": { "name": userInput } } }
```

---

## Check 17 — Privilege testing (least privilege)

### Application user privilege audit

```sql
-- PostgreSQL: what can the app user do?
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'app_user'
ORDER BY table_name, privilege_type;

-- Check superuser status
SELECT usename, usesuper, usecreatedb, usecreaterole
FROM pg_user WHERE usename = 'app_user';

-- Check if app user owns any tables (bad — owner has implicit all permissions)
SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public' AND tableowner = 'app_user';
```

Flag:
- App user is superuser (`usesuper = true`)
- App user has `CREATE DATABASE` / `CREATE ROLE`
- App user owns tables (should be owned by a separate migration user)
- No separation between read-only replica user and read-write primary user
- Migration user credentials same as app user credentials

### Privilege escalation checks

```sql
-- PostgreSQL: functions with SECURITY DEFINER that app user can execute
SELECT proname, proowner::regrole, prosecdef
FROM pg_proc
WHERE prosecdef = true;  -- SECURITY DEFINER functions

-- Check if app user can create functions
SELECT has_schema_privilege('app_user', 'public', 'CREATE');
```

### Ideal privilege model

```sql
-- Read-only replica user
GRANT CONNECT ON DATABASE myapp TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO readonly_user;

-- Application user (RW, no DDL)
GRANT CONNECT ON DATABASE myapp TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Migration user (DDL, not used at runtime)
GRANT ALL ON SCHEMA public TO migration_user;
```

---

## Defect format

```md
### SQL-DEFECT-<number>: <title>

Severity:
<Critical / High / Medium / Low>

Location:
<file:line or table.column or migration filename>

Check category:
<injection | schema | index-missing | index-unnecessary | performance | migration |
 connection | sensitive-data | access-control | credentials | orm | backup |
 transaction | n+1 | pagination | query-pattern | db-config | audit-logging |
 data-integrity | nosql-injection | privilege | bloat | fuzzing | stored-proc |
 cryptographic-storage>

Steps to reproduce:
1. ...

Expected:
...

Actual:
...

Evidence:
- Code snippet / query / explain output / schema excerpt

Likely cause:
...

Recommendation:
...
```

## Severity definitions

**Critical:**
- SQL injection confirmed (any type: error-based, blind, union, OOB)
- Second-order/stored SQL injection confirmed
- NoSQL injection confirmed (auth bypass, `$where` JS execution)
- Plaintext password storage
- Cross-tenant data leak
- RLS enabled but FORCE ROW LEVEL SECURITY missing (table owner bypasses RLS)
- Credentials hardcoded in source or exposed in frontend bundle
- Unauthenticated access to DB port (pg_hba.conf `trust` auth)
- `sslmode=disable` on external production connection
- App connects as DB superuser

**High:**
- SECURITY DEFINER function injectable or bypasses RLS
- Missing FK constraints causing silent orphan accumulation
- Migration that will lock production table or fail on populated DB
- N+1 on high-traffic route (>100 requests/min)
- Sensitive columns (token, SSN) returned to API consumers
- No connection pool in production (new connection per request)
- Financial writes without transaction isolation
- `pg_hba.conf` uses `md5` instead of `scram-sha-256`
- No lock_timeout on DDL migrations (blocks reads on production)
- Backup never tested for restore (WAL archive silently failing)
- Anonymous DB user exists; remote root login enabled (MySQL)
- MongoDB `$where` in user-controlled data (RCE risk)

**Medium:**
- Missing index on frequently queried FK or filter column
- `SELECT *` on wide tables in production paths
- Offset pagination on table >100k rows
- Missing rollback on non-trivial migration
- Unnecessary index on low-cardinality or write-heavy column
- Missing `WHERE` tenant filter on 1 of N queries (partial gap)
- Table bloat >30% (vacuum not keeping up)
- Cache hit ratio <90% in pg_stat_statements
- Audit logging (pgaudit) not enabled on PCI/HIPAA systems
- Orphaned FK records found in data
- Dynamic SQL in stored procedure without parameterization

**Low:**
- Wrong column type (no data loss currently)
- Missing `NOT NULL` on always-populated column
- Redundant/duplicate index
- Minor ORM over-fetch on low-traffic route
- `SELECT *` in internal/admin route only
- Missing `ANALYZE` causing stale statistics
- Table or index bloat 10-30%

---

## Final report format

```md
# SQL Deep QA Report

Target:
<database name / connection string (credentials redacted)>

Date:
<date>

Engine:
<PostgreSQL 15 / MySQL 8.0 / SQLite 3 / MSSQL 2019>

Environment:
<local / staging / production>

ORM:
<Prisma / SQLAlchemy / ActiveRecord / TypeORM / GORM / none / unknown>

Source code available:
<yes / no>

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

- [List checks skipped and why — e.g., "No live DB access — migration safety checked from files only"]

---

## Top recommendations (priority order)

1. [Most urgent fix]
2. ...
```
