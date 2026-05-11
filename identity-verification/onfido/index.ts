import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import express from 'express';
import { Configuration, IdentityApi } from '@ory/client';
import { JsonPatchOpEnum } from '@ory/client/api';

// Verify webhook signature[299]
function verifyOnfidoWebhook(
  rawBody: string,
  signature: string,
  webhookToken: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', webhookToken)
    .update(rawBody)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

interface OnfidoConfig {
  apiToken: string;
  region: 'EU' | 'US' | 'CA';
}

class OnfidoClient {
  private client: AxiosInstance;
  private workflowId: string;

  constructor(config: OnfidoConfig, workflowId: string) {
    const baseURLs = {
      EU: 'https://api.eu.onfido.com/v3.6',
      US: 'https://api.us.onfido.com/v3.6',
      CA: 'https://api.ca.onfido.com/v3.6'
    };

    this.client = axios.create({
      baseURL: baseURLs[config.region],
      headers: {
        'Authorization': `Token token=${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.workflowId = workflowId;
  }

  // Create applicant[315]
  async createApplicant(data: {
    first_name: string;
    last_name: string;
    email?: string;
    dob?: string;
  }) {
    const response = await this.client.post('/applicants', data);
    return response.data;
  }

  // Create workflow run[315][318]
  async createWorkflowRun(applicantId: string, customData?: any) {
    const response = await this.client.post('/workflow_runs', {
      workflow_id: this.workflowId,
      applicant_id: applicantId,
      custom_data: customData
    });
    return response.data;
  }

  // Retrieve workflow run results[318][320]
  async getWorkflowRun(workflowRunId: string) {
    const response = await this.client.get(`/workflow_runs/${workflowRunId}`);
    return response.data;
  }
}

const app = express();
app.use(express.json());

const kratosAdmin = new IdentityApi(
  new Configuration({
    basePath: process.env.KRATOS_ADMIN_URL
  })
);

const onfidoClient = new OnfidoClient(
  {
    apiToken: process.env.ONFIDO_API_TOKEN!,
    region: process.env.ONFIDO_REGION as 'EU' | 'US' | 'CA'
  },
  process.env.ONFIDO_WORKFLOW_ID!
);

// Post-registration: Initiate Onfido verification[315]
app.post('/webhooks/onfido-initiate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      kratos_identity_id,
      first_name,
      last_name,
      email,
      date_of_birth
    } = req.body;

    console.log(`Initiating Onfido verification for ${kratos_identity_id}`);

    // Step 1: Create Onfido applicant[315]
    const applicant = await onfidoClient.createApplicant({
      first_name,
      last_name,
      email,
      dob: date_of_birth
    });

    console.log(`Created Onfido applicant: ${applicant.id}`);

    // Step 2: Create workflow run[315][318]
    const workflowRun = await onfidoClient.createWorkflowRun(
      applicant.id,
      { kratos_identity_id } // Pass Kratos ID in custom_data
    );

    console.log(`Created workflow run: ${workflowRun.id}`);

    // Step 3: Store Onfido data in Kratos metadata
    await kratosAdmin.patchIdentity({
      id: kratos_identity_id,
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/onfido_verification_status',
          value: 'initiated'
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/onfido_applicant_id',
          value: applicant.id
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/onfido_workflow_run_id',
          value: workflowRun.id
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/onfido_initiated_at',
          value: new Date().toISOString()
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/onfido_sdk_token',
          value: workflowRun.sdk_token
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/onfido_dashboard_url',
          value: workflowRun.dashboard_url
        }
      ]
    });

    // Return SDK token and workflow run ID to frontend
    return res.status(200).json({
      success: true,
      sdk_token: workflowRun.sdk_token,
      workflow_run_id: workflowRun.id
    });

  } catch (error) {
    console.error('Onfido initiation error:', error);
    
    try {
      await kratosAdmin.patchIdentity({
        id: req.body.kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/onfido_initiation_error',
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


// Handle Onfido webhook[318]
app.post('/webhooks/onfido-callback', async (req, res) => {
  try {
    // Verify webhook signature[299]
    const signature = req.headers['x-sha2-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    
    if (!verifyOnfidoWebhook(rawBody, signature, process.env.ONFIDO_WEBHOOK_TOKEN!)) {
      console.warn('Invalid webhook signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const { payload } = req.body;
    const { resource_type, action, object } = payload;

    // Only process workflow_run.completed events[318]
    if (resource_type !== 'workflow_run' || action !== 'workflow_run.completed') {
      return res.status(200).json({ received: true });
    }

    const workflowRunId = object.id;

    console.log(`Received workflow completion: ${workflowRunId}`);

    // Respond immediately[318]
    res.status(200).json({ received: true });

    // Retrieve workflow run results[318][320]
    const workflowRun = await onfidoClient.getWorkflowRun(workflowRunId);
    
    const { status, output, applicant_id } = workflowRun;
    const kratosIdentityId = workflowRun.custom_data?.kratos_identity_id;

    if (!kratosIdentityId) {
      console.error('No Kratos identity ID in custom_data');
      return;
    }

    console.log(`Verification completed: status=${status}`);

    // Update Kratos metadata with results
    await kratosAdmin.patchIdentity({
      id: kratosIdentityId,
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/onfido_verification_status',
          value: status // 'approved', 'declined', 'review'
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/onfido_completed_at',
          value: object.completed_at_iso8601
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/onfido_output',
          value: JSON.stringify(output)
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/onfido_status_details',
          value: status
        }
      ]
    });

    console.log(`Updated Kratos metadata for ${kratosIdentityId}`);

  } catch (error) {
    console.error('Webhook processing error:', error);
  }
});

// Post-login: Validate Onfido verification status
app.post('/webhooks/onfido-validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      kratos_identity_id,
      onfido_verification_status,
      onfido_workflow_run_id
    } = req.body;

    // If no verification, allow login but flag for verification
    if (!onfido_verification_status) {
      console.log(`User ${kratos_identity_id} has no Onfido verification`);
      return res.status(200).json({ success: true });
    }

    // Check verification status
    if (onfido_verification_status === 'approved') {
      // Update last validation timestamp
      await kratosAdmin.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/onfido_last_validated_at',
            value: new Date().toISOString()
          }
        ]
      });

      return res.status(200).json({ success: true });
    }

    // If declined, block login
    if (onfido_verification_status === 'declined') {
      console.warn(`Blocking login for ${kratos_identity_id} - verification declined`);
      
      return res.status(403).json({
        messages: [{
          instance_ptr: "#/",
          messages: [{
            id: 4000050,
            text: "Identity verification failed. Please contact support.",
            type: "error",
            context: {
              reason: "identity_verification_declined"
            }
          }]
        }]
      });
    }

    // If in review, allow login with warning
    if (onfido_verification_status === 'review') {
      console.log(`User ${kratos_identity_id} verification under review`);
      return res.status(200).json({ 
        success: true,
        warning: 'Verification under review'
      });
    }

    // Unknown status - allow login
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Validation error:', error);
    return res.status(200).json({ success: true });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Webhook server running on port ${process.env.PORT || 3000}`);
});
