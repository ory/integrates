# AWS Infrastructure for Ory Network

## Overview

This guide covers deploying and integrating Ory with AWS infrastructure. While Ory Network is a managed cloud service that handles the Ory stack, many organizations need to understand how their AWS-hosted applications connect to Ory Network, and some choose to self-host Ory components on AWS using EKS, RDS, and ElastiCache. This document covers both patterns.

## Architecture Patterns

### Pattern 1: AWS Application + Ory Network (Managed)

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS VPC                                                        │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  ALB / CF    │───▶│  ECS / EKS   │───▶│  RDS         │      │
│  │  (Ingress)   │    │  (Your App)  │    │  (App DB)    │      │
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
│  │  Route 53    │                                              │
│  │  (DNS)       │                                              │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern 2: Self-Hosted Ory on AWS (EKS)

```
┌─────────────────────────────────────────────────────────────────┐
│  AWS VPC                                                        │
│                                                                 │
│  ┌──────────────┐    ┌───────────────────────────────────┐     │
│  │  ALB         │    │  EKS Cluster                      │     │
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
│                      │        │              │           │     │
│                      └────────┼──────────────┼───────────┘     │
│                               │              │                  │
│  ┌──────────────┐    ┌───────▼──────────────▼────────┐         │
│  │  ElastiCache │    │  RDS PostgreSQL               │         │
│  │  (Redis)     │    │  (Multi-AZ)                   │         │
│  └──────────────┘    └───────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Pattern 1: AWS Application with Ory Network

### VPC and Security Group Configuration

```hcl
# terraform/vpc.tf
resource "aws_security_group" "app" {
  name_prefix = "ory-app-"
  vpc_id      = aws_vpc.main.id

  # Allow outbound HTTPS to Ory Network
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS to Ory Network and other external services"
  }

  # Allow inbound from ALB
  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
}
```

### Application Configuration (ECS Task Definition)

```json
{
  "containerDefinitions": [
    {
      "name": "app",
      "image": "your-app:latest",
      "environment": [
        {
          "name": "ORY_SDK_URL",
          "value": "https://<your-project>.projects.oryapis.com"
        }
      ],
      "secrets": [
        {
          "name": "ORY_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:ory-api-key"
        }
      ],
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ]
    }
  ]
}
```

### Store Ory API Key in AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name ory-api-key \
  --secret-string "ory_pat_your_api_key_here" \
  --region us-east-1
```

### Custom Domain with Route 53 and CloudFront

Point your auth domain to Ory Network using a custom domain:

```bash
# Configure custom domain in Ory Network
ory update project <project-id> \
  --name "My Project" \
  --cors-allowed-origins "https://app.example.com" \
  --custom-domain "auth.example.com"
```

```hcl
# terraform/route53.tf
resource "aws_route53_record" "auth" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "auth.example.com"
  type    = "CNAME"
  ttl     = 300
  records = ["custom.oryapis.com"]
}
```

## Pattern 2: Self-Hosted Ory on AWS EKS

### EKS Cluster Setup

```bash
# Create EKS cluster
eksctl create cluster \
  --name ory-cluster \
  --region us-east-1 \
  --nodes 3 \
  --node-type m5.large \
  --with-oidc
```

### RDS PostgreSQL Setup

```hcl
# terraform/rds.tf
resource "aws_db_instance" "ory" {
  identifier     = "ory-database"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r6g.large"

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_type          = "gp3"

  db_name  = "ory"
  username = "ory"
  password = var.db_password

  multi_az               = true
  backup_retention_period = 30
  deletion_protection    = true

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.ory.name

  parameter_group_name = aws_db_parameter_group.ory.name
}

resource "aws_db_parameter_group" "ory" {
  family = "postgres15"
  name   = "ory-params"

  parameter {
    name  = "max_connections"
    value = "200"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4}"
  }
}
```

### ElastiCache Redis Setup

```hcl
# terraform/elasticache.tf
resource "aws_elasticache_replication_group" "ory" {
  replication_group_id = "ory-redis"
  description          = "Redis for Ory session caching"

  node_type            = "cache.r6g.large"
  num_cache_clusters   = 2
  engine_version       = "7.0"

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token

  subnet_group_name  = aws_elasticache_subnet_group.ory.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = true
}
```

### Deploy Ory via Helm

```bash
# Add Ory Helm repository
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update

# Deploy Kratos
helm install kratos ory/kratos \
  --namespace ory --create-namespace \
  --set kratos.config.dsn="postgres://ory:password@ory-database.xxxxx.us-east-1.rds.amazonaws.com:5432/kratos?sslmode=require" \
  --set kratos.config.secrets.default[0]="your-secret-key" \
  --values kratos-values.yaml

# Deploy Hydra
helm install hydra ory/hydra \
  --namespace ory \
  --set hydra.config.dsn="postgres://ory:password@ory-database.xxxxx.us-east-1.rds.amazonaws.com:5432/hydra?sslmode=require" \
  --set hydra.config.secrets.system[0]="your-secret-key" \
  --values hydra-values.yaml
```

### AWS Load Balancer Controller

```yaml
# alb-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ory-ingress
  namespace: ory
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789:certificate/xxx
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
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
```

## Testing

### Verify Ory Network Connectivity from AWS

```bash
# From ECS task or EKS pod
curl -s https://<your-project>.projects.oryapis.com/health/ready
```

### Verify RDS Connection (self-hosted)

```bash
# From EKS pod
psql "postgres://ory:password@ory-database.xxxxx.rds.amazonaws.com:5432/kratos?sslmode=require" \
  -c "SELECT version();"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Cannot reach Ory Network** | Security group blocks outbound HTTPS | Allow egress on port 443 to `0.0.0.0/0` |
| **RDS connection timeout** | Security group or subnet mismatch | Ensure EKS nodes and RDS are in the same VPC or peered |
| **ElastiCache auth error** | TLS or auth token misconfigured | Verify `transit_encryption_enabled` and `auth_token` match client config |
| **Custom domain not resolving** | DNS not propagated | Wait for TTL; verify CNAME record points to `custom.oryapis.com` |

## Resources

- [Ory Network Documentation](https://www.ory.sh/docs/)
- [Ory Helm Charts](https://github.com/ory/k8s)
- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AWS ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/)
- [AWS ALB Ingress Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
