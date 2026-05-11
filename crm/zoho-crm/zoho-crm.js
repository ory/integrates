// Express server to receive Ory webhooks and sync users to Zoho CRM

const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Load from .env
const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_API_BASE_URL = 'https://www.zohoapis.in/crm/v2',
  ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in',
  ORY_WEBHOOK_SECRET,
  PORT = 3000,
} = process.env;

// Token cache to avoid excessive token requests
let tokenCache = {
  accessToken: null,
  expiresAt: null,
};

// Verify Ory webhook signature (HMAC SHA-256)
function verifyOrySignature(req, res, next) {
  if (!ORY_WEBHOOK_SECRET) {
    console.warn('Warning: ORY_WEBHOOK_SECRET not set, skipping signature verification');
    return next();
  }

  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    return res.status(400).send('Missing webhook signature');
  }

  const payload = JSON.stringify(req.body);
  const hash = require('crypto')
    .createHmac('sha256', ORY_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (hash !== signature) {
    return res.status(401).send('Invalid webhook signature');
  }

  next();
}

// Obtain Zoho access token using refresh token (with caching)
async function getZohoAccessToken() {
  // Return cached token if still valid
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now()) {
    console.log('Using cached access token');
    return tokenCache.accessToken;
  }

  if (!ZOHO_REFRESH_TOKEN) {
    throw new Error('ZOHO_REFRESH_TOKEN not set in environment variables');
  }

  try {
    const params = new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });

    const resp = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, params);

    const { access_token, expires_in } = resp.data;

    // Cache token (expires_in is typically 3600 seconds, cache for 3500 seconds)
    tokenCache.accessToken = access_token;
    tokenCache.expiresAt = Date.now() + (expires_in - 100) * 1000;

    console.log('✅ Obtained new Zoho access token');
    console.log(`Access Token: ${access_token}`);
    console.log(`Access Token Expires In: ${expires_in} seconds`);
    return access_token;
  } catch (err) {
    console.error('Error obtaining access token:', err.response?.data || err.message);
    throw err;
  }
}

