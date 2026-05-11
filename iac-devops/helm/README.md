# Helm Charts for Ory

Official Helm charts for deploying Ory components on Kubernetes.

## Overview

Ory publishes official Helm charts for self-hosted deployments of Kratos (identity), Hydra (OAuth2/OIDC), Oathkeeper (API gateway), and Keto (permissions). While Ory Network is the recommended managed deployment, these charts are documented here for teams that need self-hosted deployments or hybrid architectures.

| Component | Chart | Repository |
|-----------|-------|------------|
| Ory Kratos | `ory/kratos` | [github.com/ory/k8s](https://github.com/ory/k8s) |
| Ory Hydra | `ory/hydra` | [github.com/ory/k8s](https://github.com/ory/k8s) |
| Ory Oathkeeper | `ory/oathkeeper` | [github.com/ory/k8s](https://github.com/ory/k8s) |
| Ory Keto | `ory/keto` | [github.com/ory/k8s](https://github.com/ory/k8s) |

> **Note:** For most use cases, Ory Network (managed cloud) eliminates the need to operate these services yourself. Consider self-hosted only when regulatory, data-residency, or air-gap requirements mandate it.

## Prerequisites

- Kubernetes cluster (>= 1.25)
- Helm >= 3.10
- `kubectl` configured for your cluster
- PostgreSQL or CockroachDB for persistence

## Add the Ory Helm Repository

```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update
```

## Ory Kratos (Identity)

### Install

```bash
helm install kratos ory/kratos \
  --namespace ory \
  --create-namespace \
  -f kratos-values.yaml
```

### values.yaml Example

```yaml
# kratos-values.yaml

kratos:
  # Development mode (set to false in production)
  development: false

  config:
    dsn: "postgres://kratos:secret@postgresql:5432/kratos?sslmode=require"

    serve:
      public:
        base_url: "https://auth.example.com/"
        cors:
          enabled: true
          allowed_origins:
            - "https://app.example.com"
          allowed_methods:
            - GET
            - POST
            - PUT
            - PATCH
            - DELETE
          allowed_headers:
            - Authorization
            - Content-Type
            - X-Session-Token

      admin:
        base_url: "http://kratos-admin:4434/"

    selfservice:
      default_browser_return_url: "https://app.example.com/"

      methods:
        password:
          enabled: true
        totp:
          enabled: true
        webauthn:
          enabled: true
          config:
            rp:
              display_name: "My App"
              id: "auth.example.com"
              origins:
                - "https://auth.example.com"
            passwordless: true

      flows:
        login:
          ui_url: "https://app.example.com/login"
          lifespan: "1h"
        registration:
          ui_url: "https://app.example.com/register"
          lifespan: "1h"
          after:
            password:
              hooks:
                - hook: session
                - hook: show_verification_ui
        verification:
          ui_url: "https://app.example.com/verify"
          enabled: true
        recovery:
          ui_url: "https://app.example.com/recovery"
          enabled: true
        settings:
          ui_url: "https://app.example.com/settings"

    session:
      lifespan: "720h"
      cookie:
        same_site: "Lax"
        domain: "example.com"

    courier:
      smtp:
        connection_uri: "smtp://user:pass@smtp.example.com:587/"
        from_address: "noreply@example.com"
        from_name: "My App"

    identity:
      default_schema_id: customer
      schemas:
        - id: customer
          url: "file:///etc/config/kratos/identity.schema.json"

    secrets:
      cookie:
        - "CHANGE-ME-32-CHAR-SECRET-KEY!!!"
      cipher:
        - "CHANGE-ME-32-CHAR-CIPHER-KEY!!!"

  identitySchemas:
    "identity.schema.json": |
      {
        "$id": "https://schemas.ory.sh/presets/kratos/identity.email.schema.json",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Customer",
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
                  "credentials": {
                    "password": { "identifier": true }
                  },
                  "verification": { "via": "email" },
                  "recovery": { "via": "email" }
                }
              }
            },
            "required": ["email"],
            "additionalProperties": false
          }
        }
      }

  automigration:
    enabled: true

  # Job to run migrations before deployment
  job:
    annotations:
      helm.sh/hook: pre-install,pre-upgrade
      helm.sh/hook-delete-policy: before-hook-creation

# Deployment settings
replicaCount: 2

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

ingress:
  public:
    enabled: true
    className: "nginx"
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
    hosts:
      - host: auth.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: kratos-public-tls
        hosts:
          - auth.example.com

  admin:
    enabled: false  # Admin API should not be publicly exposed

service:
  public:
    type: ClusterIP
    port: 4433
  admin:
    type: ClusterIP
    port: 4434

# Pod disruption budget
pdb:
  enabled: true
  minAvailable: 1

# Service monitor for Prometheus
serviceMonitor:
  enabled: true
  labels:
    release: prometheus
```

## Ory Hydra (OAuth2 / OIDC)

### Install

```bash
helm install hydra ory/hydra \
  --namespace ory \
  -f hydra-values.yaml
```

### values.yaml Example

```yaml
# hydra-values.yaml

hydra:
  config:
    dsn: "postgres://hydra:secret@postgresql:5432/hydra?sslmode=require"

    serve:
      public:
        cors:
          enabled: true
          allowed_origins:
            - "https://app.example.com"
      cookies:
        same_site_mode: Lax

    urls:
      self:
        issuer: "https://auth.example.com/"
      consent: "https://app.example.com/consent"
      login: "https://app.example.com/login"
      logout: "https://app.example.com/logout"

    secrets:
      system:
        - "CHANGE-ME-32-CHAR-SYSTEM-SECRET!"

    oidc:
      subject_identifiers:
        supported_types:
          - pairwise
          - public
        pairwise:
          salt: "CHANGE-ME-PAIRWISE-SALT-VALUE"

    ttl:
      access_token: 1h
      refresh_token: 720h
      id_token: 1h
      auth_code: 10m
      login_consent_request: 30m

  automigration:
    enabled: true

replicaCount: 2

ingress:
  public:
    enabled: true
    className: "nginx"
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
    hosts:
      - host: auth.example.com
        paths:
          - path: /oauth2
            pathType: Prefix
          - path: /.well-known
            pathType: Prefix
    tls:
      - secretName: hydra-public-tls
        hosts:
          - auth.example.com
```

## Ory Oathkeeper (API Gateway / Zero-Trust Proxy)

### Install

```bash
helm install oathkeeper ory/oathkeeper \
  --namespace ory \
  -f oathkeeper-values.yaml
```

### values.yaml Example

```yaml
# oathkeeper-values.yaml

oathkeeper:
  config:
    authenticators:
      cookie_session:
        enabled: true
        config:
          check_session_url: "http://kratos-public:4433/sessions/whoami"
          preserve_path: true
          extra_from: "@this"
          subject_from: "identity.id"
          force_method: GET
      bearer_token:
        enabled: true
        config:
          check_session_url: "http://kratos-public:4433/sessions/whoami"
          force_method: GET
          token_from:
            header: Authorization
      noop:
        enabled: true

    authorizers:
      allow:
        enabled: true
      deny:
        enabled: true

    mutators:
      header:
        enabled: true
        config:
          headers:
            X-User-Id: "{{ print .Subject }}"
            X-User-Email: "{{ print .Extra.identity.traits.email }}"
      noop:
        enabled: true

    serve:
      proxy:
        port: 4455
      api:
        port: 4456

  accessRules: |
    - id: "public-health"
      upstream:
        url: "http://api-service:8080"
      match:
        url: "<https://api.example.com/health>"
        methods: ["GET"]
      authenticators:
        - handler: noop
      authorizer:
        handler: allow
      mutators:
        - handler: noop

    - id: "protected-api"
      upstream:
        url: "http://api-service:8080"
      match:
        url: "<https://api.example.com/api/<**>>"
        methods: ["GET", "POST", "PUT", "DELETE"]
      authenticators:
        - handler: cookie_session
        - handler: bearer_token
      authorizer:
        handler: allow
      mutators:
        - handler: header

replicaCount: 2

ingress:
  proxy:
    enabled: true
    className: "nginx"
    hosts:
      - host: api.example.com
        paths:
          - path: /
            pathType: Prefix
```

## PostgreSQL Dependency

All Ory services need a database. You can use the Bitnami PostgreSQL chart as a dependency:

```yaml
# Chart.yaml (umbrella chart)
apiVersion: v2
name: ory-stack
version: 1.0.0

dependencies:
  - name: postgresql
    version: "14.x.x"
    repository: "https://charts.bitnami.com/bitnami"
  - name: kratos
    version: "0.x.x"
    repository: "https://k8s.ory.sh/helm/charts"
  - name: hydra
    version: "0.x.x"
    repository: "https://k8s.ory.sh/helm/charts"
```

```yaml
# Umbrella values.yaml
postgresql:
  auth:
    postgresPassword: "change-me"
    database: ory
  primary:
    persistence:
      size: 20Gi
```

## Production Checklist

- [ ] Replace all `CHANGE-ME` secret values with strong random strings
- [ ] Enable TLS on all ingresses
- [ ] Set `development: false` on all Ory services
- [ ] Configure database connection pooling
- [ ] Enable pod disruption budgets
- [ ] Set resource requests and limits
- [ ] Enable autoscaling
- [ ] Configure Prometheus ServiceMonitors
- [ ] Run database on a managed service (RDS, Cloud SQL) rather than in-cluster
- [ ] Set up database backups
- [ ] Configure network policies to restrict admin API access
- [ ] Store secrets in a secrets manager (Vault, AWS Secrets Manager) via External Secrets Operator

## Useful Helm Commands

```bash
# List available chart versions
helm search repo ory --versions

# Show default values for a chart
helm show values ory/kratos

# Upgrade a release
helm upgrade kratos ory/kratos --namespace ory -f kratos-values.yaml

# Rollback
helm rollback kratos 1 --namespace ory

# Dry-run to preview changes
helm upgrade kratos ory/kratos --namespace ory -f kratos-values.yaml --dry-run --debug
```

## References

- [Ory Kubernetes Helm Charts](https://github.com/ory/k8s)
- [Ory Kratos Helm Chart README](https://github.com/ory/k8s/tree/master/helm/charts/kratos)
- [Ory Hydra Helm Chart README](https://github.com/ory/k8s/tree/master/helm/charts/hydra)
- [Ory Oathkeeper Helm Chart README](https://github.com/ory/k8s/tree/master/helm/charts/oathkeeper)
- [Ory Network Documentation](https://www.ory.sh/docs/)
