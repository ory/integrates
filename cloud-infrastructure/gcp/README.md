# GCP Infrastructure for Ory Network

## Overview

This guide covers deploying and integrating Ory with Google Cloud Platform infrastructure. While Ory Network is a managed cloud service, organizations hosting applications on GCP need to understand connectivity patterns. This document covers both connecting GCP-hosted applications to Ory Network (managed) and self-hosting Ory on GKE with Cloud SQL.

## Architecture Patterns

### Pattern 1: GCP Application + Ory Network (Managed)

```
┌─────────────────────────────────────────────────────────────────┐
│  GCP Project                                                    │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Cloud LB    │───▶│  GKE / Cloud │───▶│  Cloud SQL   │      │
│  │  (Ingress)   │    │  Run (App)   │    │  (App DB)    │      │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘      │
│         │                   │                                   │
│         │                   │ HTTPS                              │
│         │                   ▼                                    │
│         │           ┌──────────────────┐                        │
│         │           │  Ory Network     │                        │
│         │           │  (External)      │                        │
│         │           │  *.oryapis.com   │                        │
│         │           └──────────────────┘                        │
│         │                                                       │
│  ┌──────▼───────┐                                              │
│  │  Cloud DNS   │                                              │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern 2: Self-Hosted Ory on GKE

```
┌─────────────────────────────────────────────────────────────────┐
│  GCP VPC                                                        │
│                                                                 │
│  ┌──────────────┐    ┌───────────────────────────────────┐     │
│  │  Cloud LB    │    │  GKE Cluster                      │     │
│  │  (Ingress)   │───▶│                                   │     │
│  └──────────────┘    │  ┌───────────┐  ┌───────────┐    │     │
│                      │  │ Ory Kratos│  │ Ory Hydra │    │     │
│                      │  │ (3 pods)  │  │ (3 pods)  │    │     │
│                      │  └─────┬─────┘  └─────┬─────┘    │     │
│                      │        │              │           │     │
│                      │  ┌───────────┐  ┌───────────┐    │     │
│                      │  │ Ory Keto  │  │ Ory Oathkeeper│ │     │
│                      │  │ (2 pods)  │  │ (3 pods)  │    │     │
│                      │  └─────┬─────┘  └─────┬─────┘    │     │
│                      └────────┼──────────────┼───────────┘     │
│                               │              │                  │
│  ┌──────────────┐    ┌───────▼──────────────▼────────┐         │
│  │  Memorystore │    │  Cloud SQL PostgreSQL         │         │
│  │  (Redis)     │    │  (HA)                         │         │
│  └──────────────┘    └───────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

## Pattern 1: GCP Application with Ory Network

### Cloud Run Deployment

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
        - image: gcr.io/my-project/my-app:latest
          env:
            - name: ORY_SDK_URL
              value: "https://<your-project>.projects.oryapis.com"
            - name: ORY_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ory-api-key
                  key: latest
          ports:
            - containerPort: 8080
```

```bash
# Store API key in Secret Manager
echo -n "ory_pat_your_api_key" | \
  gcloud secrets create ory-api-key --data-file=-

# Deploy to Cloud Run
gcloud run deploy my-app \
  --image gcr.io/my-project/my-app:latest \
  --set-env-vars ORY_SDK_URL=https://<your-project>.projects.oryapis.com \
  --set-secrets ORY_API_KEY=ory-api-key:latest \
  --region us-central1
```

### Custom Domain with Cloud DNS

```bash
# Configure custom domain in Ory Network
ory update project <project-id> \
  --custom-domain "auth.example.com"

# Create DNS record
gcloud dns record-sets create auth.example.com \
  --zone=example-zone \
  --type=CNAME \
  --ttl=300 \
  --rrdatas="custom.oryapis.com."
```

### VPC Firewall Rules

```bash
# Allow outbound HTTPS (default allowed, but explicit for private clusters)
gcloud compute firewall-rules create allow-ory-egress \
  --direction=EGRESS \
  --action=ALLOW \
  --rules=tcp:443 \
  --destination-ranges=0.0.0.0/0 \
  --target-tags=ory-app \
  --network=default
