# Kubernetes Integration with Ory

## Overview

This guide provides raw Kubernetes manifests for deploying Ory components (Kratos, Hydra, Keto, Oathkeeper) without Helm. This approach is useful for teams that prefer direct manifest management, GitOps workflows (Flux, ArgoCD), or need granular control over Kubernetes resources. For Helm-based deployment, see the official [Ory Helm Charts](https://github.com/ory/k8s).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                      │
│                                                         │
│  ┌─────────────────┐   ┌──────────────────────────────┐│
│  │  Ingress         │   │  Namespace: ory              ││
│  │  Controller      │──▶│                              ││
│  │  (nginx/traefik) │   │  ┌────────┐  ┌────────┐    ││
│  └─────────────────┘   │  │ Kratos │  │ Hydra  │    ││
│                         │  │ Public │  │ Public │    ││
│                         │  │ (3 pod)│  │ (3 pod)│    ││
│                         │  └───┬────┘  └───┬────┘    ││
│                         │      │           │          ││
│                         │  ┌────────┐  ┌────────┐    ││
│                         │  │ Kratos │  │ Hydra  │    ││
│                         │  │ Admin  │  │ Admin  │    ││
│                         │  │ (ClusterIP)│ (ClusterIP)│││
│                         │  └───┬────┘  └───┬────┘    ││
│                         │      │           │          ││
│                         │  ┌───▼───────────▼────┐    ││
│                         │  │   PostgreSQL       │    ││
│                         │  │   (StatefulSet or  │    ││
│                         │  │    external DB)    │    ││
│                         │  └────────────────────┘    ││
│                         └──────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Manifests

### Namespace

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ory
  labels:
    app.kubernetes.io/part-of: ory
```

### ConfigMap — Kratos Configuration

```yaml
# kratos-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kratos-config
  namespace: ory
data:
  kratos.yml: |
    version: v1.3.0
    serve:
      public:
        base_url: https://auth.example.com/
        cors:
          enabled: true
          allowed_origins: ["https://app.example.com"]
      admin:
        base_url: http://kratos-admin:4434/
    selfservice:
      default_browser_return_url: https://app.example.com/
      methods:
        password:
          enabled: true
        totp:
          enabled: true
      flows:
        login:
          ui_url: https://app.example.com/login
        registration:
          ui_url: https://app.example.com/registration
          after:
            password:
              hooks:
                - hook: session
        settings:
          ui_url: https://app.example.com/settings
        verification:
          enabled: true
          ui_url: https://app.example.com/verification
        recovery:
          enabled: true
          ui_url: https://app.example.com/recovery
    identity:
      default_schema_id: default
      schemas:
        - id: default
          url: file:///etc/config/kratos/identity.schema.json
    courier:
      smtp:
        connection_uri: smtp://smtp.example.com:587/?skip_ssl_verify=false
    log:
      level: info
      format: json

  identity.schema.json: |
    {
      "$id": "https://schemas.example.com/identity.schema.json",
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
              "ory.sh/kratos": {
                "credentials": { "password": { "identifier": true } },
                "verification": { "via": "email" },
                "recovery": { "via": "email" }
              }
            },
            "name": {
              "type": "object",
              "properties": {
                "first": { "type": "string" },
                "last": { "type": "string" }
              }
            }
          },
          "required": ["email"]
        }
      }
    }
```

### Secret — Database Credentials

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ory-secrets
  namespace: ory
type: Opaque
stringData:
  dsn-kratos: "postgres://ory:password@postgres:5432/kratos?sslmode=require"
  dsn-hydra: "postgres://ory:password@postgres:5432/hydra?sslmode=require"
  kratos-secrets: "a-very-secret-key-that-is-at-least-32-characters"
  hydra-secrets: "another-very-secret-key-that-is-at-least-32-chars"
```

### Job — Database Migration

```yaml
# kratos-migrate-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: kratos-migrate
  namespace: ory
  labels:
    app: kratos-migrate
spec:
  backoffLimit: 3
  template:
    metadata:
      labels:
        app: kratos-migrate
    spec:
      restartPolicy: OnFailure
      containers:
        - name: kratos-migrate
          image: oryd/kratos:v1.3.0
          command: ["kratos"]
          args: ["migrate", "sql", "-e", "--yes"]
          env:
            - name: DSN
              valueFrom:
                secretKeyRef:
                  name: ory-secrets
                  key: dsn-kratos
```

