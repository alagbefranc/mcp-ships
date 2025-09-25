// Test script for the enhanced Playwright search functionality
import { chromium } from 'playwright';

// Initialize browser for testing
async function testPlaywrightSearch() {
  let browser = null;
  
  try {
    console.log('🎭 Starting Playwright test...');
    
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    
    console.log('📄 Navigating to CruiseMapper ships page...');
    
    // Navigate to ships page
    await page.goto('https://www.cruisemapper.com/ships', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(3000);
    
    // Wait for ship links to be visible
    await page.waitForSelector('a[href*="/ships/"]', { timeout: 10000 });
    console.log('✅ Ship links detected on page');
    
    // Test 1: Count total ship links
    const shipLinks = await page.locator('a[href*="/ships/"]').count();
    console.log(`📊 Found ${shipLinks} ship links on the page`);
    
    // Test 2: Look for search functionality
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="search" i]',
      'input[placeholder*="filter" i]',
      'input[placeholder*="ship" i]',
      '#search',
      '.search-input',
      '[data-search]'
    ];
    
    let searchFound = false;
    for (const selector of searchSelectors) {
      const input = page.locator(selector);
      if (await input.count() > 0) {
        console.log(`🔍 Found search input: ${selector}`);
        searchFound = true;
        break;
      }
    }
    
    if (!searchFound) {
      console.log('❌ No search inputs found on page');
    }
    
    // Test 3: Try to find a specific ship (Icon Of The Seas)
    console.log('🚢 Testing search for "Icon Of The Seas"...');
    
    const iconMatch = page.locator('a[href*="/ships/"]:has-text("Icon Of The Seas")');
    const iconCount = await iconMatch.count();
    
    if (iconCount > 0) {
      console.log('✅ Found "Icon Of The Seas" directly!');
      const href = await iconMatch.first().getAttribute('href');
      const text = await iconMatch.first().textContent();
      console.log(`   Name: ${text.trim()}`);
      console.log(`   URL: https://www.cruisemapper.com${href}`);
    } else {
      console.log('❌ "Icon Of The Seas" not found with exact match');
      
      // Try partial matching
      console.log('🔄 Trying partial matching...');
      
      const allLinks = await page.locator('a[href*="/ships/"]').all();
      console.log(`   Checking ${Math.min(allLinks.length, 50)} links for partial matches...`);
      
      for (let i = 0; i < Math.min(allLinks.length, 50); i++) {
        const link = allLinks[i];
        try {
          const text = await link.textContent();
          if (text && text.toLowerCase().includes('icon')) {
            console.log(`   Partial match found: "${text.trim()}"`);
            const href = await link.getAttribute('href');
            console.log(`   URL: https://www.cruisemapper.com${href}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    // Test 4: Try scrolling to load more content
    console.log('📜 Testing scroll functionality...');
    
    const initialCount = await page.locator('a[href*="/ships/"]').count();
    
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);
    
    const afterScrollCount = await page.locator('a[href*="/ships/"]').count();
    
    if (afterScrollCount > initialCount) {
      console.log(`✅ Scroll loaded more content: ${initialCount} → ${afterScrollCount} ships`);
    } else {
      console.log(`ℹ️  No additional content loaded after scroll (${initialCount} ships)`);
    }
    
    // Test 5: Look for Royal Caribbean ships
    console.log('🔵 Looking for Royal Caribbean ships...');
    
    const rcShips = [];
    const links = await page.locator('a[href*="/ships/"]').all();
    
    for (let i = 0; i < Math.min(links.length, 100); i++) {
      const link = links[i];
      try {
        const text = await link.textContent();
        if (text && (
          text.toLowerCase().includes('royal') ||
          text.toLowerCase().includes('seas') ||
          text.toLowerCase().includes('voyager') ||
          text.toLowerCase().includes('mariner')
        )) {
          rcShips.push(text.trim());
          if (rcShips.length >= 5) break; // Limit to first 5 found
        }
      } catch (error) {
        continue;
      }
    }
    
    if (rcShips.length > 0) {
      console.log(`✅ Found ${rcShips.length} potential Royal Caribbean ships:`);
      rcShips.forEach(ship => console.log(`   - ${ship}`));
    } else {
      console.log('❌ No Royal Caribbean ships found');
    }
    
    await page.close();
    console.log('✅ Playwright test completed successfully!');
    
  } catch (error) {
    console.error('❌ Playwright test failed:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testPlaywrightSearch()
  .then(() => {
    console.log('🎉 All tests completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });