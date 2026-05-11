import express from 'express';
import axios from 'axios';
import { Configuration, IdentityApi } from '@ory/client';
import { JsonPatchOpEnum } from '@ory/client/api';

const app = express();
app.use(express.json());

class JumioOAuthClient {
  private cachedToken: { token: string; expiresAt: number } | null = null;
  private clientId: string;
  private clientSecret: string;
  private authUrl: string;

  constructor(clientId: string, clientSecret: string, authUrl: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.authUrl = authUrl;
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    // Request new token using OAuth2 Client Credentials[246]
    const auth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString('base64');

    try {
      const response = await axios.post(
        this.authUrl,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      const { access_token, expires_in } = response.data;

      // Cache token, refresh 60 seconds before expiry
      this.cachedToken = {
        token: access_token,
        expiresAt: Date.now() + (expires_in * 1000) - 60000
      };

      return access_token;
    } catch (error) {
      console.error('Failed to obtain access token:', error);
      throw new Error('OAuth2 token request failed');
    }
  }
}

const kratosAdmin = new IdentityApi(
  new Configuration({
    basePath: process.env.KRATOS_ADMIN_URL
  })
);

const jumioOAuth = new JumioOAuthClient(
  process.env.JUMIO_CLIENT_ID!,
  process.env.JUMIO_CLIENT_SECRET!,
  process.env.JUMIO_AUTH_URL!
);

// Post-registration: Initiate Jumio verification[247]
app.post('/webhooks/jumio-initiate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      kratos_identity_id, 
      email, 
      first_name, 
      last_name 
    } = req.body;

    console.log(`Initiating Jumio verification for ${kratos_identity_id}`);

    const accessToken = await jumioOAuth.getAccessToken();

    // Create Jumio account for verification[247]
    const accountResponse = await axios.post(
      `${process.env.JUMIO_API_BASE_URL}/accounts`,
      {
        customerInternalReference: kratos_identity_id,
        workflowDefinition: {
          key: 10011  // IDIV (ID + Selfie + Face Match) workflow[247]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { id: accountId, token: transactionToken } = accountResponse.data;

    console.log(`Created Jumio account: ${accountId}`);

    // Store account ID and transaction token in Kratos metadata
    await kratosAdmin.patchIdentity({
      id: kratos_identity_id,
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/jumio_account_id',
          value: accountId
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/jumio_verification_status',
          value: 'initiated'
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/jumio_initiated_at',
          value: new Date().toISOString()
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/jumio_transaction_token',
          value: transactionToken
        }
      ]
    });

    // Return success
    return res.status(200).json({ 
      success: true,
      jumio_account_id: accountId
    });

  } catch (error) {
    console.error('Jumio initiation error:', error);
    
    try {
      await kratosAdmin.patchIdentity({
        id: req.body.kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/jumio_initiation_error',
            value: error instanceof Error ? error.message : 'Unknown error'
          }
        ]
      });
    } catch (e) {
      console.error('Failed to update identity:', e);
    }

    return res.status(200).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Handle Jumio callback[248]
app.post('/webhooks/jumio-callback', async (req, res) => {
  try {
    const { 
      callbackSentAt,
      workflowExecution,
      account 
    } = req.body;

    const { id: workflowId, status: workflowStatus } = workflowExecution;
    const { id: accountId } = account;

    console.log(`Received Jumio callback: workflow=${workflowId}, status=${workflowStatus}`);

    // Only process completed workflows
    if (workflowStatus !== 'PROCESSED') {
      console.log(`Workflow ${workflowId} not yet processed (status=${workflowStatus})`);
      return res.status(200).json({ received: true });
    }

    // Best practice: Send 200 OK immediately[248]
    res.status(200).json({ received: true });

    // Retrieve verification results asynchronously[257]
    const accessToken = await jumioOAuth.getAccessToken();

    // Get workflow details[257]
    const detailsResponse = await axios.get(
      `${process.env.JUMIO_API_BASE_URL}/accounts/${accountId}/workflow-executions/${workflowId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const { decision } = detailsResponse.data;
    const verificationPassed = decision.type === 'PASSED';

    console.log(`Verification decision: ${decision.type}`);

    // Find the Kratos identity by Jumio account ID
    // Note: Kratos doesn't have search, so we'll need to store this relationship
    // in your database or use the customerInternalReference we set
    
    // For this example, we'll need to retrieve this from your database
    // using the accountId as the lookup key
    
    // Update identity with verification result
    await kratosAdmin.patchIdentity({
      id: accountId, // In production, retrieve from your database
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/jumio_verification_status',
          value: verificationPassed ? 'verified' : 'rejected'
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/jumio_verification_decision',
          value: decision.type
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/jumio_verified_at',
          value: callbackSentAt
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/jumio_workflow_id',
          value: workflowId
        }
      ]
    });

  } catch (error) {
    console.error('Callback processing error:', error);
    // Jumio will retry the callback
  }
});

// Post-login validation
app.post('/webhooks/jumio-validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { kratos_identity_id, jumio_account_id } = req.body;

    // If no Jumio verification, allow login
    if (!jumio_account_id) {
      return res.status(200).json({ success: true });
    }

    const verificationStatus = req.body.jumio_verification_status;

    // Check verification status
    if (verificationStatus === 'verified') {
      // Update last validation timestamp
      await kratosAdmin.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/jumio_last_validated_at',
            value: new Date().toISOString()
          }
        ]
      });

      return res.status(200).json({ success: true });
    }

    if (verificationStatus === 'rejected') {
      // Block login
      return res.status(403).json({
        messages: [{
          instance_ptr: "#/",
          messages: [{
            id: 4000030,
            text: "Identity verification failed. Please contact support.",
            type: "error"
          }]
        }]
      });
    }

    // Pending verification - allow login but prompt for completion
    return res.status(200).json({ 
      success: true,
      warning: 'Please complete identity verification'
    });

  } catch (error) {
    console.error('Validation error:', error);
    return res.status(200).json({ success: true });
  }
});
