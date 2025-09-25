import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('node', ['cruisemapper-server.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle server output
server.stdout.on('data', (data) => {
  console.log('Server:', data.toString());
});

server.stderr.on('data', (data) => {
  console.log('Server log:', data.toString());
});

// Send a test request to list tools
setTimeout(() => {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
}, 1000);

// Send a test tool call
setTimeout(() => {
  const request = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'get_ship_details',
      arguments: {
        ship_name: 'Liberty of the Seas'
      }
    }
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
}, 2000);

// Clean up after 5 seconds
setTimeout(() => {
  server.kill();
  process.exit(0);
}, 5000);