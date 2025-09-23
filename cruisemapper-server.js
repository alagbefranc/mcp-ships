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
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Helper function to scrape CruiseMapper
async function scrapeCruiseMapper(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
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
    name: 'search_ship_schedule',
    description: 'Search for a specific cruise ship schedule',
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
    name: 'get_ship_details',
    description: 'Get detailed information about a cruise ship',
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
      case 'search_ship_schedule':
        return await handleShipSchedule(args);
      
      case 'get_ship_details':
        return await handleShipDetails(args);
      
      case 'get_port_schedule':
        return await handlePortSchedule(args);
      
      case 'search_cruise_by_date':
        return await handleCruiseByDate(args);
      
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

// Tool implementation functions
async function handleShipSchedule(args) {
  const { ship_name } = args;
  
  // CruiseMapper uses ship-name-ID format, we'll try common IDs
  const possibleUrls = [
    `https://www.cruisemapper.com/ships/${ship_name.toLowerCase().replace(/\s+/g, '-')}-542`,
    `https://www.cruisemapper.com/ships/${ship_name.toLowerCase().replace(/\s+/g, '-')}`,
  ];
  
  let $ = null;
  let successUrl = null;
  
  // Try different URL patterns
  for (const url of possibleUrls) {
    try {
      $ = await scrapeCruiseMapper(url);
      successUrl = url;
      break;
    } catch (error) {
      continue;
    }
  }
  
  if (!$) {
    return {
      content: [{
        type: 'text',
        text: `Could not find information for ship: ${ship_name}. The ship might not exist or require a different URL format.`
      }]
    };
  }
  
  // Extract ship information
  const pageTitle = $('title').text();
  const shipHeading = $('h1').first().text().trim();
  
  // Try to extract schedule/itinerary information
  const schedules = [];
  
  // Look for tables that might contain itinerary data
  $('table').each((i, table) => {
    const $table = $(table);
    const headers = [];
    $table.find('th').each((j, th) => {
      headers.push($(th).text().trim());
    });
    
    if (headers.some(h => h.toLowerCase().includes('date') || h.toLowerCase().includes('port'))) {
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
        url: successUrl,
        page_title: pageTitle,
        ship_heading: shipHeading,
        schedules_found: schedules.length,
        schedules: schedules.slice(0, 10), // Limit to first 10
        note: schedules.length === 0 ? 'No schedule tables found. The page structure might be different than expected.' : 'Schedule data extracted successfully'
      }, null, 2)
    }]
  };
}

async function handleShipDetails(args) {
  const { ship_name } = args;
  
  // Try to fetch the ship page
  const url = `https://www.cruisemapper.com/ships/${ship_name.toLowerCase().replace(/\s+/g, '-')}`;
  
  try {
    const $ = await scrapeCruiseMapper(url);
    
    // Extract ship details
    const details = {
      name: $('h1').first().text().trim() || ship_name,
      url: url
    };
    
    // Look for specification data
    $('div, span, td').each((i, el) => {
      const text = $(el).text().trim();
      
      if (text.includes('Gross tonnage:')) {
        details.gross_tonnage = text.replace('Gross tonnage:', '').trim();
      }
      if (text.includes('Passengers:')) {
        details.passengers = text.replace('Passengers:', '').trim();
      }
      if (text.includes('Length:') && !details.length) {
        details.length = text.replace('Length:', '').trim();
      }
      if (text.includes('Decks:') && !details.decks) {
        details.decks = text.replace('Decks:', '').trim();
      }
      if (text.includes('Year built:') && !details.year_built) {
        details.year_built = text.replace('Year built:', '').trim();
      }
    });
    
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
        text: `Could not fetch details for ${ship_name}: ${error.message}`
      }]
    };
  }
}

async function handlePortSchedule(args) {
  const { port_name } = args;
  const portSlug = port_name.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.cruisemapper.com/ports/${portSlug}`;
  
  try {
    const $ = await scrapeCruiseMapper(url);
    
    const portInfo = {
      port: port_name,
      url: url,
      page_title: $('title').text(),
      ships: []
    };
    
    // Look for ship arrival/departure information
    $('table').each((i, table) => {
      const $table = $(table);
      $table.find('tr').each((j, row) => {
        if (j === 0) return; // Skip header
        
        const shipData = {};
        $(row).find('td').each((k, cell) => {
          const text = $(cell).text().trim();
          if (k === 0) shipData.ship = text;
          else if (k === 1) shipData.arrival = text;
          else if (k === 2) shipData.departure = text;
          else if (k === 3) shipData.date = text;
        });
        
        if (shipData.ship) {
          portInfo.ships.push(shipData);
        }
      });
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...portInfo,
          ships_found: portInfo.ships.length,
          ships: portInfo.ships.slice(0, 20) // Limit results
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

async function handleCruiseByDate(args) {
  const { departure_date, destination } = args;
  const url = `https://www.cruisemapper.com/cruises`;
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        note: 'Date-based search requires more complex URL parameters',
        search_params: args,
        suggestion: 'Try searching for specific ships instead',
        url: url
      }, null, 2)
    }]
  };
}

// Start the server
async function main() {
  console.error('Starting CruiseMapper MCP server...');
  
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