```

## Pattern 2: Self-Hosted Ory on GKE

### GKE Cluster Setup

```bash
# Create GKE Autopilot cluster
gcloud container clusters create-auto ory-cluster \
  --region us-central1 \
  --release-channel regular

# Or standard cluster with more control
gcloud container clusters create ory-cluster \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type e2-standard-4 \
  --enable-ip-alias \
  --enable-network-policy
```

### Cloud SQL PostgreSQL Setup

```bash
# Create Cloud SQL instance
gcloud sql instances create ory-db \
  --database-version=POSTGRES_15 \
  --tier=db-custom-4-16384 \
  --region=us-central1 \
  --availability-type=REGIONAL \
  --storage-type=SSD \
  --storage-size=100GB \
  --storage-auto-increase \
  --backup-start-time=02:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=03 \
  --database-flags=max_connections=200

# Create databases
gcloud sql databases create kratos --instance=ory-db
gcloud sql databases create hydra --instance=ory-db
gcloud sql databases create keto --instance=ory-db

# Create user
gcloud sql users create ory \
  --instance=ory-db \
  --password=<secure-password>
```

### Memorystore Redis Setup

```bash
gcloud redis instances create ory-redis \
  --size=5 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --tier=STANDARD_HA \
  --transit-encryption-mode=SERVER_AUTHENTICATION
```

### Deploy Ory via Helm on GKE

```bash
# Get GKE credentials
gcloud container clusters get-credentials ory-cluster --region us-central1

# Add Ory Helm repo
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update

# Deploy Kratos
helm install kratos ory/kratos \
  --namespace ory --create-namespace \
  --set kratos.config.dsn="postgres://ory:password@<cloud-sql-ip>:5432/kratos?sslmode=require" \
  --set kratos.config.secrets.default[0]="your-secret-key" \
  --values kratos-values.yaml

# Deploy Hydra
helm install hydra ory/hydra \
  --namespace ory \
  --set hydra.config.dsn="postgres://ory:password@<cloud-sql-ip>:5432/hydra?sslmode=require" \
  --values hydra-values.yaml
```

### Cloud SQL Proxy (recommended for GKE)

```yaml
# cloud-sql-proxy sidecar
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kratos
  namespace: ory
spec:
  template:
    spec:
      containers:
        - name: kratos
          # ... kratos container config
          env:
            - name: DSN
              value: "postgres://ory:password@localhost:5432/kratos?sslmode=disable"
        - name: cloud-sql-proxy
          image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2
          args:
            - "--structured-logs"
            - "--port=5432"
            - "my-project:us-central1:ory-db"
          securityContext:
            runAsNonRoot: true
```

### GKE Ingress with Google Cloud Load Balancer

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ory-ingress
  namespace: ory
  annotations:
    kubernetes.io/ingress.class: "gce"
    kubernetes.io/ingress.global-static-ip-name: "ory-ip"
    networking.gke.io/managed-certificates: "ory-cert"
spec:
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
---
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: ory-cert
  namespace: ory
spec:
  domains:
    - auth.example.com
```

## Testing

### Verify Ory Network Connectivity

```bash
# From Cloud Run or GKE pod
curl -s https://<your-project>.projects.oryapis.com/health/ready
```

### Verify Cloud SQL Connection

```bash
# From GKE pod with cloud-sql-proxy
psql "postgres://ory:password@localhost:5432/kratos" -c "SELECT version();"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Cannot reach Ory Network from GKE** | Private cluster without NAT | Configure Cloud NAT for outbound internet access |
| **Cloud SQL connection refused** | Missing authorized network | Use Cloud SQL Proxy or add GKE pod CIDR to authorized networks |
| **Memorystore unreachable** | VPC peering not configured | Ensure Memorystore is in the same VPC as GKE |
| **Managed certificate pending** | DNS not pointing to load balancer IP | Verify DNS A record points to the reserved static IP |

## Resources

- [Ory Network Documentation](https://www.ory.sh/docs/)
- [Ory Helm Charts](https://github.com/ory/k8s)
- [GKE Documentation](https://cloud.google.com/kubernetes-engine/docs)
- [Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres)
- [Memorystore for Redis](https://cloud.google.com/memorystore/docs/redis)
- [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/connect-kubernetes-engine)
- [GKE Ingress](https://cloud.google.com/kubernetes-engine/docs/concepts/ingress)
