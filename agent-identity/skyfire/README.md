# Skyfire Integration with Ory Network

## Overview

Skyfire is an AI agent identity and payment platform that enables "Know Your Agent" (KYA) verification for autonomous AI agents. By integrating with Ory Hydra and Ory Kratos, Skyfire provides OAuth2-based authentication and identity for AI agents, allowing them to authenticate to APIs, manage credentials, and establish trust in multi-agent systems.

Key integration capabilities:
- AI agent identity management via Ory Kratos (agent registration, profile management)
- OAuth2 client credentials flow for agent-to-service authentication via Ory Hydra
- KYA (Know Your Agent) token flow for agent identity verification
- Agent capability scoping and permission management
- Multi-agent orchestration with identity-aware routing

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   AI Agent   │─1─▶│  Skyfire     │─2─▶│  Ory Hydra   │─3─▶│  Ory Kratos  │
│   (LLM/Bot) │    │  Platform    │    │  (OAuth2)    │    │  (Identity)  │
│              │◀─5─│              │◀─4─│              │    │              │
│              │    │              │    │              │    │              │
└──────┬───────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │
       6 (authenticated API call)
       │
┌──────▼───────┐
│  Target API  │
│  (Your       │
│  Service)    │
└──────────────┘

Flow:
1. AI agent requests authentication via Skyfire
2. Skyfire initiates OAuth2 client credentials flow with Ory Hydra
3. Ory Hydra validates agent identity against Ory Kratos
4. Ory Hydra issues access token with agent scopes
5. Agent receives OAuth2 access token with KYA claims
6. Agent uses token to authenticate to target APIs
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Agent identity management. Stores agent profiles, capabilities, and owner information. |
| **Ory Hydra** | OAuth2/OIDC provider. Issues access tokens for agent authentication using client credentials flow. |
| **Ory Keto** | (Optional) Permission management. Defines agent capabilities and resource access. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project with Hydra enabled
- **Skyfire Account**: Access to [Skyfire Platform](https://skyfire.xyz/)
- **Agent Registration**: Agent must be registered in both Skyfire and Ory

## Configuration

### Step 1: Create Agent Identity Schema

Create an identity schema for AI agents in Ory Kratos:

```json
{
  "$id": "https://example.com/agent.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AI Agent",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "agent_name": {
          "type": "string",
          "title": "Agent Name",
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } }
          }
        },
        "agent_type": {
          "type": "string",
          "enum": ["llm", "bot", "service", "orchestrator"],
          "title": "Agent Type"
        },
        "owner_email": {
          "type": "string",
          "format": "email",
          "title": "Owner Email"
        },
        "capabilities": {
          "type": "array",
          "items": { "type": "string" },
          "title": "Agent Capabilities"
        },
        "description": {
          "type": "string",
          "title": "Agent Description"
        }
      },
      "required": ["agent_name", "agent_type", "owner_email"]
    }
  }
}
```

### Step 2: Register Agent Identity

```bash
# Create agent identity in Ory Kratos
ory create identity --project <project-id> --format json <<EOF
{
  "schema_id": "agent",
  "traits": {
    "agent_name": "my-ai-agent",
    "agent_type": "llm",
    "owner_email": "developer@example.com",
    "capabilities": ["read_data", "write_data", "execute_tasks"],
    "description": "Customer support AI agent"
  },
  "metadata_public": {
    "skyfire": {
      "agent_id": "skyfire-agent-id-here",
      "kya_verified": true,
      "verification_date": "2026-01-15T00:00:00Z"
    }
  }
}
EOF
```

### Step 3: Create OAuth2 Client for Agent

```bash
# Create OAuth2 client for the agent in Ory Hydra
ory create oauth2-client --project <project-id> \
  --name "my-ai-agent" \
  --grant-type client_credentials \
  --scope "agent:read agent:write agent:execute" \
  --token-endpoint-auth-method client_secret_post \
  --metadata '{"agent_identity_id":"<kratos-identity-id>","skyfire_agent_id":"<skyfire-id>"}'
```

Save the returned `client_id` and `client_secret`.

### Step 4: KYA Token Flow

```javascript
const axios = require("axios");

class AgentAuthClient {
  constructor(config) {
    this.oryHydraUrl = config.oryHydraUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.skyfireApiKey = config.skyfireApiKey;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Obtain an OAuth2 access token using client credentials.
   * The token includes KYA (Know Your Agent) claims.
   */
  async authenticate() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const { data } = await axios.post(
      `${this.oryHydraUrl}/oauth2/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "agent:read agent:write agent:execute",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // Refresh 1 min early

    return this.accessToken;
  }

  /**
   * Make an authenticated API call as the agent.
   */
  async callApi(url, options = {}) {
    const token = await this.authenticate();

    return axios({
      ...options,
      url,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "X-Agent-Id": this.clientId,
      },
    });
  }

  /**
   * Register with Skyfire KYA verification.
   */
  async registerWithSkyfire() {
    const token = await this.authenticate();

    const { data } = await axios.post(
      "https://api.skyfire.xyz/v1/agents/register",
      {
        oauth2_token: token,
        capabilities: ["read_data", "write_data"],
      },
      {
        headers: {
          Authorization: `Bearer ${this.skyfireApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return data.kya_token;
  }
}

// Usage
const agent = new AgentAuthClient({
  oryHydraUrl: "https://<your-project>.projects.oryapis.com",
  clientId: "<oauth2-client-id>",
  clientSecret: "<oauth2-client-secret>",
  skyfireApiKey: "<skyfire-api-key>",
});

// Authenticate and call an API
const response = await agent.callApi("https://api.example.com/data", {
  method: "GET",
});
```

### Step 5: Verify Agent Token in Your API

```javascript
const express = require("express");
const axios = require("axios");

const app = express();

// Middleware to validate agent tokens
async function verifyAgentToken(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    // Introspect the token with Ory Hydra
    const { data } = await axios.post(
      `${process.env.ORY_HYDRA_ADMIN_URL}/admin/oauth2/introspect`,
      new URLSearchParams({ token }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.ORY_API_KEY}`,
        },
      }
    );

    if (!data.active) {
      return res.status(401).json({ error: "Token inactive" });
    }

    req.agent = {
      client_id: data.client_id,
      scope: data.scope,
      metadata: data.ext,
    };

    next();
  } catch (err) {
    res.status(401).json({ error: "Token validation failed" });
  }
}

