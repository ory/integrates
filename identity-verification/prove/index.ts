import express from 'express';
import { Proveapi } from '@prove-identity/prove-api';
import { Configuration, IdentityApi, JsonPatchOpEnum } from '@ory/client';
import "dotenv/config";

const app = express();
app.use(express.json());

const proveSDK = new Proveapi({
  serverURL: "https://platform.uat.proveapis.com", 
  security: {
    clientID: process.env.PROVE_CLIENT_ID,
    clientSecret: process.env.PROVE_CLIENT_SECRET
  }
});

const kratosAdmin = new IdentityApi(
  new Configuration({
    basePath: process.env.KRATOS_ADMIN_URL,
    accessToken: process.env.ORY_API_KEY,
  })
);

app.post('/webhook', (req, res) => {
  // Verify the x-prove-signature header
  const signature = req.headers['x-prove-signature'];
  if (signature !== 'whsec_your_secret') {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Token verification logic here
  res.status(200).json({ message: "Webhook configured" });
});


app.post('/webhooks/prove-lookup', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { phone_number, flow_id } = req.body;

    console.log(`Looking up Prove identity for ${phone_number}`);

    // Call the v3GetIdentitiesByPhoneNumber method
    const lookupResponse = await proveSDK.identity.v3GetIdentitiesByPhoneNumber(phone_number);

    // CORRECTED: The response may be directly the array or wrapped
    // Log the full response to debug structure
    console.log('Prove lookup response:', JSON.stringify(lookupResponse, null, 2));

    // Try multiple ways to access the identities
    let identities: any[] | null = null;

    // Method 1: Direct array (if SDK returns array directly)
    if (Array.isArray(lookupResponse)) {
      identities = lookupResponse;
    }
    // Method 2: Nested in response property
    else if (lookupResponse && Array.isArray(lookupResponse.v3GetIdentitiesByPhoneNumberResponse?.items)) {
      identities = lookupResponse.v3GetIdentitiesByPhoneNumberResponse?.items;
    }

    if (!identities || identities.length === 0) {
      console.log(`No Prove identity found for ${phone_number}`);
      return res.status(200).json({
        identity: {
          metadata_public: {
            prove_identity_status: 'not_found',
            prove_lookup_timestamp: new Date().toISOString()
          }
        }
      });
    }

    // Get the first identity
    const identity = identities[0];
    const identityId = identity.identityId || identity.identity_id;

    console.log(`Found Prove identity: ${identityId}`);

    // Get full identity details
    const identityDetailsResponse = await proveSDK.identity.v3GetIdentity(identityId);

    console.log('Prove identity details response:', JSON.stringify(identityDetailsResponse, null, 2));

    // Extract details from response
    let identityDetails: any;

    if (identityDetailsResponse && identityDetailsResponse.v3GetIdentityResponse) {
      identityDetails = identityDetailsResponse.v3GetIdentityResponse;
    } else if (identityDetailsResponse && identityDetailsResponse.httpMeta.response.ok) {
      identityDetails = identityDetailsResponse;
    } else {
      identityDetails = identityDetailsResponse;
    }

    if (!identityDetails || !identityDetails.success) {
      console.error(`Failed to retrieve full details for identity ${identityId}`);
      return res.status(200).json({
        identity: {
          metadata_public: {
            prove_identity_status: 'lookup_error',
            prove_error_message: 'Could not retrieve identity details'
          }
        }
      });
    }

    console.log(`Retrieved full identity details for ${phone_number}`);

    // Build the response with available data
    return res.status(200).json({
      identity: {
        traits: {
          phone_number: identityDetails.phoneNumber || phone_number
        },
        metadata_public: {
          prove_identity_status: 'verified',
          prove_identity_id: identityDetails.identityId,
          prove_phone_number: identityDetails.phoneNumber,
          prove_carrier: identityDetails.carrier,
          prove_line_type: identityDetails.lineType,
          prove_verification_result: identity.verificationResult || 'verified',
          prove_is_active: identityDetails.active,
          prove_lookup_timestamp: new Date().toISOString()
        },
        metadata_admin: {
          prove_correlation_id: identity.correlationId,
          prove_client_customer_id: identity.clientCustomerId,
          prove_country_code: identityDetails.countryCode
        }
      }
    });

  } catch (error) {
    console.error('Prove lookup error:', error);

    return res.status(200).json({
      identity: {
        metadata_public: {
          prove_identity_status: 'lookup_error',
          prove_error_message: error
        }
      }
    });
  }
});

