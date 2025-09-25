#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

// Global browser instance for reuse
let browser = null;
let browserContext = null;

// Initialize browser with memory-optimized settings for Render.com
async function initBrowser() {
  if (!browser) {
    console.error('Initializing Playwright browser with memory optimization...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--memory-pressure-off',
        '--max_old_space_size=256',  // Limit memory to 256MB
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI,VizDisplayCompositor'
      ]
    });
    
    browserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; CruiseMapperBot/1.0)',
      viewport: { width: 800, height: 600 }  // Smaller viewport to save memory
    });
    
    console.error('Playwright browser initialized with memory optimization');
  }
  return browserContext;
}

// Cleanup browser on exit
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

// Create the server with proper configuration
const server = new Server(
  {
    name: 'cruisemapper-mcp',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Cache for ship IDs to improve performance
const shipIdCache = new Map();

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

// Memory optimized ship search - skip Playwright on Render
async function searchShipWithPlaywright(shipName) {
  // Skip Playwright on Render to avoid memory issues
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  if (isRender) {
    console.error('Skipping Playwright search on Render platform');
    return null;
  }
  
  try {
    const context = await initBrowser();
    const page = await context.newPage();
    
    console.error(`🔍 Searching for ship: ${shipName}`);
    
    // Navigate with very short timeout
    await page.goto('https://www.cruisemapper.com/ships', { 
      waitUntil: 'domcontentloaded',
      timeout: 8000
    });
    
    await page.waitForTimeout(1000);
    await page.waitForSelector('a[href*="/ships/"]', { timeout: 3000 });
    
    // Try exact match first
    const exactMatch = page.locator(`a[href*="/ships/"]:has-text("${shipName}")`).first();
    if (await exactMatch.count() > 0) {
      const href = await exactMatch.getAttribute('href');
      const text = await exactMatch.textContent();
      await page.close();
      return {
        name: text.trim(),
        url: `https://www.cruisemapper.com${href}`,
        id: extractShipId(href)
      };
    }
    
    await page.close();
    return null;
    
  } catch (error) {
    console.error(`Playwright ship search failed: ${error.message}`);
    return null;
  }
}

// Helper function to safely convert to lowercase
function safeToLowerCase(str) {
  return str && typeof str === 'string' ? str.toLowerCase() : '';
}

// Helper function to validate ship page content
function validateShipPage($, shipName, url) {
  const pageTitle = $('title').text().toLowerCase();
  const h1Text = $('h1').first().text().toLowerCase();
  const shipNameLower = safeToLowerCase(shipName);
  
  // More lenient validation that accounts for variations
  const titleWords = pageTitle.split(/\s+/);
  const shipWords = shipNameLower.split(/\s+/);
  const h1Words = h1Text.split(/\s+/);
  
  // Check if most important words match
  const titleMatch = shipWords.some(word => 
    word.length > 2 && titleWords.some(titleWord => 
      titleWord.includes(word) || word.includes(titleWord)
    )
  );
  
  const h1Match = shipWords.some(word => 
    word.length > 2 && h1Words.some(h1Word => 
      h1Word.includes(word) || word.includes(h1Word)
    )
  );
  
  const isValid = titleMatch || h1Match || 
    pageTitle.includes(shipNameLower) || 
    h1Text.includes(shipNameLower);
  
  if (!isValid) {
    console.error(`❌ Ship validation failed for "${shipName}"`);
    console.error(`   Page title: "${pageTitle}"`);
    console.error(`   H1 text: "${h1Text}"`);
    console.error(`   URL: ${url}`);
  } else {
    console.error(`✅ Ship validation passed for "${shipName}"`);
  }
  
  return isValid;
}

// Helper function to scrape CruiseMapper with optimized approach for Render
async function scrapeCruiseMapper(url, usePlaywright = true) {
  console.error(`Scraping: ${url} (${usePlaywright ? 'Playwright' : 'Axios'})`);
  
  // Always use Axios on Render to avoid memory issues
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  
  if (usePlaywright && !isRender) {
    try {
      const context = await initBrowser();
      const page = await context.newPage();
      
      // Set timeout and navigate (reduced for memory efficiency)
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 8000  // Very short timeout for Render
      });
      
      // Wait for content to load (reduced timeout)
      await page.waitForTimeout(500);
      
      // Get page content
      const htmlContent = await page.content();
      await page.close();
      
      console.error(`✅ Playwright scraping successful`);
      return cheerio.load(htmlContent);
      
    } catch (playwrightError) {
      console.error(`Playwright scraping failed, falling back to Axios: ${playwrightError.message}`);
    }
  }
  
  // Fallback to Axios (always used on Render)
  try {
    console.error('Using Axios for scraping');
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CruiseMapperBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    console.error(`✅ Axios scraping successful`);
    return cheerio.load(response.data);
    
  } catch (axiosError) {
    console.error(`Axios scraping also failed: ${axiosError.message}`);
    throw new Error(`Failed to scrape ${url}: ${axiosError.message}`);
  }
}

