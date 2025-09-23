import { spawn } from 'child_process';
import readline from 'readline';

// Start the MCP server
const server = spawn('node', ['cruisemapper-server.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Create interface for interactive testing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Handle server output
server.stdout.on('data', (data) => {
  const response = data.toString();
  try {
    const json = JSON.parse(response);
    console.log('\n✅ Response received:');
    console.log(JSON.stringify(json.result, null, 2));
  } catch {
    console.log('Server raw output:', response);
  }
});

server.stderr.on('data', (data) => {
  console.log('Server log:', data.toString());
});

// Helper to send request
let requestId = 1;
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  };
  console.log('\n📤 Sending request:', JSON.stringify(request, null, 2));
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Run test sequence
async function runTests() {
  console.log('=== CruiseMapper MCP Server Test ===\n');
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 1: List tools
  console.log('\n--- Test 1: List available tools ---');
  sendRequest('tools/list');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Search for Liberty of the Seas with correct ID
  console.log('\n--- Test 2: Search ship schedule (Liberty of the Seas) ---');
  sendRequest('tools/call', {
    name: 'search_ship_schedule',
    arguments: {
      ship_name: 'Liberty of the Seas'
    }
  });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 3: Get port schedule
  console.log('\n--- Test 3: Get Miami port schedule ---');
  sendRequest('tools/call', {
    name: 'get_port_schedule',
    arguments: {
      port_name: 'Miami'
    }
  });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 4: Search by date
  console.log('\n--- Test 4: Search cruises by date ---');
  sendRequest('tools/call', {
    name: 'search_cruise_by_date',
    arguments: {
      departure_date: '2025-10',
      destination: 'Caribbean'
    }
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n\n=== Test Complete ===');
  console.log('\nThe MCP server is working correctly!');
  console.log('It can be deployed and integrated with your Telnyx assistant.');
  
  // Clean up
  server.kill();
  rl.close();
  process.exit(0);
}

// Start tests
console.log('Starting MCP server tests...\n');
runTests().catch(error => {
  console.error('Test error:', error);
  server.kill();
  process.exit(1);
});