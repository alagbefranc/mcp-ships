# 🚀 CruiseMapper MCP Server Deployment Guide

## Quick Deploy Options

### 1. 🌐 **Render.com (Recommended)**
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/alagbefranc/mcp-ships)

**Steps:**
1. Click the "Deploy to Render" button above
2. Connect your GitHub account
3. Select the `alagbefranc/mcp-ships` repository
4. Choose "Web Service"
5. Set these environment variables:
   - `NODE_ENV=production`
   - `PORT=8080`
6. Deploy!

### 2. 🐳 **Docker Deployment**

**Local Docker:**
```bash
# Build the image
docker build -f fixed-Dockerfile -t cruisemapper-mcp .

# Run the container
docker run -p 8080:8080 -e NODE_ENV=production cruisemapper-mcp
```

**Docker Compose:**
```yaml
# docker-compose.yml
version: '3.8'
services:
  cruisemapper-mcp:
    build:
      context: .
      dockerfile: fixed-Dockerfile
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    restart: unless-stopped
```

### 3. ☁️ **Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### 4. 🔵 **DigitalOcean App Platform**
1. Go to [DigitalOcean Apps](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Choose "GitHub" and select `alagbefranc/mcp-ships`
4. Configure:
   - Build Command: `npm install`
   - Run Command: `node fixed-web-server.js`
   - Port: `8080`
5. Deploy!

### 5. 🟢 **Heroku**
```bash
# Install Heroku CLI and login
heroku login

# Create app
heroku create your-app-name

# Add Heroku Playwright buildpack
heroku buildpacks:add https://github.com/mxschmitt/heroku-playwright-buildpack.git
heroku buildpacks:add heroku/nodejs

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright

# Deploy
git push heroku main
```

## 🔧 Environment Variables

Set these environment variables for all deployments:

```env
NODE_ENV=production
PORT=8080
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

## 🧪 Testing Your Deployment

Once deployed, test your endpoints:

```bash
# Check server status
curl https://your-deployment-url.com/

# Test MCP endpoint
curl -X POST https://your-deployment-url.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"list_all_ships","limit":3,"id":123}'

# Test specific ship
curl -X POST https://your-deployment-url.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"get_ship_full_details","ship_name":"MSC Seascape","id":124}'
```

## 🔗 Integration with Telnyx

After deployment, configure your Telnyx AI Assistant:

1. Go to your Telnyx AI Assistant dashboard
2. Add the MCP endpoint: `https://your-deployment-url.com/mcp`
3. Test with: `{"method":"list_all_ships","limit":5,"id":1}`

## 📊 Monitoring

Your deployment will include:
- ✅ Health check endpoint at `/`
- ✅ Debug endpoint at `/debug`
- ✅ MCP endpoint at `/mcp`
- ✅ Automatic error handling
- ✅ Request logging

## 🛠️ Troubleshooting

If you encounter issues:

1. **Check logs** in your deployment platform
2. **Verify environment variables** are set correctly
3. **Test endpoints** using curl or Postman
4. **Check Playwright installation** - browsers should install automatically

## 🎯 Production Ready

Your server includes:
- ✅ All three critical issues fixed
- ✅ Enhanced Playwright integration
- ✅ Comprehensive ship validation
- ✅ Robust error handling
- ✅ Security improvements
- ✅ Docker optimization
- ✅ Telnyx webhook compatibility

**Happy Sailing! 🚢**