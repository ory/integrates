# AWS API Gateway + Ory Network Integration

## Overview

[AWS API Gateway](https://aws.amazon.com/api-gateway/) is a fully managed service for creating, publishing, and securing APIs at scale. This integration uses a **Lambda authorizer** (formerly "custom authorizer") to validate Ory-issued JWTs at the gateway layer before requests reach your backend services.

## Integration Architecture

AWS API Gateway invokes a Lambda authorizer function on each request. The authorizer validates the Ory JWT using the project's JWKS endpoint and returns an IAM policy that either allows or denies the request.

```
Client ──► API Gateway ──► Lambda Authorizer ──► (cache policy)
               │                  │
               │                  └── Fetches JWKS from Ory Network
               │                      GET https://{project-slug}.projects.oryapis.com/.well-known/jwks.json
               │
               └── (if allowed) ──► Lambda / ECS / EC2 backend
                                     (receives identity context)
```

**Flow:**

1. Client sends request with `Authorization: Bearer <ory-jwt>` header.
2. API Gateway extracts the token and invokes the Lambda authorizer.
3. The authorizer fetches Ory's JWKS (cached), validates the JWT signature and claims.
4. On success, it returns an `Allow` IAM policy with identity context.
5. API Gateway caches the policy (configurable TTL) and forwards the request to the backend.
6. The backend receives identity claims via `$context.authorizer.*` mapping.

## Configuration

### Prerequisites

- AWS account with API Gateway and Lambda access
- An Ory Network project with OAuth2/OIDC enabled
- Node.js 18+ runtime for the Lambda authorizer
- Your Ory project slug

### Lambda Authorizer Code (Node.js)

```javascript
// authorizer/index.mjs
// Lambda Authorizer for AWS API Gateway — validates Ory Network JWTs

import { createRemoteJWKSet, jwtVerify } from 'jose';

const ORY_PROJECT_URL = process.env.ORY_PROJECT_URL; // https://{project-slug}.projects.oryapis.com
const JWKS_URI = `${ORY_PROJECT_URL}/.well-known/jwks.json`;
const EXPECTED_ISSUER = ORY_PROJECT_URL;
const EXPECTED_AUDIENCE = process.env.EXPECTED_AUDIENCE; // Your API identifier (optional)

// Cache the JWKS fetcher across invocations
const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export const handler = async (event) => {
  const token = extractToken(event);

  if (!token) {
    console.log('No token found in request');
    return generatePolicy('anonymous', 'Deny', event.methodArn, {});
  }

  try {
    const verifyOptions = {
      issuer: EXPECTED_ISSUER,
      algorithms: ['RS256'],
    };

    if (EXPECTED_AUDIENCE) {
      verifyOptions.audience = EXPECTED_AUDIENCE;
    }

    const { payload } = await jwtVerify(token, jwks, verifyOptions);

    console.log('Token verified successfully', { sub: payload.sub });

    const context = {
      userId: payload.sub || '',
      email: payload.email || '',
      scope: payload.scope || '',
      clientId: payload.client_id || '',
      sessionId: payload.sid || '',
      tokenUse: payload.token_use || 'access_token',
    };

    return generatePolicy(payload.sub, 'Allow', event.methodArn, context);
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return generatePolicy('anonymous', 'Deny', event.methodArn, {});
  }
};

function extractToken(event) {
  // REST API (v1) — token authorizer
  if (event.authorizationToken) {
    const match = event.authorizationToken.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }

  // HTTP API (v2) — payload format 2.0
  if (event.headers?.authorization) {
    const match = event.headers.authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }

  return null;
}

function generatePolicy(principalId, effect, resource, context) {
  // Wildcard the resource to allow policy caching across methods
  const resourceArn = resource.replace(/\/[A-Z]+\//, '/*/').replace(/\/[^/]+$/, '/*');

  const policy = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resourceArn,
        },
      ],
    },
    context, // Passed to backend via $context.authorizer.*
  };

  return policy;
}
```

### Dependencies

```json
{
  "name": "ory-jwt-authorizer",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "jose": "^5.0.0"
  }
}
```

### SAM / CloudFormation Template

```yaml
# template.yaml — AWS SAM template
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: AWS API Gateway with Ory Network JWT Authorizer

Parameters:
  OryProjectUrl:
    Type: String
    Description: "Ory Network project URL (e.g., https://my-project.projects.oryapis.com)"
  ExpectedAudience:
    Type: String
    Default: ""
    Description: "Expected JWT audience claim (optional)"

Globals:
  Function:
    Runtime: nodejs18.x
    Timeout: 10
    MemorySize: 128

Resources:
  # ---- Lambda Authorizer Function ----
  OryAuthorizerFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: ory-jwt-authorizer
      Handler: index.handler
      CodeUri: ./authorizer/
      Environment:
        Variables:
          ORY_PROJECT_URL: !Ref OryProjectUrl
          EXPECTED_AUDIENCE: !Ref ExpectedAudience

  # ---- REST API ----
  MyApi:
    Type: AWS::Serverless::Api
    Properties:
      Name: my-api
      StageName: prod
      Auth:
        DefaultAuthorizer: OryJwtAuthorizer
        Authorizers:
          OryJwtAuthorizer:
            FunctionArn: !GetAtt OryAuthorizerFunction.Arn
            FunctionPayloadType: TOKEN
            Identity:
              Header: Authorization
              ReauthorizeEvery: 300  # Cache policy for 5 minutes

      # CORS configuration
      Cors:
        AllowOrigin: "'*'"
        AllowHeaders: "'Authorization,Content-Type'"
        AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"

  # ---- Backend Function ----
  MyBackendFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: my-backend
      Handler: backend.handler
      CodeUri: ./backend/
      Events:
        GetResource:
          Type: Api
          Properties:
            RestApiId: !Ref MyApi
            Path: /resource
            Method: GET
        PostResource:
          Type: Api
          Properties:
            RestApiId: !Ref MyApi
            Path: /resource
            Method: POST

  # ---- Health Check (no auth) ----
  HealthFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: health-check
      Handler: health.handler
      CodeUri: ./health/
      Events:
        Health:
          Type: Api
          Properties:
            RestApiId: !Ref MyApi
            Path: /health
            Method: GET
            Auth:
              Authorizer: NONE

Outputs:
  ApiUrl:
    Description: "API Gateway URL"
    Value: !Sub "https://${MyApi}.execute-api.${AWS::Region}.amazonaws.com/prod"
  AuthorizerFunctionArn:
    Description: "Authorizer Lambda ARN"
    Value: !GetAtt OryAuthorizerFunction.Arn
```

## Token Validation Details

### JWKS Endpoint

```
URL: https://{project-slug}.projects.oryapis.com/.well-known/jwks.json
```

The `jose` library's `createRemoteJWKSet` caches the JWKS and handles key rotation automatically. The JWKS is fetched once per Lambda cold start and refreshed when an unknown `kid` is encountered.

### Expected JWT Claims

| Claim | Description | Validation |
|---|---|---|
| `iss` | Issuer | Must match `ORY_PROJECT_URL` |
| `sub` | Subject (Ory identity ID) | Used as `principalId` |
| `aud` | Audience | Optionally validated against `EXPECTED_AUDIENCE` |
| `exp` | Expiration | Must be in the future |
| `iat` | Issued-at | Informational |
| `scope` | OAuth2 scopes | Passed to backend for authorization |
| `client_id` | OAuth2 client | Passed to backend |

### Policy Caching

API Gateway caches the authorizer's IAM policy for the duration specified in `ReauthorizeEvery` (default: 300 seconds). During this window, the Lambda authorizer is not invoked for the same token, reducing latency and cost.

## Header Forwarding

The Lambda authorizer returns identity claims in the `context` object. Backend Lambda functions and HTTP integrations access these via the API Gateway context.

### In a Backend Lambda Function

```javascript
// backend/backend.mjs
export const handler = async (event) => {
  // Access identity context set by the authorizer
  const userId = event.requestContext.authorizer.userId;
  const email = event.requestContext.authorizer.email;
  const scope = event.requestContext.authorizer.scope;

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Hello, ${email}`,
      userId,
      scope,
    }),
  };
};
```

### In HTTP/VPC Link Integrations

Map authorizer context to upstream headers using API Gateway request mapping templates:

```velocity
## Mapping template (Integration Request)
#set($context.requestOverride.header.X-User-Id = $context.authorizer.userId)
#set($context.requestOverride.header.X-User-Email = $context.authorizer.email)
#set($context.requestOverride.header.X-User-Scopes = $context.authorizer.scope)
```

### For HTTP API (v2) with Lambda Authorizer

```yaml
# HTTP API with Lambda authorizer (SAM)
MyHttpApi:
  Type: AWS::Serverless::HttpApi
  Properties:
    Auth:
      DefaultAuthorizer: OryJwtAuthorizer
      Authorizers:
        OryJwtAuthorizer:
          AuthorizationScopes:
            - openid
          FunctionArn: !GetAtt OryAuthorizerFunction.Arn
          Identity:
            Headers:
              - Authorization
          AuthorizerPayloadFormatVersion: "2.0"
          EnableSimpleResponses: false