// Define available tools
const TOOLS = [
  {
    name: 'list_all_ships',
    description: 'Get a list of all cruise ships from CruiseMapper',
    inputSchema: {
      type: 'object',
      properties: {
        cruise_line: {
          type: 'string',
          description: 'Optional: filter by cruise line (e.g., "Royal Caribbean", "Carnival")'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of ships to return (default: 50)'
        }
      }
    }
  },
  {
    name: 'search_ship_schedule',
    description: 'Search for a specific cruise ship schedule and itineraries',
    inputSchema: {
      type: 'object',
      properties: {
        ship_name: {
          type: 'string',
          description: 'Name of the cruise ship (e.g., "Liberty of the Seas")'
        }
      },
      required: ['ship_name']
    }
  },
  {
    name: 'get_ship_full_details',
    description: 'Get comprehensive details about a cruise ship including specs, amenities, and current location',
    inputSchema: {
      type: 'object',
      properties: {
        ship_name: {
          type: 'string',
          description: 'Name of the cruise ship'
        }
      },
      required: ['ship_name']
    }
  },
  {
    name: 'get_port_schedule',
    description: 'Get ship arrivals and departures for a specific port',
    inputSchema: {
      type: 'object',
      properties: {
        port_name: {
          type: 'string',
          description: 'Name of the port (e.g., "Miami", "Barcelona")'
        }
      },
      required: ['port_name']
    }
  },
  {
    name: 'search_cruise_by_date',
    description: 'Search for cruises by date and destination',
    inputSchema: {
      type: 'object',
      properties: {
        departure_date: {
          type: 'string',
          description: 'Departure date in YYYY-MM format'
        },
        destination: {
          type: 'string',
          description: 'Destination (e.g., "Caribbean", "Mediterranean")'
        }
      }
    }
  },
  {
    name: 'get_cruise_lines',
    description: 'Get a list of all cruise lines available on CruiseMapper',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Handler for listing tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handler for calling tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  console.error(`Tool called: ${name}`);
  
  try {
    switch (name) {
      case 'list_all_ships':
        return await handleListAllShips(args || {});
        
      case 'search_ship_schedule':
        return await handleShipSchedule(args || {});
      
      case 'get_ship_full_details':
        return await handleShipFullDetails(args || {});
      
      case 'get_port_schedule':
        return await handlePortSchedule(args || {});
      
      case 'search_cruise_by_date':
        return await handleCruiseByDate(args || {});
        
      case 'get_cruise_lines':
        return await handleGetCruiseLines(args || {});
      
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// List all ships from the main ships page using optimized approach
async function handleListAllShips(args) {
  const { cruise_line, limit = 50 } = args;
  
  try {
    console.error(`🚢 Listing ships with limit: ${limit}, cruise_line: ${cruise_line || 'none'}`);
    
    // For Render.com, try Axios first to avoid memory issues
    const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
    
    if (isRender) {
      console.error('🔄 Using Axios method first on Render platform');
      return await listShipsWithAxios(cruise_line, limit);
    }
    
    // Use Playwright for better ship detection (local/dev only)
    console.error('🎭 Using Playwright method');
    return await listShipsWithPlaywright(cruise_line, limit);
    
  } catch (error) {
    console.error('Primary method failed, using fallback:', error.message);
    return await listShipsWithAxios(cruise_line, limit);
  }
}

// Playwright implementation (for development)
async function listShipsWithPlaywright(cruise_line, limit) {
  const context = await initBrowser();
  const page = await context.newPage();
  
  try {
    await page.goto('https://www.cruisemapper.com/ships', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000  // Very short timeout for Render
    });
    
    await page.waitForTimeout(1000);  // Minimal wait
    await page.waitForSelector('a[href*="/ships/"]', { timeout: 3000 });
    
    // Quick scroll to load more content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(500);
    
    // Get all ship links quickly
    const shipLinks = await page.locator('a[href*="/ships/"]').all();
    console.error(`Found ${shipLinks.length} ship links`);
    
    const ships = [];
    const processedUrls = new Set();
    
    // Process links with stricter limits
    for (let i = 0; i < Math.min(shipLinks.length, limit * 2); i++) {
      try {
        const link = shipLinks[i];
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        
        if (href && text && href.match(/\/ships\/[A-Za-z0-9-]+-\d+$/) && text.trim()) {
          const shipName = text.trim();
          const fullUrl = `https://www.cruisemapper.com${href}`;
          
          if (processedUrls.has(fullUrl)) continue;
          processedUrls.add(fullUrl);
          
          const shouldInclude = !cruise_line || 
            safeToLowerCase(shipName).includes(safeToLowerCase(cruise_line));
          
          if (shouldInclude) {
            const shipId = extractShipId(href);
            ships.push({ name: shipName, url: fullUrl, id: shipId });
            
            if (shipId && shipId !== 'unknown') {
              shipIdCache.set(safeToLowerCase(shipName), shipId);
            }
            
            if (ships.length >= limit) break;
          }
        }
      } catch (linkError) {
        continue;  // Skip problematic links
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_found: ships.length,
          returned: ships.length,
          cruise_line_filter: cruise_line || 'none',
          ships: ships,
          method: 'Playwright (optimized)',
          cache_size: shipIdCache.size
        }, null, 2)
      }]
    };
    
  } finally {
    await page.close();
  }
}

