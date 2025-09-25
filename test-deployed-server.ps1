#!/usr/bin/env pwsh
# Test script for deployed CruiseMapper MCP server

$baseUrl = "https://mcp-ships.onrender.com"
$headers = @{"Content-Type" = "application/json"}

Write-Host "Testing CruiseMapper MCP Server Deployment" -ForegroundColor Cyan
Write-Host "=" * 50

# Test 1: Health Check
Write-Host "`nTest 1: Basic Health Check" -ForegroundColor Green
try {
    $healthResponse = Invoke-RestMethod -Uri "$baseUrl/" -Method GET -TimeoutSec 15
    Write-Host "Status: $($healthResponse.status)" -ForegroundColor Green
    Write-Host "Service: $($healthResponse.service)" -ForegroundColor Green  
    Write-Host "Version: $($healthResponse.version)" -ForegroundColor Green
} catch {
    Write-Host "FAILED: Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Get Cruise Lines (Working endpoint)
Write-Host "`nTest 2: Get Cruise Lines" -ForegroundColor Green
try {
    $cruiseResponse = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method POST -Headers $headers -Body '{"method":"get_cruise_lines","id":1}' -TimeoutSec 30
    Write-Host "SUCCESS: Cruise lines endpoint works: $($cruiseResponse.result.content.Count) cruise lines found" -ForegroundColor Green
} catch {
    Write-Host "FAILED: Cruise lines test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: List All Ships (Fixed functionality)
Write-Host "`nTest 3: List All Ships (Primary Fix)" -ForegroundColor Yellow
try {
    $shipsResponse = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method POST -Headers $headers -Body '{"method":"list_all_ships","limit":5,"id":2}' -TimeoutSec 45
    if ($shipsResponse.result.content.Count -gt 0) {
        Write-Host "SUCCESS: List ships working: $($shipsResponse.result.content.Count) ships found" -ForegroundColor Green
        $shipsResponse.result.content | ForEach-Object { Write-Host "  - $($_.name)" }
    } else {
        Write-Host "WARNING: List ships returns empty result" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAILED: List ships failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Ship Details (Fixed functionality)  
Write-Host "`nTest 4: Ship Details (Primary Fix)" -ForegroundColor Yellow
try {
    $detailsResponse = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method POST -Headers $headers -Body '{"method":"get_ship_full_details","ship_name":"MSC Seascape","id":3}' -TimeoutSec 60
    Write-Host "SUCCESS: Ship details working for MSC Seascape" -ForegroundColor Green
    Write-Host "Ship Name: $($detailsResponse.result.content.name)"
} catch {
    Write-Host "FAILED: Ship details failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Search Ships
Write-Host "`nTest 5: Ship Search" -ForegroundColor Yellow
try {
    $searchResponse = Invoke-RestMethod -Uri "$baseUrl/mcp" -Method POST -Headers $headers -Body '{"method":"search_ships","query":"Carnival","limit":3,"id":4}' -TimeoutSec 45
    if ($searchResponse.result.content.Count -gt 0) {
        Write-Host "SUCCESS: Ship search working: $($searchResponse.result.content.Count) ships found" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Ship search returns empty result" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAILED: Ship search failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n" + "=" * 50
Write-Host "Testing Complete!" -ForegroundColor Cyan