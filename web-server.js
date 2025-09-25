import express from 'express';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;
const activeServers = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'CruiseMapper MCP Server',
    version: '2.0.0',
    active_sessions: activeServers.size
  });
});

// MCP request endpoint
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['x-session-id'] || uuidv4();
  let { method, params, id } = req.body;
  
  console.log(`[${sessionId}] Received request:`, method);
  console.log(`[${sessionId}] Raw body:`, JSON.stringify(req.body, null, 2));
  console.log(`[${sessionId}] Params type:`, typeof params, 'Value:', params);
  
  // Handle different Telnyx webhook formats
  // Format 1: Standard MCP format {"method": "tool_name", "params": {...}}
  // Format 2: Telnyx AI Assistant webhook format
  // Format 3: Direct tool call format
  
  const directTools = [
    'list_all_ships', 'search_ship_schedule', 'get_ship_full_details',
    'get_port_schedule', 'search_cruise_by_date', 'get_cruise_lines'
  ];
  
  // Check if this is a Telnyx AI Assistant webhook calling a tool directly
  if (directTools.includes(method)) {
    console.log(`[${sessionId}] Processing direct tool call: ${method}`);
    const originalMethod = method;
    method = 'tools/call';
    
    // Extract parameters from various possible formats
    let arguments_obj = {};
    
    // Handle Telnyx AI Assistant webhook body parameters
    // When Telnyx sends webhook with body parameters, they come as individual fields
    if (originalMethod === 'get_ship_full_details' || originalMethod === 'search_ship_schedule') {
      // Look for ship_name parameter in different places
      if (params && typeof params === 'object' && params.ship_name) {
        arguments_obj.ship_name = params.ship_name;
      } else if (typeof params === 'string' && params.trim()) {
        arguments_obj.ship_name = params.trim();
      } else if (req.body.ship_name) {
        arguments_obj.ship_name = req.body.ship_name;
      } else {
        // Look through all body keys and values for potential ship name
        // Telnyx might send ship name as either a key or a value
        const skipFields = ['method', 'id', 'jsonrpc', 'params'];
        
        // First, try to find ship name in keys (when Telnyx sends ship name as a key)
        const potentialShipNameFromKeys = Object.keys(req.body)
          .filter(key => 
            !skipFields.includes(key) && 
            key.trim() && 
            key !== originalMethod &&
            key.length > 2 // Ship names should be longer than 2 characters
          )
          .find(key => key.length > 0);
        
        // Then try to find ship name in values
        const potentialShipNameFromValues = Object.entries(req.body)
          .filter(([key, value]) => 
            !skipFields.includes(key) && 
            typeof value === 'string' && 
            value.trim() && 
            value !== originalMethod &&
            value.length > 2
          )
          .map(([key, value]) => value.trim())
          .find(value => value.length > 0);
        
        const potentialShipName = potentialShipNameFromKeys || potentialShipNameFromValues;
        
        if (potentialShipName) {
          arguments_obj.ship_name = potentialShipName;
        }
      }
      
      // Validate we have a ship name
      if (!arguments_obj.ship_name) {
        console.error(`[${sessionId}] No ship_name found for ${originalMethod}`);
        return res.status(400).json({
          jsonrpc: '2.0',
          id: id || 1,
          error: {
            code: -32602,
            message: 'ship_name parameter is required'
          }
        });
      }
      
    } else if (originalMethod === 'get_port_schedule') {
      // Handle port name similarly
      if (params && typeof params === 'object' && params.port_name) {
        arguments_obj.port_name = params.port_name;
      } else if (typeof params === 'string' && params.trim()) {
        arguments_obj.port_name = params.trim();
      } else if (req.body.port_name) {
        arguments_obj.port_name = req.body.port_name;
      } else {
        // Look through all body keys and values for potential port name
        const skipFields = ['method', 'id', 'jsonrpc', 'params'];
        
        // First, try to find port name in keys
        const potentialPortNameFromKeys = Object.keys(req.body)
          .filter(key => 
            !skipFields.includes(key) && 
            key.trim() && 
            key !== originalMethod &&
            key.length > 2
          )
          .find(key => key.length > 0);
        
        // Then try to find port name in values
        const potentialPortNameFromValues = Object.entries(req.body)
          .filter(([key, value]) => 
            !skipFields.includes(key) && 
            typeof value === 'string' && 
            value.trim() && 
            value !== originalMethod &&
            value.length > 2
          )
          .map(([key, value]) => value.trim())
          .find(value => value.length > 0);
        
        const potentialPortName = potentialPortNameFromKeys || potentialPortNameFromValues;
        
        if (potentialPortName) {
          arguments_obj.port_name = potentialPortName;
        }
      }
      
      if (!arguments_obj.port_name) {
        console.error(`[${sessionId}] No port_name found for ${originalMethod}`);
        return res.status(400).json({
          jsonrpc: '2.0',
          id: id || 1,
          error: {
            code: -32602,
            message: 'port_name parameter is required'
          }
        });
      }
      
    } else if (originalMethod === 'list_all_ships') {
      // Handle list parameters
      if (params && typeof params === 'object') {
        arguments_obj = { ...params };
      }
      
      // Override with direct body parameters if available
      if (req.body.limit) {
        const limitNum = parseInt(req.body.limit);
        if (!isNaN(limitNum)) arguments_obj.limit = limitNum;
      }
      if (req.body.cruise_line) {
        arguments_obj.cruise_line = req.body.cruise_line;
      }
      
      // Set defaults
      if (!arguments_obj.limit) arguments_obj.limit = 50;
      
    } else if (originalMethod === 'search_cruise_by_date') {
      // Handle cruise search parameters
      if (params && typeof params === 'object') {
        arguments_obj = { ...params };
      }
      
      if (req.body.departure_date) arguments_obj.departure_date = req.body.departure_date;
      if (req.body.destination) arguments_obj.destination = req.body.destination;
      
    } else if (originalMethod === 'get_cruise_lines') {
      // No parameters needed for cruise lines
      arguments_obj = {};
    }
    
    params = {
      name: originalMethod,
      arguments: arguments_obj
    };
    
    console.log(`[${sessionId}] Converted to MCP format:`);
    console.log(`[${sessionId}] - Method: ${method}`);
    console.log(`[${sessionId}] - Params:`, JSON.stringify(params, null, 2));
  }
  
  try {
    // Get or create MCP server for this session
    let server = activeServers.get(sessionId);
    if (!server) {
      server = spawn('node', ['cruisemapper-server-enhanced.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      server.responses = new Map();
      server.buffer = '';
      
      // Handle server output
      server.stdout.on('data', (data) => {
        server.buffer += data.toString();
        
        // Try to parse complete JSON messages
        const lines = server.buffer.split('\n');
        server.buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id && server.responses.has(response.id)) {
                const resolver = server.responses.get(response.id);
                server.responses.delete(response.id);
                resolver(response);
              }
            } catch (e) {
              console.error('Failed to parse response:', e);
            }
          }
        }
      });
      
      server.stderr.on('data', (data) => {
        console.log(`[${sessionId}] Server log:`, data.toString());
      });
      
      server.on('error', (error) => {
        console.error(`[${sessionId}] Server error:`, error);
        activeServers.delete(sessionId);
      });
      
      server.on('exit', (code) => {
        console.log(`[${sessionId}] Server exited with code ${code}`);
        activeServers.delete(sessionId);
      });
      
      activeServers.set(sessionId, server);
      
      // Clean up old sessions after 5 minutes
      setTimeout(() => {
        if (activeServers.has(sessionId)) {
          server.kill();
          activeServers.delete(sessionId);
        }
      }, 5 * 60 * 1000);
    }
    
    // Send request to MCP server
    const request = {
      jsonrpc: '2.0',
      id: id || Date.now(),
      method,
      params: params || {}
    };
    
    // Create promise for response
    const responsePromise = new Promise((resolve) => {
      server.responses.set(request.id, resolve);
    });
    
    // Send request
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Wait for response with timeout
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), 30000)
    );
    
    const response = await Promise.race([responsePromise, timeout]);
    
    res.json(response);
    
  } catch (error) {
    console.error(`[${sessionId}] Error:`, error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// List tools endpoint for easier testing
app.get('/tools', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/list',
        params: {},
        id: 1
      })
    });
    
    const data = await response.json();
    res.json(data.result?.tools || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to see what Telnyx is sending
app.post('/debug', (req, res) => {
  console.log('DEBUG - Headers:', req.headers);
  console.log('DEBUG - Body:', JSON.stringify(req.body, null, 2));
  console.log('DEBUG - Raw body type:', typeof req.body);
  
  res.json({
    received: {
      headers: req.headers,
      body: req.body,
      body_type: typeof req.body
    }
  });
});

app.listen(PORT, () => {
  console.log(`CruiseMapper MCP Web Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Tools list: http://localhost:${PORT}/tools`);
});