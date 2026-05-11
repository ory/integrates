import axios from 'axios';
import express from 'express';
import { Configuration, IdentityApi } from '@ory/client';
import { JsonPatchOpEnum } from '@ory/client/api';

interface InstantIDRequest {
  firstName: string;
  lastName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  dateOfBirth: string;  // YYYY-MM-DD
  ssn?: string;
  phone?: string;
}

interface InstantIDResponse {
  verificationIndicator: string;  // "Pass" or "Fail"
  nameAddressSSNSummary: number;  // NAS Index (0-999)
  nameAddressPhoneSummary: number; // NAP Index (0-999)
  comprehensiveVerification: number; // CVI (0-100)
  instantIDVersion: string;
  addressStandardization: {
    standardizedAddress: string;
    city: string;
    state: string;
    zip5: string;
  };
}

class LexisNexisInstantIDClient {
  private username: string;
  private password: string;
  private apiUrl: string;
  private orgId: string;

  constructor(username: string, password: string, apiUrl: string, orgId: string) {
    this.username = username;
    this.password = password;
    this.apiUrl = apiUrl;
    this.orgId = orgId;
  }

  async verifyIdentity(request: InstantIDRequest): Promise<InstantIDResponse> {
    // Create Basic Auth header[267]
    const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    try {
      const response = await axios.post(
        `${this.apiUrl}/instantid`,
        {
          OrgId: this.orgId,
          User: {
            GLBPurpose: '1',  // GLBA purpose code
            DLPurpose: '1'     // DPPA purpose code
          },
          Options: {
            UseOFACList: 'true',
            VerifySSN: request.ssn ? 'true' : 'false'
          },
          SearchBy: {
            Name: {
              First: request.firstName,
              Last: request.lastName
            },
            Address: {
              StreetAddress1: request.streetAddress,
              City: request.city,
              State: request.state,
              Zip5: request.zipCode
            },
            DOB: {
              Year: request.dateOfBirth.split('-')[0],
              Month: request.dateOfBirth.split('-')[1],
              Day: request.dateOfBirth.split('-')[2]
            },
            SSN: request.ssn,
            Phone10: request.phone
          }
        },
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return response.data.Response.Result;
    } catch (error) {
      console.error('LexisNexis InstantID error:', error);
      throw new Error('Identity verification failed');
    }
  }

  // Calculate verification decision based on scores[284]
  isVerified(response: InstantIDResponse): boolean {
    const nasThreshold = parseInt(process.env.INSTANTID_NAS_THRESHOLD || '50');
    const napThreshold = parseInt(process.env.INSTANTID_NAP_THRESHOLD || '50');
    const cviThreshold = parseInt(process.env.INSTANTID_CVI_THRESHOLD || '50');

    // Convert NAS/NAP from 0-999 scale to 0-100 scale
    const nasScore = (response.nameAddressSSNSummary / 999) * 100;
    const napScore = (response.nameAddressPhoneSummary / 999) * 100;
    const cviScore = response.comprehensiveVerification;

    return (
      response.verificationIndicator === 'Pass' &&
      cviScore >= cviThreshold &&
      (nasScore >= nasThreshold || napScore >= napThreshold)
    );
  }
}

const app = express();
app.use(express.json());

const kratosAdmin = new IdentityApi(
  new Configuration({
    basePath: process.env.KRATOS_ADMIN_URL
  })
);

const lexisNexisClient = new LexisNexisInstantIDClient(
  process.env.LEXISNEXIS_USERNAME!,
  process.env.LEXISNEXIS_PASSWORD!,
  process.env.LEXISNEXIS_API_URL!,
  process.env.LEXISNEXIS_ORG_ID!
);

// Post-registration: Verify identity with LexisNexis InstantID[267][284]
app.post('/webhooks/lexisnexis-verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      kratos_identity_id,
      first_name,
      last_name,
      address,
      date_of_birth,
      ssn,
      phone_number
    } = req.body;

    console.log(`Verifying identity for ${kratos_identity_id} with LexisNexis`);

    // Call LexisNexis InstantID[284][286]
    const verificationResponse = await lexisNexisClient.verifyIdentity({
      firstName: first_name,
      lastName: last_name,
      streetAddress: address.street || '',
      city: address.city || '',
      state: address.state || '',
      zipCode: address.postal_code || '',
      dateOfBirth: date_of_birth,
      ssn: ssn,
      phone: phone_number
    });

    const isVerified = lexisNexisClient.isVerified(verificationResponse);
    const verificationStatus = isVerified ? 'verified' : 'failed';

    console.log(`Verification result: ${verificationStatus}`, {
      cvi: verificationResponse.comprehensiveVerification,
      nas: verificationResponse.nameAddressSSNSummary,
      nap: verificationResponse.nameAddressPhoneSummary
    });

    // Store verification results in Kratos metadata
    await kratosAdmin.patchIdentity({
      id: kratos_identity_id,
      jsonPatch: [
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/lexisnexis_verification_status',
          value: verificationStatus
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/lexisnexis_cvi_score',
          value: verificationResponse.comprehensiveVerification
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_public/lexisnexis_verified_at',
          value: new Date().toISOString()
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/lexisnexis_nas_score',
          value: verificationResponse.nameAddressSSNSummary
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/lexisnexis_nap_score',
          value: verificationResponse.nameAddressPhoneSummary
        },
        {
          op: JsonPatchOpEnum.Replace,
          path: '/metadata_admin/lexisnexis_verification_indicator',
          value: verificationResponse.verificationIndicator
        }
      ]
    });

    return res.status(200).json({ 
      success: true,
      verification_status: verificationStatus
    });

  } catch (error) {
    console.error('LexisNexis verification error:', error);
    
    try {
      await kratosAdmin.patchIdentity({
        id: req.body.kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/lexisnexis_verification_error',
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

// Post-login: Validate stored verification status
app.post('/webhooks/lexisnexis-validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      kratos_identity_id,
      lexisnexis_verification_status,
      lexisnexis_cvi_score
    } = req.body;

    // If no verification data, allow login but flag for verification
    if (!lexisnexis_verification_status) {
      console.log(`User ${kratos_identity_id} has no LexisNexis verification - allowing login`);
      return res.status(200).json({ success: true });
    }

    // Check if verification passed
    if (lexisnexis_verification_status === 'verified') {
      // Update last validation timestamp
      await kratosAdmin.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/lexisnexis_last_validated_at',
            value: new Date().toISOString()
          }
        ]
      });

      return res.status(200).json({ success: true });
    }

    // If verification failed, block login
    if (lexisnexis_verification_status === 'failed') {
      console.warn(`Blocking login for user ${kratos_identity_id} - verification failed (CVI: ${lexisnexis_cvi_score})`);
      
      return res.status(403).json({
        messages: [{
          instance_ptr: "#/",
          messages: [{
            id: 4000040,
            text: "Identity verification failed. Please contact support to verify your account.",
            type: "error",
            context: {
              reason: "identity_verification_failed",
              cvi_score: lexisnexis_cvi_score
            }
          }]
        }]
      });
    }

    // Unknown status - allow login but log warning
    console.warn(`Unknown verification status: ${lexisnexis_verification_status}`);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Validation error:', error);
    return res.status(200).json({ success: true });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Webhook server running on port ${process.env.PORT || 3000}`);
});
