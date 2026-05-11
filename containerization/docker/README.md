# Docker Integration with Ory

## Overview

Ory provides official Docker images for all its components (Kratos, Hydra, Keto, Oathkeeper), enabling local development, testing, and containerized deployment. This guide provides docker-compose configurations for running the full Ory stack locally and covers production Docker deployment patterns.

Official Ory Docker images:
- `oryd/kratos` — Identity management
- `oryd/hydra` — OAuth2/OIDC provider
- `oryd/keto` — Permission/authorization engine
- `oryd/oathkeeper` — Identity and access proxy

## docker-compose for Local Development

The following docker-compose configuration runs the full Ory stack with a PostgreSQL database and mailslurper for email testing.

### `docker-compose.yml`

```yaml
version: "3.8"

services:
  # ─── Database ──────────────────────────────────────────────────
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ory
      POSTGRES_PASSWORD: ory_secret
      POSTGRES_MULTIPLE_DATABASES: kratos,hydra,keto
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./scripts/create-databases.sh:/docker-entrypoint-initdb.d/create-databases.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ory"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ─── Ory Kratos ────────────────────────────────────────────────
  kratos-migrate:
    image: oryd/kratos:v1.3.0
    command: migrate sql -e --yes
    environment:
      DSN: postgres://ory:ory_secret@postgres:5432/kratos?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure

  kratos:
    image: oryd/kratos:v1.3.0
    command: serve -c /etc/config/kratos/kratos.yml --dev --watch-courier
    environment:
      DSN: postgres://ory:ory_secret@postgres:5432/kratos?sslmode=disable
      SERVE_PUBLIC_BASE_URL: http://localhost:4433/
      SERVE_ADMIN_BASE_URL: http://localhost:4434/
      SELFSERVICE_DEFAULT_BROWSER_RETURN_URL: http://localhost:4455/
      LOG_LEVEL: debug
    ports:
      - "4433:4433"  # Public API
      - "4434:4434"  # Admin API
    volumes:
      - ./config/kratos:/etc/config/kratos
    depends_on:
      kratos-migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  # ─── Ory Hydra ─────────────────────────────────────────────────
  hydra-migrate:
    image: oryd/hydra:v2.3.0
    command: migrate sql -e --yes
    environment:
      DSN: postgres://ory:ory_secret@postgres:5432/hydra?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure

  hydra:
    image: oryd/hydra:v2.3.0
    command: serve all --dev
    environment:
      DSN: postgres://ory:ory_secret@postgres:5432/hydra?sslmode=disable
      URLS_SELF_ISSUER: http://localhost:4444/
      URLS_CONSENT: http://localhost:4455/consent
      URLS_LOGIN: http://localhost:4455/login
      URLS_LOGOUT: http://localhost:4455/logout
      SECRETS_SYSTEM: a-very-secret-key-that-is-at-least-32-chars
      LOG_LEVEL: debug
    ports:
      - "4444:4444"  # Public API
      - "4445:4445"  # Admin API
    depends_on:
      hydra-migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  # ─── Ory Keto ──────────────────────────────────────────────────
  keto-migrate:
    image: oryd/keto:v0.12.0
    command: migrate up -e --yes
    environment:
      DSN: postgres://ory:ory_secret@postgres:5432/keto?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure

  keto:
    image: oryd/keto:v0.12.0
    command: serve -c /etc/config/keto/keto.yml
    environment:
      DSN: postgres://ory:ory_secret@postgres:5432/keto?sslmode=disable
      LOG_LEVEL: debug
    ports:
      - "4466:4466"  # Read API
      - "4467:4467"  # Write API
    volumes:
      - ./config/keto:/etc/config/keto
    depends_on:
      keto-migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  # ─── Ory Oathkeeper ────────────────────────────────────────────
  oathkeeper:
    image: oryd/oathkeeper:v0.40.7
    command: serve -c /etc/config/oathkeeper/oathkeeper.yml
    ports:
      - "4455:4455"  # Proxy
      - "4456:4456"  # API
    volumes:
      - ./config/oathkeeper:/etc/config/oathkeeper
    depends_on:
      - kratos
      - hydra
    restart: unless-stopped

  # ─── Email Testing ─────────────────────────────────────────────
  mailslurper:
    image: oryd/mailslurper:latest-smtps
    ports:
      - "4436:4436"  # SMTP
      - "4437:4437"  # Web UI

volumes:
  postgres-data:
```

### Database Initialization Script

**`scripts/create-databases.sh`:**

```bash
#!/bin/bash
set -e

for db in kratos hydra keto; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
    GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
done
```

### Kratos Configuration

**`config/kratos/kratos.yml`:**

