#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

console.error('Starting CruiseMapper MCP Server...');

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

// Tools list
const TOOLS = [
  {
    name: 'search_ship_schedule',
    description: 'Search for a specific cruise ship schedule',
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
    name: 'get_ship_details',
    description: 'Get details about a cruise ship',
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
  }
];

// Setup handlers after creating server
server.setRequestHandler({
  listTools: async () => ({ tools: TOOLS }),
  
  callTool: async (name, args) => {
    console.error(`Tool called: ${name} with args:`, args);
    
    if (name === 'search_ship_schedule') {
      const { ship_name } = args;
      const shipSlug = ship_name.toLowerCase().replace(/\s+/g, '-');
      const url = `https://www.cruisemapper.com/ships/${shipSlug}`;
      
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const $ = cheerio.load(response.data);
        const title = $('h1').first().text().trim();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ship_name,
              url,
              page_title: title,
              status: 'Successfully connected to CruiseMapper'
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text', 
            text: `Error fetching data: ${error.message}`
          }]
        };
      }
    }
    
    if (name === 'get_ship_details') {
      return {
        content: [{
          type: 'text',
          text: `Getting details for ship: ${args.ship_name}`
        }]
      };
    }
    
    throw new Error(`Unknown tool: ${name}`);
  }
});

// Connect to transport
const transport = new StdioServerTransport();

server.connect(transport).then(() => {
  console.error('Server connected and ready');
}).catch((error) => {
  console.error('Failed to connect:', error);
  process.exit(1);
});