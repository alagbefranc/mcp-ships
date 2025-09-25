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
  
  // Handle direct tool calls from Telnyx (compatibility layer)
  const directTools = [
    'list_all_ships', 'search_ship_schedule', 'get_ship_full_details',
    'get_port_schedule', 'search_cruise_by_date', 'get_cruise_lines'
  ];
  
  if (directTools.includes(method)) {
    console.log(`[${sessionId}] Converting direct tool call: ${method}`);
    const originalMethod = method;
    method = 'tools/call';
    params = {
      name: originalMethod,
      arguments: params || {}
    };
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

app.listen(PORT, () => {
  console.log(`CruiseMapper MCP Web Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Tools list: http://localhost:${PORT}/tools`);
});