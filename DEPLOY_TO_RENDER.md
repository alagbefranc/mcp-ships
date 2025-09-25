# Deploy CruiseMapper MCP Server to Render

Follow these steps to deploy your MCP server to Render:

## Step 1: Push Code to GitHub

1. Create a new repository on GitHub:
   - Go to https://github.com/new
   - Name it: `cruisemapper-mcp`
   - Make it public or private
   - Don't initialize with README (we already have one)

2. Push your local code to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/cruisemapper-mcp.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Render

1. Go to https://dashboard.render.com/

2. Click "New +" and select "Web Service"

3. Connect your GitHub account if not already connected

4. Select your `cruisemapper-mcp` repository

5. Configure the service:
   - **Name**: cruisemapper-mcp
   - **Region**: Oregon (US West)
   - **Runtime**: Docker
   - **Plan**: Free

6. Click "Create Web Service"

7. Render will automatically deploy your service

## Step 3: Get Your Service URL

After deployment completes (usually 5-10 minutes):

1. Your service URL will be: `https://cruisemapper-mcp.onrender.com`

2. Test the deployment:
   - Health check: https://cruisemapper-mcp.onrender.com/
   - Tools list: https://cruisemapper-mcp.onrender.com/tools

## Step 4: Add to Telnyx Assistant

1. Go to Telnyx Portal: https://portal.telnyx.com

2. Navigate to AI Assistants

3. Select your assistant (assistant-43f014d5-237e-431d-9f76-648ecf0de13f)

4. Go to "MCP Servers" or "Integrations" section

5. Add MCP Server:
   - **Name**: CruiseMapper MCP
   - **URL**: https://cruisemapper-mcp.onrender.com/mcp
   - **Method**: POST
   - **Headers**: Content-Type: application/json

6. Save and test the connection

## Step 5: Test the Integration

Once connected, your assistant will have access to these tools:

- `list_all_ships` - List all cruise ships
- `search_ship_schedule` - Search ship schedules
- `get_ship_full_details` - Get ship details
- `get_port_schedule` - Check port schedules
- `search_cruise_by_date` - Search by date
- `get_cruise_lines` - List cruise lines

Test with questions like:
- "List all Royal Caribbean ships"
- "What's the schedule for Liberty of the Seas?"
- "Show me cruises departing in October 2025"
- "What ships are arriving in Miami port?"

## Monitoring Your Service

- View logs: https://dashboard.render.com/web/[your-service-id]/logs
- Check metrics: https://dashboard.render.com/web/[your-service-id]/metrics
- Service health: Visit your service URL

## Troubleshooting

If deployment fails:
1. Check build logs in Render dashboard
2. Ensure Dockerfile is correct
3. Verify all files are committed to Git

If MCP connection fails:
1. Test the health endpoint
2. Check Render logs for errors
3. Verify the /mcp endpoint with curl:
```bash
curl -X POST https://cruisemapper-mcp.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list","params":{},"id":1}'
```

## Notes

- The free tier may sleep after inactivity (first request will be slow)
- Logs are retained for 7 days on free tier
- The service will automatically redeploy when you push to GitHub

Need help? Check the Render logs or test endpoints!