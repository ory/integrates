import axios from 'axios';
import type { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { Configuration, IdentityApi, JsonPatchOpEnum } from '@ory/client';
import express from 'express';
import "dotenv/config";

interface PersonaInquiryData {
  email: string;
  first_name: string;
  last_name: string;
  reference_id?: string;  // Link to Kratos identity
}

class PersonaClient {
  private client: AxiosInstance;
  private templateId: string;
  private inquiryType: string;

  constructor(apiKey: string, templateId: string, inquiryType: string = 'hosted-embedded') {
    this.client = axios.create({
      baseURL: 'https://api.withpersona.com/api/v1',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.templateId = templateId;
    this.inquiryType = inquiryType;
  }

  // Create inquiry
  async createInquiry(data: PersonaInquiryData) {
    const response = await this.client.post('/inquiries', {
      data: {
        attributes: {
          'inquiry-template-id': this.templateId,
          'inquiry-type': this.inquiryType,
          email: data.email,
          'reference-id': data.reference_id,
          relationships: {
            account: {
              data: {
                type: 'account',
                id: data.reference_id
              }
            }
          }
        },
        type: 'inquiry'
      }
    });
    return response.data.data;
  }

  // Retrieve inquiry results
  async getInquiry(inquiryId: string) {
    const response = await this.client.get(`/inquiries/${inquiryId}`);
    return response.data.data;
  }

  // List inquiries
  async listInquiries(filters?: { status?: string; reference_id?: string }) {
    const response = await this.client.get('/inquiries', { params: filters });
    return response.data.data;
  }
}

const app = express();
app.use(express.json());

const kratosAdmin = new IdentityApi(
  new Configuration({
    basePath: process.env.KRATOS_ADMIN_URL,
    accessToken: process.env.ORY_API_KEY,
  })
);

const personaClient = new PersonaClient(
  process.env.PERSONA_API_KEY!,
  process.env.PERSONA_TEMPLATE_ID!,
  process.env.PERSONA_INQUIRY_TYPE
);

// Post-registration: Initiate Persona verification
app.post('/webhooks/persona-initiate', async (req, res) => {
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

    console.log(`Initiating Persona verification for ${kratos_identity_id}`);

    // Create Persona inquiry
    const inquiry = await personaClient.createInquiry({
      email,
      first_name,
      last_name,
      reference_id: kratos_identity_id
    });

    const inquiryId = inquiry.id;
    const inquiryAttributes = inquiry.attributes;

    console.log(`Created Persona inquiry: ${inquiryId}`);

    // Store Persona data in Kratos metadata
    await kratosAdmin.patchIdentity({
      id: kratos_identity_id,
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_verification_status',
          value: inquiryAttributes.status || 'initiated'
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_inquiry_id',
          value: inquiryId
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_initiated_at',
          value: new Date().toISOString()
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_inquiry_template',
          value: process.env.PERSONA_TEMPLATE_ID
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_reference_id',
          value: inquiryAttributes['reference-id'] || null
        }
      ]
    });

    // Return verification link or token based on flow type
    const flowData = {
      inquiry_id: inquiryId,
      status: inquiryAttributes.status,
      verification_url: ""
    };

    // For hosted flow, return the inquiry dashboard URL
    if (inquiryAttributes['inquiry-links']?.['hosted-url']) {
      flowData['verification_url'] = inquiryAttributes['inquiry-links']['hosted-url'];
    }

    return res.status(200).json({
      success: true,
      ...flowData
    });

  } catch (error) {
    console.error('Persona initiation error:', error);
    
    try {
      await kratosAdmin.patchIdentity({
        id: req.body.kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/persona_initiation_error',
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

// Verify webhook signature
function verifyPersonaWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Handle Persona webhook
app.post('/webhooks/persona-callback', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-persona-signature'] as string;
    const rawBody = req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);
    
    if (!verifyPersonaWebhook(rawBody, signature, process.env.PERSONA_WEBHOOK_SECRET!)) {
      console.warn('Invalid Persona webhook signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { data: inquiryData } = payload;

    // Only process inquiry-completed events
    if (payload['event-type'] !== 'inquiry.completed') {
      return res.status(200).json({ received: true });
    }

    const inquiryId = inquiryData.id;
    const inquiryAttributes = inquiryData.attributes;
    const status = inquiryAttributes.status; // 'approved', 'declined', 'needs_review'
    const referenceId = inquiryAttributes['reference-id'];

    console.log(`Received inquiry completion: ${inquiryId}, status=${status}`);

    // Respond immediately
    res.status(200).json({ received: true });

    if (!referenceId) {
      console.error('No reference-id (Kratos identity ID) in inquiry');
      return;
    }

    // Retrieve full inquiry details
    const inquiry = await personaClient.getInquiry(inquiryId);

    // Extract verification results
    const verifications = inquiry.relationships?.verifications?.data || [];
    const verificationResults: Record<string, { status?: string; result?: any }> = {};

    for (const verification of verifications as any[]) {
      const v = verification as any;
      verificationResults[v.type] = {
        status: v.attributes?.status,
        result: v.attributes?.result
      };
    }

    // Update Kratos metadata with results
    await kratosAdmin.patchIdentity({
      id: referenceId,
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_verification_status',
          value: status
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_completed_at',
          value: new Date().toISOString()
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_inquiry_status',
          value: status
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/persona_verifications',
          value: JSON.stringify(verificationResults)
        }
      ]
    });

    console.log(`Updated Kratos metadata for ${referenceId}`);

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Don't throw - Persona will retry on non-200 response
  }
});

// Post-login: Validate Persona verification status
app.post('/webhooks/persona-validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      kratos_identity_id,
      persona_inquiry_id,
      persona_verification_status
    } = req.body;

    // If no verification, allow login but flag for verification
    if (!persona_inquiry_id || !persona_verification_status) {
      console.log(`User ${kratos_identity_id} has no Persona verification`);
      return res.status(200).json({ success: true });
    }

    // Check verification status
    if (persona_verification_status === 'approved') {
      // Update last validation timestamp
      await kratosAdmin.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/persona_last_validated_at',
            value: new Date().toISOString()
          }
        ]
      });

      return res.status(200).json({ success: true });
    }

    // If declined, block login
    if (persona_verification_status === 'declined') {
      console.warn(`Blocking login for ${kratos_identity_id} - verification declined`);
      
      return res.status(403).json({
        messages: [{
          instance_ptr: "#/",
          messages: [{
            id: 4000060,
            text: "Identity verification failed. Please contact support.",
            type: "error",
            context: {
              reason: "identity_verification_declined"
            }
          }]
        }]
      });
    }

    // If needs review, allow login with warning
    if (persona_verification_status === 'needs_review') {
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
