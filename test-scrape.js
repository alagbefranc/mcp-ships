import axios from 'axios';
import * as cheerio from 'cheerio';

async function testCruiseMapper() {
  console.log('Testing CruiseMapper connection...\n');
  
  // CruiseMapper uses ship-name-ID format
  const tests = [
    { name: 'Liberty of the Seas', url: 'https://www.cruisemapper.com/ships/Liberty-of-the-Seas-542' },
    { name: 'Main ships page', url: 'https://www.cruisemapper.com/ships' }
  ];
  
  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    console.log(`URL: ${test.url}\n`);
    
    try {
      const response = await axios.get(test.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      console.log('✓ Page fetched successfully!');
      console.log('Page title:', $('title').text());
      console.log('H1:', $('h1').first().text().trim());
      
      // Try to find ship information
      const shipInfo = {};
      
      // Look for key information
      $('div, span, td').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('Gross tonnage') && !shipInfo.tonnage) {
          shipInfo.tonnage = text;
        }
        if (text.includes('Passengers') && !shipInfo.passengers) {
          shipInfo.passengers = text;
        }
        if (text.includes('Length') && text.includes('m') && !shipInfo.length) {
          shipInfo.length = text;
        }
      });
      
      console.log('\nShip info found:', shipInfo);
      
      // Check for tables
      const tables = $('table').length;
      console.log(`Number of tables found: ${tables}`);
      
      // Check for cruise schedule elements
      const scheduleElements = $('[class*="schedule"], [class*="itinerary"], [class*="cruise"]').length;
      console.log(`Schedule-related elements: ${scheduleElements}`);
      
      // Sample some actual content
      console.log('\nFirst 3 links found:');
      $('a').slice(0, 3).each((i, el) => {
        console.log(`  - ${$(el).text().trim()}: ${$(el).attr('href')}`);
      });
      
    } catch (error) {
      console.error('✗ Error:', error.message);
      if (error.response) {
        console.error('  Status:', error.response.status);
        console.error('  Status Text:', error.response.statusText);
      }
    }
  }
  
  console.log('\n=== Test complete ===');
}

testCruiseMapper();