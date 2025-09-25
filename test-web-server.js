async function testWebServer() {
  const baseUrl = 'http://localhost:8080';
  
  console.log('Testing CruiseMapper MCP Web Server...\n');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health check...');
    const healthRes = await fetch(baseUrl);
    const health = await healthRes.json();
    console.log('✓ Health check:', health);
    
    // Test 2: List tools
    console.log('\n2. Testing tools list...');
    const toolsRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/list',
        params: {},
        id: 1
      })
    });
    const tools = await toolsRes.json();
    console.log('✓ Available tools:', tools.result.tools.map(t => t.name));
    
    // Test 3: List all ships
    console.log('\n3. Testing list_all_ships...');
    const shipsRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'tools/call',
        params: {
          name: 'list_all_ships',
          arguments: { limit: 5 }
        },
        id: 2
      })
    });
    const ships = await shipsRes.json();
    const shipsData = JSON.parse(ships.result.content[0].text);
    console.log(`✓ Found ${shipsData.total_found} ships, showing first ${shipsData.returned}:`);
    shipsData.ships.forEach(ship => console.log(`  - ${ship.name} (ID: ${ship.id})`));
    
    console.log('\n✅ All tests passed!');
    console.log('\nWeb server is ready for deployment to Render.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Wait a moment for server to start
setTimeout(testWebServer, 2000);

console.log('Make sure to start the web server first with: node web-server.js');