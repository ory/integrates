const express = require("express");
const axios = require("axios");
const app = express();
require("dotenv").config();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.use(express.json());

// Find contact in Pipedrive
async function findPipedriveContact(email, oryId = null) {
  try {
    // Search by email first
    const searchResponse = await axios.get(
      `https://api.pipedrive.com/v1/persons/search?term=${email}&api_token=${process.env.PIPEDRIVE_API_TOKEN}`
    );

    if (searchResponse.data.data?.items?.length > 0) {
      return searchResponse.data.data.items[0].item;
    }

    // Search by custom Ory ID field if email search fails
    if (oryId) {
      const customFieldSearch = await axios.get(
        `https://api.pipedrive.com/v1/persons?api_token=${process.env.PIPEDRIVE_API_TOKEN}&filter_id=${CUSTOM_FILTER_ID}`
      );
      // Implementation depends on your custom field setup
    }

    return null;
  } catch (error) {
    console.error("Error finding contact:", error);
    return null;
  }
}

// Create activity in Pipedrive
async function createPipedriveActivity(activityData) {
  try {
    const response = await axios.post(
      `https://api.pipedrive.com/v1/activities?api_token=${process.env.PIPEDRIVE_API_TOKEN}`,
      activityData
    );
    return response.data;
  } catch (error) {
    console.error("Error creating activity:", error);
    throw error;
  }
}

// Update person's last login information
async function updateLastLoginInfo(personId, loginData) {
  try {
    await axios.put(
      `https://api.pipedrive.com/v1/persons/${personId}?api_token=${process.env.PIPEDRIVE_API_TOKEN}`,
      loginData
    );
  } catch (error) {
    console.error("Error updating login info:", error);
  }
}

// Parse user agent for device information
function parseUserAgent(userAgent) {
  // Simple parsing - consider using a library like 'ua-parser-js'
  if (userAgent.includes("Mobile")) return "Mobile Device";
  if (userAgent.includes("Chrome")) return "Chrome Browser";
  if (userAgent.includes("Firefox")) return "Firefox Browser";
  if (userAgent.includes("Safari")) return "Safari Browser";
  return "Unknown Device";
}

// Webhook endpoint for Ory users post registration
app.post("/pipedrive/sync-user", async (req, res) => {
  try {
    const { id, traits, created_at } = req.body.ctx;
    console.log("Received user data from Ory:", id, traits, created_at);

    if (!id || !traits || !created_at) {
      return res.status(400).json({ error: "Missing required user fields" });
    }

    // Create person in Pipedrive
    const pipedriveResponse = await axios.post(
      `https://api.pipedrive.com/v1/persons?api_token=${process.env.PIPEDRIVE_API_TOKEN}`,
      {
        name: traits.name || traits.email || "Unknown",
        email: [{ value: traits.email, primary: true }],
        custom_fields: {
          // Store Ory identity ID for reference
          ory_identity_id: id,
        },
      }
    );

    console.log("User synced to Pipedrive");
    res.status(200).json({ success: true });
  } catch (error) {
    // console.error('Failed to sync user to Pipedrive:', error);
    res.status(500).json({ error: "Sync failed" });
  }
});

// Track successful logins
app.post("/pipedrive/track-login-activity", async (req, res) => {
  try {
    const {
      id,
      traits: { email, name },
      login_time,
      ip_address,
      user_agent,
      login_method,
      session_id,
    } = req.body;

    // Find Pipedrive person by email or Ory ID
    const person = await findPipedriveContact(email, id);
    console.log("Found Pipedrive person:", person);

    if (person) {
      // Create login activity in Pipedrive
      await createPipedriveActivity({
        person_id: person.id,
        subject: `User Login - ${name??email}`,
        type: "task", // or custom activity type
        note: `
Login Details:
- Time: ${login_time}
- IP Address: ${ip_address}
- Device: ${parseUserAgent(user_agent)}
- Method: ${login_method}
- Session ID: ${session_id.substring(0, 8)}...
        `,
        done: 1, // Mark as completed
        due_date: new Date().toISOString().split("T")[0],
      });

      // Update person's custom fields with last login info
      await updateLastLoginInfo(person.id, {
        last_login_date: login_time,
        last_login_ip: ip_address,
        login_count: person.login_count ? person.login_count + 1 : 1,
      });
    }

    console.log("Login activity tracked for:", email);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to track login activity:", error);
    res.status(500).json({ error: "Activity tracking failed" });
  }
});