// Upsert a contact in Zoho CRM by Email
async function upsertZohoContact(accessToken, traits) {
  const email = traits.email;
  const firstName = traits.firstName || traits.given_name || 'Unknown';
  const lastName = traits.lastName || traits.family_name || 'User';

  if (!email) {
    throw new Error('Email is required to sync contact to Zoho CRM');
  }

  const payload = {
    data: [
      {
        Email: email,
        First_Name: firstName,
        Last_Name: lastName,
      },
    ],
    duplicate_check_fields: ['Email'],
  };

  try {
    const response = await axios.post(
      `${ZOHO_API_BASE_URL}/Contacts/upsert`,
      payload,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ Contact upserted for email: ${email}`);
    return response.data;
  } catch (err) {
    console.error('Error upserting contact:', err.response?.data || err.message);
    throw err;
  }
}

// OAuth Authorization endpoint - Step 1
app.get('/auth', (req, res) => {
  const redirectUri = `http://localhost:${PORT}/callback`;
  const scope = 'ZohoCRM.modules.ALL';

  const authUrl = `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?client_id=${ZOHO_CLIENT_ID}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline`;

  res.send(`
    <html>
      <head><title>Zoho CRM Authorization</title></head>
      <body>
        <h1>Authorize Zoho CRM</h1>
        <p>Click the link below to connect your Zoho CRM account:</p>
        <a href="${authUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">
          Authorize with Zoho CRM
        </a>
      </body>
    </html>
  `);
});

// OAuth Callback endpoint - Step 2 (receives authorization code)
app.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const location = req.query.location;

    if (!code) {
      return res.status(400).send('❌ No authorization code received from Zoho');
    }

    console.log('🔄 Authorization code received:', code);
    console.log('📍 Location:', location);

    // Determine correct Zoho accounts URL based on location
    let accountsUrl = ZOHO_ACCOUNTS_URL;
    if (location === 'in') {
      accountsUrl = 'https://accounts.zoho.in';
    } else if (location === 'us') {
      accountsUrl = 'https://accounts.zoho.com';
    } else if (location === 'eu') {
      accountsUrl = 'https://accounts.zoho.eu';
    }

    const redirectUri = `http://localhost:${PORT}/callback`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code: code,
    });

    const tokenResponse = await axios.post(`${accountsUrl}/oauth/v2/token`, params);

    const { access_token, refresh_token, api_domain, expires_in } = tokenResponse.data;

    // Cache the token
    tokenCache.accessToken = access_token;
    tokenCache.expiresAt = Date.now() + (expires_in - 100) * 1000;

    console.log('\n✅ OAuth Authorization Successful!\n');
    console.log('Save these to your .env file:');
    console.log(`ZOHO_REFRESH_TOKEN=${refresh_token}`);
    console.log(`ZOHO_API_BASE_URL=${api_domain}/crm/v2`);
    console.log(`ZOHO_ACCOUNTS_URL=${accountsUrl}`);

    res.send(`
      <html>
        <head><title>Authorization Successful</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>✅ Authorization Successful!</h1>
          <p><strong>Refresh Token:</strong></p>
          <code style="background: #f0f0f0; padding: 10px; display: block; word-break: break-all;">
            ${refresh_token}
          </code>
          <p><strong>API Domain:</strong> ${api_domain}</p>
          <p><strong>Accounts URL:</strong> ${accountsUrl}</p>
          <hr />
          <h3>Next Steps:</h3>
          <ol>
            <li>Copy the refresh token above</li>
            <li>Add it to your .env file as: <code>ZOHO_REFRESH_TOKEN=${refresh_token}</code></li>
            <li>Restart your application</li>
            <li>Your integration will now sync users from Ory to Zoho CRM</li>
          </ol>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Error during OAuth callback:', err.response?.data || err.message);
    res.status(500).send(`
      <html>
        <body>
          <h1>❌ Authorization Failed</h1>
          <p>Error: ${err.response?.data?.error_description || err.message}</p>
          <p><a href="/auth">Try again</a></p>
        </body>
      </html>
    `);
  }
});

// Webhook endpoint to receive Ory identity events
app.post('/zoho-crm/sync-user', async (req, res) => {
  try {
    const event = req.body;
    console.log('🔔 Received webhook event:', event);

    // Extract identity from different possible Ory webhook formats
    const identity = event.identity || event.ctx?.identity;

    if (!identity || !identity.traits) {
      console.warn('⚠️ Webhook received without identity traits:', event);
      return res.status(400).json({ error: 'No identity traits in webhook' });
    }

    const traits = identity.traits;
    console.log(`📨 Syncing user: ${traits.email}`);

    // Get fresh access token
    const accessToken = await getZohoAccessToken();

    // Upsert contact to Zoho CRM
    await upsertZohoContact(accessToken, traits);

    res.status(200).json({
      success: true,
      message: 'User synced successfully to Zoho CRM',
      email: traits.email,
    });
  } catch (err) {
    console.error('❌ Sync error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Error syncing to Zoho CRM',
      details: err.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    zohoConfigured: !!ZOHO_REFRESH_TOKEN,
  };
  res.json(status);
});

// Start server
const PORT_NUM = parseInt(PORT);
app.listen(PORT_NUM, () => {
  console.log(`\n🚀 Server listening on port ${PORT_NUM}`);
  console.log(`📍 OAuth Authorization URL: http://localhost:${PORT_NUM}/auth`);
  console.log(`🔄 Ory Webhook URL: http://localhost:${PORT_NUM}/zoho-crm/sync-user`);
  console.log(`❤️  Health Check: http://localhost:${PORT_NUM}/health\n`);

  if (!ZOHO_REFRESH_TOKEN) {
    console.warn('⚠️  WARNING: ZOHO_REFRESH_TOKEN not set. Visit http://localhost:${PORT_NUM}/auth to authorize.\n');
  }
});