app.get("/api/data", verifyAgentToken, (req, res) => {
  // req.agent contains verified agent identity
  if (!req.agent.scope.includes("agent:read")) {
    return res.status(403).json({ error: "Insufficient scope" });
  }

  res.json({ data: "Agent-accessible data", agent: req.agent.client_id });
});

app.listen(3000);
```

## KYA Token Flow Architecture

```
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  Agent  │   │ Skyfire  │   │ Ory      │   │ Ory      │   │ Target   │
│  Code   │   │ Platform │   │ Hydra    │   │ Kratos   │   │ API      │
└────┬────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │              │
     │──register───▶│              │              │              │
     │              │──create id──▶│              │              │
     │              │              │──store id───▶│              │
     │              │              │◀─────────────│              │
     │              │◀─────────────│              │              │
     │◀──creds──────│              │              │              │
     │              │              │              │              │
     │──client_credentials────────▶│              │              │
     │◀──access_token──────────────│              │              │
     │              │              │              │              │
     │──API call with token────────────────────────────────────▶│
     │              │              │              │              │
     │              │              │◀──introspect───────────────│
     │              │              │──valid + claims────────────▶│
     │◀──response────────────────────────────────────────────────│
```

## Testing

### 1. Test Client Credentials Flow

```bash
# Obtain agent token
curl -s -X POST "$ORY_SDK_URL/oauth2/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=<client-id>" \
  -d "client_secret=<client-secret>" \
  -d "scope=agent:read agent:write" | jq '.access_token'
```

### 2. Test Token Introspection

```bash
curl -s -X POST "$ORY_SDK_URL/admin/oauth2/introspect" \
  -H "Authorization: Bearer $ORY_API_KEY" \
  -d "token=<access-token>" | jq '{active: .active, client_id: .client_id, scope: .scope}'
```

### 3. Verify Agent Identity

```bash
ory get identity <agent-identity-id> --project <project-id> --format json | \
  jq '{name: .traits.agent_name, type: .traits.agent_type, capabilities: .traits.capabilities}'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Token request fails** | Invalid client credentials | Verify client_id and client_secret |
| **Insufficient scope** | Scopes not configured on client | Update OAuth2 client with required scopes |
| **Token introspection returns inactive** | Token expired | Re-authenticate; check `expires_in` value |
| **Agent identity not found** | Kratos identity not linked | Verify agent identity exists and is linked via client metadata |

## Resources

- [Skyfire Platform](https://skyfire.xyz/)
- [Ory Hydra OAuth2 Documentation](https://www.ory.sh/docs/hydra)
- [Ory Hydra Client Credentials](https://www.ory.sh/docs/hydra/guides/oauth2-clients)
- [Ory Hydra Token Introspection](https://www.ory.sh/docs/hydra/guides/oauth2-token-introspection)
- [Ory Kratos Identity Management](https://www.ory.sh/docs/kratos/manage-identities/overview)
- [OAuth 2.0 Client Credentials Grant (RFC 6749)](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4)
