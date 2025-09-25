# Quick Deploy to Render

Since you can login to Render, here's the fastest way to deploy:

## Option 1: Deploy via Render Dashboard (Recommended)

1. **First, push your code to GitHub:**
   ```bash
   # Create a new repo on GitHub first at: https://github.com/new
   # Then run these commands:
   git remote add origin https://github.com/YOUR_USERNAME/cruisemapper-mcp.git
   git branch -M main
   git push -u origin main
   ```

2. **Deploy on Render:**
   - Login to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect GitHub (if not already connected)
   - Select your `cruisemapper-mcp` repository
   - Fill in:
     - **Name**: cruisemapper-mcp
     - **Runtime**: Docker (it will auto-detect)
     - **Instance Type**: Free
   - Click "Create Web Service"

## Option 2: Deploy using Render Blueprint

1. The `render.yaml` file in your project already contains all deployment settings
2. After pushing to GitHub, go to https://dashboard.render.com/blueprints
3. Click "New Blueprint Instance"
4. Select your repository
5. Render will automatically use the `render.yaml` configuration

## Option 3: Use cURL to Deploy via API

1. Get your Render API key from: https://dashboard.render.com/account/api-keys

2. Run this command (replace YOUR_API_KEY and YOUR_GITHUB_REPO_URL):
   ```bash
   curl -X POST https://api.render.com/v1/services \
     -H "Accept: application/json" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "type": "web_service",
       "name": "cruisemapper-mcp",
       "repo": "YOUR_GITHUB_REPO_URL",
       "branch": "main",
       "runtime": "docker",
       "region": "oregon",
       "plan": "free",
       "envVars": [{"key": "PORT", "value": "10000"}],
       "healthCheckPath": "/"
     }'
   ```

## After Deployment

Your service will be available at: `https://cruisemapper-mcp.onrender.com`

Test endpoints:
- Health check: https://cruisemapper-mcp.onrender.com/
- List tools: https://cruisemapper-mcp.onrender.com/tools

## Add to Telnyx Assistant

Once deployed, add your MCP server to Telnyx:
1. Go to your assistant settings
2. Add webhook tool with URL: `https://cruisemapper-mcp.onrender.com/mcp`
3. Method: POST
4. Headers: Content-Type: application/json