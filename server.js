#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Create MCP server instance
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
      }
    });
    return cheerio.load(response.data);
  } catch (error) {
    console.error('Error scraping:', error.message);
    throw new Error(`Failed to fetch data from CruiseMapper: ${error.message}`);
  }
}

// List available tools
server.listTools(async () => {
  return [
    {
      name: 'search_ship_schedule',
      description: 'Search for a specific cruise ship\'s schedule and itinerary',
      inputSchema: {
        type: 'object',
        properties: {
          ship_name: {
            type: 'string',
            description: 'Name of the cruise ship (e.g., "Liberty of the Seas")'
          },
          year: {
            type: 'string',
            description: 'Year to search (optional, e.g., "2025")'
          },
          month: {
            type: 'string',
            description: 'Month to search (optional, e.g., "October")'
          }
        },
        required: ['ship_name']
      }
    },
    {
      name: 'get_ship_details',
      description: 'Get detailed information about a specific cruise ship',
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
      name: 'search_cruise_by_date',
      description: 'Search for cruises by departure date, destination, or cruise line',
      inputSchema: {
        type: 'object',
        properties: {
          departure_date: {
            type: 'string',
            description: 'Departure date (YYYY-MM-DD format)'
          },
          destination: {
            type: 'string',
            description: 'Destination region (e.g., "Caribbean", "Mediterranean")'
          },
          cruise_line: {
            type: 'string',
            description: 'Cruise line name (e.g., "Royal Caribbean")'
          }
        }
      }
    },
    {
      name: 'get_port_schedule',
      description: 'Get ship arrivals/departures for a specific port',
      inputSchema: {
        type: 'object',
        properties: {
          port_name: {
            type: 'string',
            description: 'Name of the port (e.g., "Miami", "Barcelona")'
          },
          date: {
            type: 'string',
            description: 'Specific date to check (optional, YYYY-MM-DD)'
          }
        },
        required: ['port_name']
      }
    }
  ];
});

// Handle tool calls
server.callTool(async (name, args) => {
  console.error(`Tool called: ${name}`, args);
  
  if (name === 'search_ship_schedule') {
    const { ship_name, year, month } = args;
    
    // Build search URL - convert ship name to URL format
    const shipSlug = ship_name.toLowerCase().replace(/\s+/g, '-');
    const searchUrl = `https://www.cruisemapper.com/ships/${shipSlug}`;
    
    try {
      const $ = await scrapeCruiseMapper(searchUrl);
      
      // Extract schedule data - adjust selectors based on actual HTML structure
      const schedules = [];
      
      // Look for itinerary tables or schedule listings
      $('.schedule-table tr, .itinerary tr, table.cruises tr').each((i, el) => {
        if (i === 0) return; // Skip header
        
        const date = $(el).find('td:nth-child(1)').text().trim();
        const port = $(el).find('td:nth-child(2)').text().trim();
        const arrival = $(el).find('td:nth-child(3)').text().trim();
        const departure = $(el).find('td:nth-child(4)').text().trim();
        
        if (date && port) {
          schedules.push({
            date,
            port,
            arrival: arrival || 'N/A',
            departure: departure || 'N/A'
          });
        }
      });
      
      // If no schedules found with those selectors, try to extract any cruise info
      if (schedules.length === 0) {
        $('div.cruise-item, div.itinerary-item').each((i, el) => {
          const cruiseText = $(el).text();
          if (cruiseText) {
            schedules.push({
              info: cruiseText.trim().substring(0, 200)
            });
          }
        });
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ship_name,
            url: searchUrl,
            schedule_count: schedules.length,
            schedules: schedules.slice(0, 20),
            note: schedules.length === 0 ? 'No schedules found - page structure may have changed' : null
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Could not find schedule for ${ship_name}: ${error.message}`
        }]
      };
    }
  }
  
  if (name === 'get_ship_details') {
    const { ship_name } = args;
    const shipSlug = ship_name.toLowerCase().replace(/\s+/g, '-');
    const detailsUrl = `https://www.cruisemapper.com/ships/${shipSlug}`;
    
    try {
      const $ = await scrapeCruiseMapper(detailsUrl);
      
      // Extract ship details - these selectors will need adjustment based on actual HTML
      const details = {
        name: $('h1').first().text().trim() || ship_name,
        cruise_line: $('span.cruise-line, div.cruise-line').first().text().trim(),
        capacity: $('*:contains("Passengers")').parent().find('span, strong').text().trim(),
        gross_tonnage: $('*:contains("Tonnage")').parent().find('span, strong').text().trim(),
        length: $('*:contains("Length")').parent().find('span, strong').text().trim(),
        decks: $('*:contains("Decks")').parent().find('span, strong').text().trim(),
        year_built: $('*:contains("Year")').parent().find('span, strong').text().trim(),
        raw_info: $('.ship-details, .vessel-details').text().substring(0, 500)
      };
      
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
          text: `Could not find details for ${ship_name}: ${error.message}`
        }]
      };
    }
  }
  
  if (name === 'search_cruise_by_date') {
    const { departure_date, destination, cruise_line } = args;
    const searchUrl = `https://www.cruisemapper.com/cruises`;
    
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (departure_date) params.append('date', departure_date);
      if (destination) params.append('destination', destination);
      if (cruise_line) params.append('line', cruise_line);
      
      const fullUrl = params.toString() ? `${searchUrl}?${params.toString()}` : searchUrl;
      const $ = await scrapeCruiseMapper(fullUrl);
      
      const cruises = [];
      $('.cruise-result, .cruise-item, tr.cruise').each((i, el) => {
        const cruise = {
          ship: $(el).find('.ship-name, td:nth-child(1)').text().trim(),
          line: $(el).find('.cruise-line, td:nth-child(2)').text().trim(),
          departure: $(el).find('.departure-date, td:nth-child(3)').text().trim(),
          duration: $(el).find('.duration, td:nth-child(4)').text().trim(),
          itinerary: $(el).find('.itinerary, td:nth-child(5)').text().trim(),
          price: $(el).find('.price, td:nth-child(6)').text().trim()
        };
        
        if (cruise.ship) {
          cruises.push(cruise);
        }
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            search_params: { departure_date, destination, cruise_line },
            result_count: cruises.length,
            cruises: cruises.slice(0, 10)
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Search failed: ${error.message}`
        }]
      };
    }
  }
  
  if (name === 'get_port_schedule') {
    const { port_name, date } = args;
    const portSlug = port_name.toLowerCase().replace(/\s+/g, '-');
    const portUrl = `https://www.cruisemapper.com/ports/${portSlug}`;
    
    try {
      const $ = await scrapeCruiseMapper(portUrl);
      
      const ships = [];
      $('.port-schedule tr, .schedule tr, table tr').each((i, el) => {
        if (i === 0) return;
        
        const ship = {
          name: $(el).find('td:nth-child(1)').text().trim(),
          line: $(el).find('td:nth-child(2)').text().trim(),
          arrival: $(el).find('td:nth-child(3)').text().trim(),
          departure: $(el).find('td:nth-child(4)').text().trim(),
          date: $(el).find('td:nth-child(5)').text().trim()
        };
        
        if (ship.name) {
          ships.push(ship);
        }
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            port: port_name,
            date: date || 'all dates',
            ships_count: ships.length,
            ships: ships.slice(0, 15)
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Could not get port schedule: ${error.message}`
        }]
      };
    }
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CruiseMapper MCP server running on stdio transport');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});