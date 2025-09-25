#!/usr/bin/env node

// Import the functions we need to test
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Cache for ship IDs to improve performance
const shipIdCache = new Map();

// Global browser instance for reuse
let browser = null;
let browserContext = null;

// Initialize browser
async function initBrowser() {
  if (!browser) {
    console.error('Initializing Playwright browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    browserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    console.error('Playwright browser initialized');
  }
  return browserContext;
}

// Helper function to extract ship ID from URL
function extractShipId(href) {
  if (!href) return 'unknown';
  
  // Try different patterns for ship ID extraction
  const patterns = [
    /-(\d+)$/,           // Standard pattern: ship-name-123
    /ships\/.*-(\d+)$/,  // Full path pattern
    /id[=:](\d+)/,       // Query parameter pattern
    /\/(\d+)$/           // Just number at end
  ];
  
  for (const pattern of patterns) {
    const match = href.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  console.error(`Could not extract ship ID from: ${href}`);
  return 'unknown';
}

// Helper function to safely convert to lowercase
function safeToLowerCase(str) {
  return str && typeof str === 'string' ? str.toLowerCase() : '';
}

// Test 1: Ship ID extraction from URLs
function testShipIdExtraction() {
  console.log('\n=== Testing Ship ID Extraction ===');
  
  const testUrls = [
    '/ships/icon-of-the-seas-737',
    '/ships/carnival-inspiration-542',
    '/ships/liberty-of-the-seas-734',
    '/ships/symphony-of-the-seas-1000',
    '/ships/royal-caribbean-1234',
    '/ships/some-ship-name-456',
    'invalid-url'
  ];
  
  testUrls.forEach(url => {
    const id = extractShipId(url);
    console.log(`URL: ${url} -> ID: ${id}`);
  });
}

// Test 2: List ships functionality
async function testListAllShips() {
  console.log('\n=== Testing List All Ships ===');
  
  try {
    const context = await initBrowser();
    const page = await context.newPage();
    
    await page.goto('https://www.cruisemapper.com/ships', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    await page.waitForSelector('a[href*="/ships/"]', { timeout: 10000 });
    
    // Get ship links
    const shipLinks = await page.locator('a[href*="/ships/"]').all();
    console.log(`Found ${shipLinks.length} ship links`);
    
    const ships = [];
    const processedUrls = new Set();
    
    // Process first 10 ships for testing
    for (let i = 0; i < Math.min(shipLinks.length, 10); i++) {
      try {
        const link = shipLinks[i];
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        
        if (href && text && href.match(/\/ships\/[A-Za-z0-9-]+-\d+$/) && text.trim()) {
          const shipName = text.trim();
          const fullUrl = `https://www.cruisemapper.com${href}`;
          
          if (processedUrls.has(fullUrl)) {
            continue;
          }
          processedUrls.add(fullUrl);
          
          const shipId = extractShipId(href);
          const shipData = {
            name: shipName,
            url: fullUrl,
            id: shipId
          };
          
          ships.push(shipData);
          console.log(`✅ Found ship: ${shipName} (ID: ${shipId}) - URL: ${href}`);
        } else {
          console.log(`❌ Filtered out: href=${href}, text="${text?.trim()}", match=${href?.match(/\/ships\/[a-z0-9-]+-\d+$/)}`);
        }
      } catch (linkError) {
        console.error(`⚠️ Error processing link: ${linkError.message}`);
        continue;
      }
    }
    
    await page.close();
    console.log(`Total ships processed: ${ships.length}`);
    return ships;
    
  } catch (error) {
    console.error(`Error in testListAllShips: ${error.message}`);
    return [];
  }
}

// Test 3: Ship data parsing with validation
async function testShipDataParsing() {
  console.log('\n=== Testing Ship Data Parsing ===');
  
  const testShips = [
    { name: 'Icon Of The Seas', expectedId: '737' },
    { name: 'Liberty of the Seas', expectedId: '734' },
    { name: 'Symphony of the Seas', expectedId: '1000' }
  ];
  
  for (const testShip of testShips) {
    try {
      console.log(`\nTesting: ${testShip.name}`);
      
      // Try to construct URL with expected ID
      const shipSlug = safeToLowerCase(testShip.name).replace(/\s+/g, '-');
      const url = `https://www.cruisemapper.com/ships/${shipSlug}-${testShip.expectedId}`;
      
      console.log(`Trying URL: ${url}`);
      
      // Scrape the page
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract data
      const pageTitle = $('title').text();
      const h1Text = $('h1').first().text();
      const extractedId = extractShipId(url);
      
      console.log(`  Page title: ${pageTitle}`);
      console.log(`  H1 text: ${h1Text}`);
      console.log(`  Extracted ID: ${extractedId}`);
      
      // Validate
      const isCorrectShip = pageTitle.toLowerCase().includes(testShip.name.toLowerCase()) ||
                           h1Text.toLowerCase().includes(testShip.name.toLowerCase());
      
      console.log(`  ✅ Validation: ${isCorrectShip ? 'PASSED' : 'FAILED'}`);
      
    } catch (error) {
      console.error(`  ❌ Error testing ${testShip.name}: ${error.message}`);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚢 Starting CruiseMapper MCP Server Fix Tests');
  
  // Test 1: Ship ID extraction
  testShipIdExtraction();
  
  // Test 2: List all ships
  const ships = await testListAllShips();
  
  // Test 3: Ship data parsing
  await testShipDataParsing();
  
  // Cleanup
  if (browser) {
    await browser.close();
  }
  
  console.log('\n🎯 All tests completed!');
}

// Run the tests
runAllTests().catch(console.error);