// Axios fallback implementation (for production/Render)
async function listShipsWithAxios(cruise_line, limit) {
  console.error('🔄 Using Axios fallback method');
  
  try {
    const url = 'https://www.cruisemapper.com/ships';
    const $ = await scrapeCruiseMapper(url, false);
    const ships = [];
    
    // Extract all ship links from the page
    $('a[href*="/ships/"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const text = $el.text().trim();
      
      // Filter out non-ship links using improved regex
      if (href && href.match(/\/ships\/[A-Za-z0-9-]+-\d+$/) && text) {
        const shipId = extractShipId(href);
        const shipData = {
          name: text,
          url: `https://www.cruisemapper.com${href}`,
          id: shipId
        };
        
        // Cache the ship ID for later use
        if (shipId && shipId !== 'unknown') {
          shipIdCache.set(safeToLowerCase(text), shipId);
        }
        
        // Filter by cruise line if specified
        if (!cruise_line || safeToLowerCase(text).includes(safeToLowerCase(cruise_line))) {
          ships.push(shipData);
        }
      }
    });
    
    // Remove duplicates and limit results
    const uniqueShips = Array.from(new Map(ships.map(s => [s.name, s])).values());
    const limitedShips = uniqueShips.slice(0, limit);
    
    console.error(`✅ Axios method found ${limitedShips.length} ships`);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_found: limitedShips.length,
          returned: limitedShips.length,
          cruise_line_filter: cruise_line || 'none',
          ships: limitedShips,
          method: 'Axios fallback (memory-efficient)',
          cache_size: shipIdCache.size
        }, null, 2)
      }]
    };
    
  } catch (error) {
    console.error('Axios fallback also failed:', error.message);
    
    // Return empty result with error info
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_found: 0,
          returned: 0,
          error: 'All methods failed',
          cruise_line_filter: cruise_line || 'none',
          ships: [],
          method: 'Failed - both Playwright and Axios',
          details: error.message
        }, null, 2)
      }]
    };
  }
}


