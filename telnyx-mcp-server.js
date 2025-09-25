import express from 'express';
import cors from 'cors';
import { createSSEHandler } from './fixed-cruisemapper-server-enhanced.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Key authentication
const API_KEY = process.env.TELNYX_MCP_API_KEY || 'your-secure-api-key-here';

function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || 
                 req.headers['x-api-key'] ||
                 req.query.api_key;
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CruiseMapper MCP Server for Telnyx',
    version: '3.0.0',
    endpoints: {
      sse: '/mcp-stream',
      health: '/'
    }
  });
});

// SSE endpoint for Telnyx MCP integration
app.get('/mcp-stream', authenticateApiKey, createSSEHandler());

// Also support POST for tool calls (alternative method)
app.post('/mcp', authenticateApiKey, async (req, res) => {
  try {
    const { method, params } = req.body;
    
    if (method === 'tools/list') {
      res.json({
        tools: [
          {
            name: 'list_all_ships',
            description: 'Get a list of all cruise ships from CruiseMapper',
            inputSchema: {
              type: 'object',
              properties: {
                cruise_line: { type: 'string', description: 'Filter by cruise line' },
                limit: { type: 'integer', description: 'Max ships to return', default: 50 }
              }
            }
          },
          {
            name: 'get_ship_details',
            description: 'Get detailed information about a specific cruise ship',
            inputSchema: {
              type: 'object',
              properties: {
                ship_name: { type: 'string', description: 'Name of the cruise ship' }
              },
              required: ['ship_name']
            }
          },
          {
            name: 'search_ships',
            description: 'Search for ships by name',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'integer', description: 'Max results', default: 10 }
              },
              required: ['query']
            }
          }
        ]
      });
    } else if (method === 'tools/call') {
      // Handle tool calls - import your existing handlers
      const { handleListAllShips, handleShipFullDetails } = await import('./fixed-cruisemapper-server-enhanced.js');
      
      const { name, arguments: args } = params;
      let result;
      
      switch (name) {
        case 'list_all_ships':
          result = await handleListAllShips(args || {});
          break;
        case 'get_ship_details':
          result = await handleShipFullDetails(args || {});
          break;
        case 'search_ships':
          result = await handleShipSearch(args || {});
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      res.json(result);
    } else {
      res.status(400).json({ error: 'Unknown method' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚢 Telnyx MCP Server running on port ${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/mcp-stream`);
  console.log(`🔑 API Key required: ${API_KEY}`);
});

export default app;