### Deployment — Kratos

```yaml
# kratos-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kratos
  namespace: ory
  labels:
    app: kratos
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kratos
  template:
    metadata:
      labels:
        app: kratos
    spec:
      containers:
        - name: kratos
          image: oryd/kratos:v1.3.0
          command: ["kratos"]
          args: ["serve", "all", "-c", "/etc/config/kratos/kratos.yml"]
          ports:
            - name: public
              containerPort: 4433
            - name: admin
              containerPort: 4434
          env:
            - name: DSN
              valueFrom:
                secretKeyRef:
                  name: ory-secrets
                  key: dsn-kratos
            - name: SECRETS_DEFAULT
              valueFrom:
                secretKeyRef:
                  name: ory-secrets
                  key: kratos-secrets
          volumeMounts:
            - name: config
              mountPath: /etc/config/kratos
          readinessProbe:
            httpGet:
              path: /health/ready
              port: public
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/alive
              port: public
            initialDelaySeconds: 10
            periodSeconds: 15
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
      volumes:
        - name: config
          configMap:
            name: kratos-config
```

### Service — Kratos

```yaml
# kratos-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: kratos-public
  namespace: ory
  labels:
    app: kratos
spec:
  type: ClusterIP
  selector:
    app: kratos
  ports:
    - name: http
      port: 80
      targetPort: public
---
apiVersion: v1
kind: Service
metadata:
  name: kratos-admin
  namespace: ory
  labels:
    app: kratos
spec:
  type: ClusterIP
  selector:
    app: kratos
  ports:
    - name: http
      port: 80
      targetPort: admin
```

### Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ory-ingress
  namespace: ory
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - auth.example.com
      secretName: ory-tls
  rules:
    - host: auth.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kratos-public
                port:
                  number: 80
```

### HorizontalPodAutoscaler

```yaml
# kratos-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: kratos
  namespace: ory
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: kratos
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### NetworkPolicy

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kratos-admin-restrict
  namespace: ory
spec:
  podSelector:
    matchLabels:
      app: kratos
  policyTypes:
    - Ingress
  ingress:
    # Allow public API from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 4433
    # Allow admin API only from within ory namespace
    - from:
        - podSelector: {}
      ports:
        - port: 4434
```

## Deployment

```bash
# Apply all manifests
kubectl apply -f namespace.yaml
kubectl apply -f secrets.yaml
kubectl apply -f kratos-configmap.yaml

# Run migrations first
kubectl apply -f kratos-migrate-job.yaml
kubectl wait --for=condition=complete job/kratos-migrate -n ory --timeout=120s

# Deploy services
kubectl apply -f kratos-deployment.yaml
kubectl apply -f kratos-service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f kratos-hpa.yaml
kubectl apply -f network-policy.yaml
```

## Testing

### Verify Pods

```bash
kubectl get pods -n ory
kubectl logs -f deployment/kratos -n ory
```

### Health Check

```bash
kubectl port-forward svc/kratos-public 4433:80 -n ory &
curl http://localhost:4433/health/ready
```

### Test Identity Creation

```bash
kubectl port-forward svc/kratos-admin 4434:80 -n ory &
curl -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{"schema_id":"default","traits":{"email":"test@example.com"}}' | jq '.id'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Migration job fails** | Database not reachable | Verify DSN in secret; check DB connectivity from ory namespace |
| **CrashLoopBackOff** | Config error or missing secret | Check pod logs: `kubectl logs <pod> -n ory` |
| **502 from Ingress** | Pods not ready | Check readiness probe; verify service selectors match pod labels |
| **Admin API accessible externally** | Missing NetworkPolicy | Apply network policy to restrict admin port to internal traffic |
| **TLS errors** | cert-manager not configured | Install cert-manager and create ClusterIssuer |

## Resources

- [Ory Self-Hosting Guide](https://www.ory.sh/docs/self-hosted/deployment)
- [Ory Helm Charts (reference)](https://github.com/ory/k8s)
- [Ory Kratos Configuration Reference](https://www.ory.sh/docs/kratos/reference/configuration)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [cert-manager](https://cert-manager.io/docs/)
