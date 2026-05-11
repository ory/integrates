# Pipedrive Integration

This document outlines how to integrate Ory with Pipedrive CRM.

## 1. Basic Use Case: User Sync from Ory to Pipedrive

This integration enables automatic syncing of users from Ory to Pipedrive CRM. When a user registers or updates their profile in your Ory-powered application, a webhook is triggered to create or update a contact in Pipedrive.

### How It Works

1. **User registers or updates profile** in Ory.
2. **Ory triggers a webhook** to your handler endpoint.
3. **Webhook handler** receives user data and calls Pipedrive API.
4. **Pipedrive creates or updates** the contact/lead.

### Demo

See [`basic_user_sync_demo.mov`](./assets/basic_user_sync_demo.mov) for a walkthrough of the basic user sync flow.


### Steps:

1. **Set Up Pipedrive**:
   - Create a Pipedrive account if you don't have one.
   - Obtain your Pipedrive API token from the settings.

2. **Create Webhook Handler**:
   - Use the provided `pipedrive.js` Express server code.
   - Set your Pipedrive API token in the environment variable `PIPEDRIVE_API_TOKEN`.
   - Deploy the server to a platform accessible by Ory (e.g., Heroku, Vercel) or use ngrok.

3. **Configure Ory Webhook**:
   - In your Ory project, navigate to the Webhooks section.
   - Add a new webhook with the URL of your deployed handler (e.g., `https://yourdomain.com/pipedrive/sync-user`).
   - Set the webhook to trigger on user registration and profile updates.

4. **Test the Integration**:
   - Register a new user or update an existing user's profile in your Ory application.
   - Verify that the user appears in your Pipedrive contacts.


### Example Ory webhook action body:
```js
function(ctx) { 
    ctx: ctx.identity
}
```

### Requirements

- Ory configured to send webhooks after registration/update
- Pipedrive API token set as environment variable
- Webhook handler endpoint accessible to Ory


## 2. Basic Use Case: Track Login Activity in Pipedrive

This integration tracks user login activity from Ory and logs it as activities in Pipedrive CRM. Each time a user logs in, a webhook is triggered to create a login activity associated with the corresponding contact in Pipedrive.

### How It Works
1. **User logs in** to your Ory-powered application.
2. **Ory triggers a webhook** to your handler endpoint.
3. **Webhook handler** receives login data and calls Pipedrive API.
4. **Pipedrive creates a login activity** associated with the user.
5. **Activity appears** in the user's timeline in Pipedrive.

### Demo
See [`login_activity_demo.mov`](./assets/login_activity_demo.mov) for a walkthrough of the login activity tracking flow.

### Steps:
1. **Set Up Pipedrive**:
   - Ensure you have a Pipedrive account and obtain your API token.
   - Make sure your Pipedrive account has the necessary permissions to create activities.

2. **Create Webhook Handler**:
    - Use the provided `pipedrive.js` Express server code.
    - Set your Pipedrive API token in the environment variable `PIPEDRIVE_API_TOKEN`.
    - Deploy the server to a platform accessible by Ory (e.g., Heroku, Vercel) or use ngrok.

3. **Configure Ory Webhook**:
    - In your Ory project, navigate to the Webhooks section.
    - Add a new webhook with the URL of your deployed handler (e.g., `https://yourdomain.com/pipedrive/track-login-activity`).
    - Set the webhook to trigger on user login events.

4. **Test the Integration**:
    - Log in as a user in your Ory application.
    - Verify that a login activity is created in Pipedrive associated with the user.
  

### Example Ory webhook action body:
    ```js
    function(ctx) { 
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    login_time: ctx.session.authenticated_at,
    ip_address: ctx.request_headers["True-Client-Ip"],
    user_agent: ctx.request_headers["User-Agent"],
    login_method: ctx.session.authentication_methods,
    session_id: ctx.session.id
}
    ```
