#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

class CruiseMapperServer {
  constructor() {
    this.server = new Server(
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

    this.setupHandlers();
  }

  setupHandlers() {
    // Handle list tools request
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'search_ship_schedule',
          description: 'Search for a specific cruise ship\'s schedule and itinerary',
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
                description: 'Destination region (e.g., "Caribbean")'
              },
              cruise_line: {
                type: 'string',
                description: 'Cruise line name'
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
                description: 'Name of the port (e.g., "Miami")'
              }
            },
            required: ['port_name']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      console.error('Tool called:', name, JSON.stringify(args));

      try {
        switch (name) {
          case 'search_ship_schedule':
            return await this.searchShipSchedule(args);
          case 'get_ship_details':
            return await this.getShipDetails(args);
          case 'search_cruise_by_date':
            return await this.searchCruiseByDate(args);
          case 'get_port_schedule':
            return await this.getPortSchedule(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error('Error in tool call:', error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    });
  }

  async scrapePage(url) {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return cheerio.load(response.data);
  }

  async searchShipSchedule(args) {
    const { ship_name } = args;
    const shipSlug = ship_name.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.cruisemapper.com/ships/${shipSlug}`;
    
    try {
      const $ = await this.scrapePage(url);
      
      // Test response - we'll extract basic info for now
      const pageTitle = $('h1').first().text().trim();
      const metaInfo = $('meta[name="description"]').attr('content') || '';
      
      // Try to find any tables with cruise data
      const tables = $('table').length;
      const divs = $('div').length;
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ship_name,
            url,
            page_title: pageTitle,
            meta_description: metaInfo,
            stats: {
              tables_found: tables,
              divs_found: divs
            },
            note: 'Successfully connected to CruiseMapper'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Could not fetch data for ${ship_name}: ${error.message}`
        }]
      };
    }
  }

  async getShipDetails(args) {
    const { ship_name } = args;
    const shipSlug = ship_name.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.cruisemapper.com/ships/${shipSlug}`;
    
    try {
      const $ = await this.scrapePage(url);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ship_name,
            url,
            page_title: $('h1').first().text().trim(),
            description: $('meta[name="description"]').attr('content') || 'No description found'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting ship details: ${error.message}`
        }]
      };
    }
  }

  async searchCruiseByDate(args) {
    const { departure_date, destination, cruise_line } = args;
    const url = `https://www.cruisemapper.com/cruises`;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          search_params: { departure_date, destination, cruise_line },
          url,
          note: 'Search by date functionality ready'
        }, null, 2)
      }]
    };
  }

  async getPortSchedule(args) {
    const { port_name } = args;
    const portSlug = port_name.toLowerCase().replace(/\s+/g, '-');
    const url = `https://www.cruisemapper.com/ports/${portSlug}`;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          port: port_name,
          url,
          note: 'Port schedule functionality ready'
        }, null, 2)
      }]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('CruiseMapper MCP server started successfully');
  }
}

// Start the server
const server = new CruiseMapperServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});