```

## Testing

### 1. Deploy the Stack

```bash
sam build
sam deploy --guided \
  --parameter-overrides \
    OryProjectUrl=https://{project-slug}.projects.oryapis.com \
    ExpectedAudience=your-api-audience
```

### 2. Obtain a Token from Ory

```bash
ACCESS_TOKEN=$(curl -s -X POST \
  https://{project-slug}.projects.oryapis.com/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=openid" | jq -r '.access_token')
```

### 3. Call the API

```bash
API_URL="https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod"

# Authenticated request (should return 200)
curl -i "$API_URL/resource" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# No token (should return 401)
curl -i "$API_URL/resource"

# Invalid token (should return 403)
curl -i "$API_URL/resource" \
  -H "Authorization: Bearer invalid"

# Health check — no auth required (should return 200)
curl -i "$API_URL/health"
```

### 4. Test Locally with SAM

```bash
# Invoke the authorizer locally
echo '{"authorizationToken":"Bearer YOUR_TOKEN","methodArn":"arn:aws:execute-api:us-east-1:123456:api-id/prod/GET/resource"}' | \
  sam local invoke OryAuthorizerFunction --event -

# Start local API
sam local start-api
```

### 5. Monitor in CloudWatch

```bash
# View authorizer logs
aws logs tail /aws/lambda/ory-jwt-authorizer --follow

# Check for authorization failures
aws logs filter-log-events \
  --log-group-name /aws/lambda/ory-jwt-authorizer \
  --filter-pattern "Token verification failed"
```

## Resources

- [AWS API Gateway Lambda Authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/)
- [jose npm package (JWT validation)](https://github.com/panva/jose)
- [Ory Network OAuth2 & OIDC Documentation](https://www.ory.sh/docs/oauth2-oidc)
- [Ory JWKS Endpoint](https://www.ory.sh/docs/hydra/jwks)
- [API Gateway Authorizer Caching](https://docs.aws.amazon.com/apigateway/latest/developerguide/configure-api-gateway-lambda-authorization-with-console.html)
- [API Gateway Mapping Templates](https://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html)