```yaml
version: v1.3.0

serve:
  public:
    base_url: http://localhost:4433/
    cors:
      enabled: true
      allowed_origins: ["http://localhost:4455"]
  admin:
    base_url: http://localhost:4434/

selfservice:
  default_browser_return_url: http://localhost:4455/
  allowed_return_urls:
    - http://localhost:4455

  methods:
    password:
      enabled: true
    totp:
      enabled: true
    webauthn:
      enabled: true
      config:
        rp:
          id: localhost
          display_name: "Ory Dev"
          origins: ["http://localhost:4455"]
        passwordless: false

  flows:
    login:
      ui_url: http://localhost:4455/login
    registration:
      ui_url: http://localhost:4455/registration
      after:
        password:
          hooks:
            - hook: session
    settings:
      ui_url: http://localhost:4455/settings
    verification:
      enabled: true
      ui_url: http://localhost:4455/verification
    recovery:
      enabled: true
      ui_url: http://localhost:4455/recovery

identity:
  default_schema_id: default
  schemas:
    - id: default
      url: file:///etc/config/kratos/identity.schema.json

courier:
  smtp:
    connection_uri: smtp://mailslurper:4436/?skip_ssl_verify=true

log:
  level: debug
  format: json

secrets:
  default:
    - a-very-secret-key-that-is-at-least-32-characters
```

**`config/kratos/identity.schema.json`:**

```json
{
  "$id": "https://schemas.ory.sh/presets/kratos/quickstart/email-password/identity.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "title": "Email",
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } },
            "verification": { "via": "email" },
            "recovery": { "via": "email" }
          }
        },
        "name": {
          "type": "object",
          "properties": {
            "first": { "type": "string", "title": "First Name" },
            "last": { "type": "string", "title": "Last Name" }
          }
        }
      },
      "required": ["email"],
      "additionalProperties": false
    }
  }
}
```

### Keto Configuration

**`config/keto/keto.yml`:**

```yaml
version: v0.12.0

serve:
  read:
    host: 0.0.0.0
    port: 4466
  write:
    host: 0.0.0.0
    port: 4467

namespaces:
  - id: 0
    name: app

log:
  level: debug
```

### Oathkeeper Configuration

**`config/oathkeeper/oathkeeper.yml`:**

```yaml
serve:
  proxy:
    port: 4455
  api:
    port: 4456

access_rules:
  repositories:
    - file:///etc/config/oathkeeper/rules.json

authenticators:
  cookie_session:
    enabled: true
    config:
      check_session_url: http://kratos:4433/sessions/whoami
      preserve_path: true
      extra_from: "@this"
      subject_from: "identity.id"
      only:
        - ory_kratos_session
  noop:
    enabled: true

authorizers:
  allow:
    enabled: true

mutators:
  noop:
    enabled: true
  header:
    enabled: true
    config:
      headers:
        X-User-Id: "{{ print .Subject }}"

errors:
  handlers:
    redirect:
      enabled: true
      config:
        to: http://localhost:4455/login
        when:
          - error: [unauthorized]
    json:
      enabled: true
      config:
        verbose: true
```

## Usage

### Start the Stack

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f kratos

# Check service health
curl http://localhost:4433/health/ready  # Kratos
curl http://localhost:4444/health/ready  # Hydra
curl http://localhost:4466/health/ready  # Keto
```

### Stop and Clean Up

```bash
# Stop all services
docker compose down

# Stop and remove volumes (full reset)
docker compose down -v
```

### Test Registration

```bash
# Create a registration flow
FLOW=$(curl -s http://localhost:4433/self-service/registration/api | jq -r '.id')

# Submit registration
curl -s -X POST "http://localhost:4433/self-service/registration?flow=$FLOW" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "password",
    "password": "SecurePassword123!",
    "traits": {
      "email": "test@example.com",
      "name": {"first": "Test", "last": "User"}
    }
  }' | jq '.identity.id'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Migration fails** | Database not ready | Ensure `depends_on` with health check is configured |
| **Port conflict** | Port already in use | Change the host port mapping in docker-compose.yml |
| **CORS errors** | Origin not allowed | Add your frontend origin to Kratos CORS config |
| **Email not received** | SMTP config wrong | Use mailslurper and check at `http://localhost:4437` |
| **Container restart loop** | Config error | Check logs with `docker compose logs <service>` |

## Resources

- [Ory Docker Images (DockerHub)](https://hub.docker.com/u/oryd)
- [Ory Kratos Quickstart](https://www.ory.sh/docs/kratos/quickstart)
- [Ory Hydra 5-Minute Tutorial](https://www.ory.sh/docs/hydra/5min-tutorial)
- [Ory Self-Hosting Guide](https://www.ory.sh/docs/self-hosted/deployment)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
