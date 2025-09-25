# Deploy to Render using API
# This script creates a new web service on Render

Write-Host "Render Deployment Script" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

# Check if we have a GitHub repo URL
$repoUrl = Read-Host "Enter your GitHub repository URL (e.g., https://github.com/username/cruisemapper-mcp)"

# Get Render API key
Write-Host "`nTo get your Render API key:" -ForegroundColor Yellow
Write-Host "1. Go to https://dashboard.render.com/account/api-keys" -ForegroundColor Yellow
Write-Host "2. Create a new API key" -ForegroundColor Yellow
Write-Host "3. Copy and paste it here" -ForegroundColor Yellow
$apiKey = Read-Host "`nEnter your Render API key" -AsSecureString

# Convert secure string to plain text for API use
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKey)
$renderApiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Service configuration
$serviceName = "cruisemapper-mcp"
$body = @{
    type = "web_service"
    name = $serviceName
    repo = $repoUrl
    branch = "main"
    runtime = "docker"
    region = "oregon"
    plan = "free"
    envVars = @(
        @{
            key = "PORT"
            value = "10000"
        }
    )
    dockerCommand = ""
    healthCheckPath = "/"
} | ConvertTo-Json -Depth 10

# Create the service
Write-Host "`nCreating web service on Render..." -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
        -Method POST `
        -Headers @{
            "Accept" = "application/json"
            "Authorization" = "Bearer $renderApiKey"
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "`nService created successfully!" -ForegroundColor Green
    Write-Host "Service ID: $($response.id)" -ForegroundColor Cyan
    Write-Host "Service URL: https://$serviceName.onrender.com" -ForegroundColor Cyan
    Write-Host "`nDeployment Status: $($response.deploy.status)" -ForegroundColor Yellow
    
    Write-Host "`nMonitor deployment at: https://dashboard.render.com/web/$($response.id)" -ForegroundColor Blue
    
    # Save service info
    $serviceInfo = @{
        serviceId = $response.id
        serviceName = $serviceName
        serviceUrl = "https://$serviceName.onrender.com"
        dashboardUrl = "https://dashboard.render.com/web/$($response.id)"
        createdAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    $serviceInfo | ConvertTo-Json | Out-File -FilePath "render-service-info.json"
    Write-Host "`nService info saved to render-service-info.json" -ForegroundColor Green
    
} catch {
    Write-Host "`nError creating service:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "`nAPI Response:" -ForegroundColor Red
        Write-Host $responseBody -ForegroundColor Red
    }
}

Write-Host "`nDeployment script completed!" -ForegroundColor Green