// Get cruise lines
async function handleGetCruiseLines(args) {
  const url = 'https://www.cruisemapper.com/cruise-lines';
  
  try {
    const $ = await scrapeCruiseMapper(url);
    const cruiseLines = [];
    
    // Extract cruise line information
    $('a[href*="/cruise-lines/"]').each((i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const href = $el.attr('href');
      
      if (text && href && !href.includes('#')) {
        cruiseLines.push({
          name: text,
          url: `https://www.cruisemapper.com${href}`
        });
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_cruise_lines: cruiseLines.length,
          cruise_lines: cruiseLines
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Could not fetch cruise lines: ${error.message}`
      }]
    };
  }
}

// Enhanced ship schedule handler
async function handleShipSchedule(args) {
  const { ship_name } = args;
  
  // Validate ship_name parameter
  if (!ship_name || typeof ship_name !== 'string') {
    return {
      content: [{
        type: 'text',
        text: 'Error: ship_name parameter is required and must be a string'
      }],
      isError: true
    };
  }
  
  // Use the same multi-strategy approach as handleShipFullDetails
  const strategies = [
    // Strategy 1: Try with cached ID
    async () => {
      const cachedId = shipIdCache.get(safeToLowerCase(ship_name));
      if (cachedId) {
        const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
        const url = `https://www.cruisemapper.com/ships/${shipSlug}-${cachedId}`;
        try {
          const $ = await scrapeCruiseMapper(url);
          if (validateShipPage($, ship_name, url)) {
            return { $, url };
          }
        } catch (error) {
          return null;
        }
      }
      return null;
    },
    
    // Strategy 2: Enhanced Playwright search
    async () => {
      console.error(`Using enhanced Playwright search for: ${ship_name}`);
      const foundShip = await searchShipWithPlaywright(ship_name);
      if (foundShip) {
        // Cache the discovered ship
        const shipId = foundShip.id;
        if (shipId && shipId !== 'unknown') {
          shipIdCache.set(safeToLowerCase(ship_name), shipId);
          shipIdCache.set(safeToLowerCase(foundShip.name), shipId);
        }
        
        console.error(`Found ship via Playwright: ${foundShip.name} -> ${foundShip.url}`);
        const $ = await scrapeCruiseMapper(foundShip.url);
        
        // Validate this is the correct ship
        if (validateShipPage($, ship_name, foundShip.url)) {
          return { $, url: foundShip.url };
        } else {
          console.error(`Playwright found ship but validation failed`);
          return null;
        }
      }
      return null;
    },
    
    // Strategy 3: Try common IDs with validation
    async () => {
      const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
      // Expanded list of common IDs, excluding problematic ones
      const commonIds = ['737', '734', '735', '736', '738', '739', '740', '741', '742', '1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008', '1009', '1010'];
      
      for (const id of commonIds) {
        const url = `https://www.cruisemapper.com/ships/${shipSlug}-${id}`;
        try {
          const $ = await scrapeCruiseMapper(url);
          
          // Enhanced validation using the new validation function
          if (validateShipPage($, ship_name, url)) {
            shipIdCache.set(safeToLowerCase(ship_name), id);
            console.error(`✅ Found correct ship schedule with ID ${id}`);
            return { $, url };
          }
        } catch (error) {
          continue;
        }
      }
      return null;
    }
  ];
  
  // Try each strategy
  let result = null;
  for (const strategy of strategies) {
    result = await strategy();
    if (result) break;
  }
  
  if (!result) {
    return {
      content: [{
        type: 'text',
        text: `Could not find information for ship: ${ship_name}. Try using 'list_all_ships' to find the exact ship name.`
      }]
    };
  }
  
  const { $, url } = result;
  
  // Extract comprehensive ship information
  const pageTitle = $('title').text();
  const shipHeading = $('h1').first().text().trim();
  
  // Extract itinerary/schedule data
  const schedules = [];
  const itineraries = [];
  
  // Look for itinerary links
  $('a[href*="itinerary"], a[href*="schedule"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const href = $el.attr('href');
    
    if (text && href) {
      itineraries.push({
        title: text,
        url: `https://www.cruisemapper.com${href}`
      });
    }
  });
  
  // Extract any visible schedule data
  $('table').each((i, table) => {
    const $table = $(table);
    const headers = [];
    $table.find('th').each((j, th) => {
      headers.push($(th).text().trim());
    });
    
    if (headers.some(h => safeToLowerCase(h).includes('date') || safeToLowerCase(h).includes('port'))) {
      $table.find('tr').each((j, row) => {
        if (j === 0) return; // Skip header
        const rowData = {};
        $(row).find('td').each((k, cell) => {
          if (headers[k]) {
            rowData[headers[k]] = $(cell).text().trim();
          }
        });
        if (Object.keys(rowData).length > 0) {
          schedules.push(rowData);
        }
      });
    }
  });
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ship_name,
        url,
        page_title: pageTitle,
        ship_heading: shipHeading,
        itinerary_links_found: itineraries.length,
        itineraries: itineraries.slice(0, 10),
        schedules_found: schedules.length,
        schedules: schedules.slice(0, 20),
        ship_id: shipIdCache.get(safeToLowerCase(ship_name)) || extractShipId(url),
        validation_passed: true
      }, null, 2)
    }]
  };
}