app.post('/webhooks/prove-enroll', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      kratos_identity_id,
      phone_number,
      first_name,
      last_name,
      email,
      address,
      date_of_birth
    } = req.body;

    console.log(`Enrolling user ${kratos_identity_id} in Prove Identity Manager`);

    const enrollResponse = await proveSDK.identity.v3EnrollIdentity({
      phoneNumber: phone_number,
      clientCustomerId: kratos_identity_id,
    });

    console.log('Prove enroll response:', JSON.stringify(enrollResponse, null, 2));

    // Extract the actual response data
    let enrollData: any;

    if (enrollResponse && enrollResponse.v3EnrollIdentityResponse) {
      enrollData = enrollResponse.v3EnrollIdentityResponse;
    } else if (enrollResponse && enrollResponse.httpMeta.response.ok !== undefined) {
      enrollData = enrollResponse;
    } else {
      enrollData = enrollResponse;
    }

    if (enrollData?.success) {
      console.log(`Successfully enrolled in Prove Identity Manager:`, {
        identityId: enrollData.identityId,
        verificationResult: enrollData.verificationResult
      });

      await kratosAdmin.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_identity_enrolled',
            value: true
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_identity_id',
            value: enrollData.identityId
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_verification_result',
            value: enrollData.verificationResult
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_enrollment_timestamp',
            value: new Date().toISOString()
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/prove_correlation_id',
            value: enrollData.correlationId
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/prove_client_customer_id',
            value: enrollData.clientCustomerId
          }
        ]
      });

      return res.status(200).json({
        success: true,
        prove_identity_id: enrollData.identityId
      });
    } else {
      throw new Error(`Enrollment failed: ${enrollData?.verificationResult || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Prove enrollment error:', error);

    try {
      await kratosAdmin.patchIdentity({
        id: req.body.kratos_identity_id,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/prove_enrollment_error',
            value: error
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/prove_enrollment_attempted',
            value: new Date().toISOString()
          }
        ]
      });
    } catch (updateError) {
      console.error('Failed to update identity with error:', updateError);
    }

    return res.status(200).json({
      success: false,
      error: error
    });
  }
});

app.post('/webhooks/prove-validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      kratos_identity_id,
      phone_number,
      prove_identity_id
    } = req.body;

    if (!prove_identity_id) {
      console.log(`User ${kratos_identity_id} has no Prove identity - allowing login`);
      return res.status(200).json({
        success: true,
        identity: {
          metadata_public: {
            prove_validation_status: 'not_enrolled',
            prove_last_validation: new Date().toISOString()
          }
        }
      });
    }

    console.log(`Validating Prove identity for user ${kratos_identity_id}`);

    const identityResponse = await proveSDK.identity.v3GetIdentity(prove_identity_id);

    console.log('Prove validate response:', JSON.stringify(identityResponse, null, 2));

    // Extract response data
    let identityData: any;

    if (identityResponse && identityResponse.v3GetIdentityResponse) {
      identityData = identityResponse.v3GetIdentityResponse;
    } else if (identityResponse && identityResponse.httpMeta.response.ok !== undefined) {
      identityData = identityResponse;
    } else {
      identityData = identityResponse;
    }

    if (!identityData?.success) {
      console.error(`Failed to retrieve Prove identity ${prove_identity_id}`);

      return res.status(200).json({
        identity: {
          metadata_public: {
            prove_validation_status: 'retrieval_failed',
            prove_last_validation: new Date().toISOString()
          },
          metadata_admin: {
            prove_validation_error: 'Failed to retrieve identity from Prove'
          }
        }
      });
    }

    const verificationResult = identityData.verificationResult;
    const phoneNumber = identityData.phoneNumber;

    console.log(`Prove identity validation result:`, {
      verificationResult,
      phoneNumber
    });

    if (phoneNumber !== phone_number) {
      console.warn(`Phone number mismatch: ${phoneNumber} vs ${phone_number}`);

      return res.status(403).json({
        messages: [{
          instance_ptr: "#/",
          messages: [{
            id: 4000020,
            text: "Your phone number has changed. Please update your account information.",
            type: "error",
            context: {
              reason: "phone_number_mismatch",
              prove_phone: phoneNumber,
              registered_phone: phone_number
            }
          }]
        }]
      });
    }

    const updatedMetadata = {
      identity: {
        metadata_public: {
          prove_validation_status: 'verified',
          prove_verification_result: verificationResult,
          prove_last_validation: new Date().toISOString(),
          prove_phone_verified: phoneNumber
        },
        metadata_admin: {
          prove_correlation_id: identityData.correlationId
        }
      }
    };

    await kratosAdmin.patchIdentity({
      id: kratos_identity_id,

       jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_validation_status',
            value: updatedMetadata.identity.metadata_public.prove_validation_status
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_verification_result',
            value: updatedMetadata.identity.metadata_public.prove_verification_result
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_last_validation',
            value: updatedMetadata.identity.metadata_public.prove_last_validation
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_public/prove_phone_verified',
            value:  updatedMetadata.identity.metadata_public.prove_phone_verified
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: '/metadata_admin/prove_correlation_id',
            value: updatedMetadata.identity.metadata_admin.prove_correlation_id
          }
        ]
    });

    console.log(`Successfully validated Prove identity for user ${kratos_identity_id}`);
    return res.status(200).json(updatedMetadata);

  } catch (error) {
    console.error('Prove validation error:', error);

    return res.status(200).json({
      identity: {
        metadata_public: {
          prove_validation_status: 'validation_error',
          prove_last_validation: new Date().toISOString()
        },
        metadata_admin: {
          prove_validation_error: error
        }
      }
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Webhook server running on port ${process.env.PORT || 3000}`);
});
