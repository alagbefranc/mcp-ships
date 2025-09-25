#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

// Helper function to safely convert to lowercase
function safeToLowerCase(str) {
  return str && typeof str === 'string' ? str.toLowerCase() : '';
}

// Helper function to scrape CruiseMapper
async function scrapeCruiseMapper(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    return cheerio.load(response.data);
  } catch (error) {
    console.error('Scraping error:', error.message);
    throw error;
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

// List all ships from the main ships page
async function handleListAllShips(args) {
  const { cruise_line, limit = 50 } = args;
  const url = 'https://www.cruisemapper.com/ships';
  
  try {
    const $ = await scrapeCruiseMapper(url);
    const ships = [];
    
    // Extract all ship links from the page
    $('a[href*="/ships/"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const text = $el.text().trim();
      
      // Filter out non-ship links
      if (href && href.match(/\/ships\/[a-z0-9-]+-\d+$/) && text) {
        const shipId = href.match(/-(\d+)$/)?.[1] || '';
        const shipData = {
          name: text,
          url: `https://www.cruisemapper.com${href}`,
          id: shipId
        };
        
        // Cache the ship ID for later use
        if (shipId) {
          shipIdCache.set(safeToLowerCase(text), shipId);
        }
        
        // Filter by cruise line if specified
        if (!cruise_line || safeToLowerCase(text).includes(safeToLowerCase(cruise_line))) {
          ships.push(shipData);
        }
      }
    });
    
    // Also look for ship information in tables
    $('table tr').each((i, row) => {
      const $row = $(row);
      const shipName = $row.find('td:first-child a').text().trim();
      const shipHref = $row.find('td:first-child a').attr('href');
      
      if (shipName && shipHref) {
        const shipId = shipHref.match(/-(\d+)$/)?.[1] || '';
        if (shipId) {
          shipIdCache.set(safeToLowerCase(shipName), shipId);
        }
        
        const existingShip = ships.find(s => s.name === shipName);
        if (!existingShip) {
          ships.push({
            name: shipName,
            url: `https://www.cruisemapper.com${shipHref}`,
            id: shipId
          });
        }
      }
    });
    
    // Remove duplicates and limit results
    const uniqueShips = Array.from(new Map(ships.map(s => [s.name, s])).values());
    const limitedShips = uniqueShips.slice(0, limit);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_found: uniqueShips.length,
          returned: limitedShips.length,
          cruise_line_filter: cruise_line || 'none',
          ships: limitedShips,
          note: 'Use ship names from this list for detailed searches'
        }, null, 2)
      }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Could not fetch ship list: ${error.message}`
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
          return { $, url };
        } catch (error) {
          return null;
        }
      }
      return null;
    },
    
    // Strategy 2: Search ships list
    async () => {
      try {
        const shipsUrl = 'https://www.cruisemapper.com/ships';
        const $ = await scrapeCruiseMapper(shipsUrl);
        
        let foundShip = null;
        
        $('a[href*="/ships/"]').each((i, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          const href = $el.attr('href');
          
          if (text && href && (
            safeToLowerCase(text) === safeToLowerCase(ship_name) ||
            safeToLowerCase(text).includes(safeToLowerCase(ship_name)) ||
            safeToLowerCase(ship_name).includes(safeToLowerCase(text))
          )) {
            const shipId = href.match(/-(\d+)$/)?.[1];
            if (shipId) {
              foundShip = {
                name: text,
                url: `https://www.cruisemapper.com${href}`,
                id: shipId
              };
              shipIdCache.set(safeToLowerCase(ship_name), shipId);
              return false;
            }
          }
        });
        
        if (foundShip) {
          const $ = await scrapeCruiseMapper(foundShip.url);
          return { $, url: foundShip.url };
        }
        
        return null;
      } catch (error) {
        return null;
      }
    },
    
    // Strategy 3: Try common IDs
    async () => {
      const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
      const commonIds = ['542', '737', '734', '735', '736', '738', '739', '740', '741', '742'];
      
      for (const id of commonIds) {
        const url = `https://www.cruisemapper.com/ships/${shipSlug}-${id}`;
        try {
          const $ = await scrapeCruiseMapper(url);
          shipIdCache.set(safeToLowerCase(ship_name), id);
          return { $, url };
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
        ship_id: shipIdCache.get(safeToLowerCase(ship_name)) || 'discovered'
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
                url: `https://www.cruisemapper.com${href}`,
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
    
    // Strategy 3: Try common ship ID patterns
    async () => {
      const shipSlug = safeToLowerCase(ship_name).replace(/\s+/g, '-');
      const commonIds = ['542', '737', '734', '735', '736', '738', '739', '740', '741', '742', '1000', '1001', '1002'];
      
      for (const id of commonIds) {
        const url = `https://www.cruisemapper.com/ships/${shipSlug}-${id}`;
        try {
          const $ = await scrapeCruiseMapper(url);
          // Cache the working ID
          shipIdCache.set(safeToLowerCase(ship_name), id);
          console.error(`Found ship with common ID: ${url}`);
          return { $, url };
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
    const shipId = url.match(/-(-\d+)$/)?.[1];
    if (shipId) {
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