// Get comprehensive ship details
async function handleShipFullDetails(args) {
  const { ship_name } = args;
  
  // Validate ship_name parameter
  if (!ship_name || typeof ship_name !== 'string') {
    return {
      content: [{
        type: 'text',
        text: 'Error: ship_name parameter is required and must be a string'
      }],
      isError: true
    };
  }
  
  // Try multiple strategies to find the ship
  const strategies = [
    // Strategy 1: Try with cached ID if available
    async () => {
      const cachedId = shipIdCache.get(safeToLowerCase(ship_name));
      if (cachedId) {
        const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
        const url = `https://www.cruisemapper.com/ships/${shipSlug}-${cachedId}`;
        try {
          const $ = await scrapeCruiseMapper(url);
          return { $, url };
        } catch (error) {
          console.error(`Cached URL failed: ${url}`);
          return null;
        }
      }
      return null;
    },
    
    // Strategy 2: Search the ships list first to find the correct ship ID
    async () => {
      try {
        console.error(`Searching for ship: ${ship_name}`);
        const shipsUrl = 'https://www.cruisemapper.com/ships';
        const $ = await scrapeCruiseMapper(shipsUrl);
        
        let foundShip = null;
        
        // Look for the ship in the ships list
        $('a[href*="/ships/"]').each((i, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          const href = $el.attr('href');
          
          // Check for exact match or close match
          if (text && href && (
            safeToLowerCase(text) === safeToLowerCase(ship_name) ||
            safeToLowerCase(text).includes(safeToLowerCase(ship_name)) ||
            safeToLowerCase(ship_name).includes(safeToLowerCase(text))
          )) {
            const shipId = href.match(/-(\d+)$/)?.[1];
            if (shipId) {
              foundShip = {
                name: text,
                url: href.startsWith('http') ? href : `https://www.cruisemapper.com${href}`,
                id: shipId
              };
              // Cache for future use
              shipIdCache.set(safeToLowerCase(ship_name), shipId);
              shipIdCache.set(safeToLowerCase(text), shipId);
              return false; // Break the loop
            }
          }
        });
        
        if (foundShip) {
          console.error(`Found ship via search: ${foundShip.name} (${foundShip.id})`);
          const $ = await scrapeCruiseMapper(foundShip.url);
          return { $, url: foundShip.url };
        }
        
        return null;
      } catch (error) {
        console.error('Ship search strategy failed:', error.message);
        return null;
      }
    },
    
    // Strategy 3: Try common ship ID patterns with validation
    async () => {
      const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
      // Expanded list of common IDs, excluding problematic ones
      const commonIds = ['737', '734', '735', '736', '738', '739', '740', '741', '742', '1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008', '1009', '1010'];
      
      for (const id of commonIds) {
        const url = `https://www.cruisemapper.com/ships/${shipSlug}-${id}`;
        try {
          const $ = await scrapeCruiseMapper(url);
          
          // Enhanced validation using the new validation function
          if (validateShipPage($, ship_name, url)) {
            shipIdCache.set(safeToLowerCase(ship_name), id);
            console.error(`✅ Found correct ship with ID ${id}`);
            return { $, url };
          } else {
            console.error(`❌ ID ${id} returned wrong ship for search "${ship_name}"`);
          }
        } catch (error) {
          continue;
        }
      }
      return null;
    },
    
    // Strategy 4: Try without ID
    async () => {
      const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
      const url = `https://www.cruisemapper.com/ships/${shipSlug}`;
      try {
        const $ = await scrapeCruiseMapper(url);
        console.error(`Found ship without ID: ${url}`);
        return { $, url };
      } catch (error) {
        return null;
      }
    }
  ];
  
  // Try each strategy until one works
  let result = null;
  for (const strategy of strategies) {
    result = await strategy();
    if (result) break;
  }
  
  if (!result) {
    return {
      content: [{
        type: 'text',
        text: `Could not find ship "${ship_name}" on CruiseMapper. The ship name might be incorrect or the ship might not be in their database. Try using 'list_all_ships' to find the exact ship name.`
      }]
    };
  }
  
  const { $, url } = result;
  
  try {
    // Extract comprehensive ship details
    const details = {
      name: $('h1').first().text().trim() || ship_name,
      url: url,
      search_term: ship_name
    };
    
    // Extract ship ID from URL if available
    const shipId = extractShipId(url);
    if (shipId && shipId !== 'unknown') {
      details.ship_id = shipId;
    }
    
    // Extract all specification data
    const specs = {};
    
    // Look for specification table or divs
    $('table td, div').each((i, el) => {
      const text = $(el).text().trim();
      
      // Match various specification patterns
      const patterns = {
        'gross_tonnage': /Gross [Tt]onnage:?\s*([0-9,]+)/,
        'passengers': /Passengers:?\s*([0-9,-]+)/,
        'crew': /Crew:?\s*([0-9,]+)/,
        'length': /Length.*?([0-9,]+\s*m)/,
        'beam': /Beam.*?([0-9,]+\s*m)/,
        'draft': /Draft.*?([0-9,.]+\s*m)/,
        'decks': /Decks:?\s*([0-9]+)/,
        'cabins': /Cabins:?\s*([0-9,]+)/,
        'year_built': /Year [Bb]uilt:?\s*([0-9]+)/,
        'last_refurbished': /Refurbished:?\s*([0-9]+)/,
        'speed': /Speed:?\s*([0-9.]+\s*kn)/,
        'cruise_line': /Cruise [Ll]ine:?\s*([A-Za-z\s]+)/
      };
      
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match && !specs[key]) {
          specs[key] = match[1].trim();
        }
      }
    });
    
    details.specifications = specs;
    
    // Look for current position/status
    const currentStatus = $('div:contains("Current position"), div:contains("Last position")').text().trim();
    if (currentStatus) {
      details.current_status = currentStatus;
    }
    
    // Look for amenities/features
    const amenities = [];
    $('ul li').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5 && text.length < 100) {
        amenities.push(text);
      }
    });
    
    if (amenities.length > 0) {
      details.amenities = amenities.slice(0, 20);
    }
    
    // Add page title for context
    details.page_title = $('title').text().trim();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(details, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error processing ship details for ${ship_name}: ${error.message}`
      }]
    };
  }
}

// Port schedule handler
async function handlePortSchedule(args) {
  const { port_name } = args;
  
  // Validate port_name parameter
  if (!port_name || typeof port_name !== 'string') {
    return {
      content: [{
        type: 'text',
        text: 'Error: port_name parameter is required and must be a string'
      }],
      isError: true
    };
  }
  
  const portSlug = safeToLowerCase(port_name).replace(/\s+/g, '-');
  const url = `https://www.cruisemapper.com/ports/${portSlug}`;
  
  try {
    const $ = await scrapeCruiseMapper(url);
    
    const portInfo = {
      port: port_name,
      url: url,
      page_title: $('title').text(),
      ships: []
    };
    
    // Look for ship arrival/departure information in tables
    $('table').each((i, table) => {
      const $table = $(table);
      const headers = [];
      
      // Get headers
      $table.find('th').each((j, th) => {
        headers.push(safeToLowerCase($(th).text().trim()));
      });
      
      // Process rows if we have relevant headers
      if (headers.some(h => h.includes('ship') || h.includes('arrival') || h.includes('date'))) {
        $table.find('tr').each((j, row) => {
          if (j === 0) return; // Skip header
          
          const shipData = {};
          $(row).find('td').each((k, cell) => {
            const text = $(cell).text().trim();
            if (headers[k]) {
              if (headers[k].includes('ship')) shipData.ship = text;
              else if (headers[k].includes('arrival')) shipData.arrival = text;
              else if (headers[k].includes('departure')) shipData.departure = text;
              else if (headers[k].includes('date')) shipData.date = text;
              else if (headers[k].includes('line')) shipData.cruise_line = text;
            }
          });
          
          if (shipData.ship) {
            portInfo.ships.push(shipData);
          }
        });
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...portInfo,
          ships_found: portInfo.ships.length,
          ships: portInfo.ships.slice(0, 30)
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Could not fetch port schedule for ${port_name}: ${error.message}`
      }]
    };
  }
}

// Enhanced cruise by date search
async function handleCruiseByDate(args) {
  const { departure_date, destination } = args;
  
  // Build search URL with parameters
  let url = 'https://www.cruisemapper.com/cruises';
  const params = new URLSearchParams();
  
  if (departure_date) {
    // Convert YYYY-MM to format expected by the site
    params.append('month', departure_date);
  }
  
  if (destination) {
    params.append('destination', safeToLowerCase(destination));
  }
  
  if (params.toString()) {
    url += '?' + params.toString();
  }
  
  try {
    const $ = await scrapeCruiseMapper(url);
    const cruises = [];
    
    // Look for cruise listings
    $('.cruise-item, .cruise-result, div[class*="cruise"]').each((i, el) => {
      const $el = $(el);
      const cruiseData = {
        ship: $el.find('a[href*="/ships/"]').text().trim(),
        departure: $el.find('.date, .departure').text().trim(),
        duration: $el.find('.duration, .nights').text().trim(),
        ports: $el.find('.ports, .itinerary').text().trim(),
        price: $el.find('.price').text().trim()
      };
      
      if (cruiseData.ship || cruiseData.departure) {
        cruises.push(cruiseData);
      }
    });
    
    // Also check tables
    $('table').each((i, table) => {
      const $table = $(table);
      $table.find('tr').each((j, row) => {
        if (j === 0) return;
        
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const cruiseData = {
            ship: cells.eq(0).text().trim(),
            departure: cells.eq(1).text().trim(),
            destination: cells.eq(2).text().trim(),
            duration: cells.eq(3).text().trim() || 'N/A'
          };
          
          if (cruiseData.ship) {
            cruises.push(cruiseData);
          }
        }
      });
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          search_params: args,
          url: url,
          cruises_found: cruises.length,
          cruises: cruises.slice(0, 20),
          note: cruises.length === 0 ? 'No cruises found. Try different search parameters.' : 'Cruise data extracted'
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Could not search cruises: ${error.message}`
      }]
    };
  }
}

// Start the server
async function main() {
  console.error('Starting Enhanced CruiseMapper MCP server v2.0...');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('CruiseMapper MCP server running!');
  console.error('Available tools:', TOOLS.map(t => t.name).join(', '));
}

// Run the server
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});