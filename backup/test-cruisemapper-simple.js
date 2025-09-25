// Simple test for CruiseMapper scraping
import { chromium } from 'playwright';

async function testCruiseMapperScraping() {
  let browser = null;
  
  try {
    console.log('🎭 Testing CruiseMapper scraping...');
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    console.log('📄 Navigating to ships page...');
    await page.goto('https://www.cruisemapper.com/ships', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    
    // Check what selectors actually exist
    console.log('🔍 Checking available selectors...');
    
    const selectors = [
      'a[href*="/ships/"]',
      'a[href*="ships"]',
      'a[href*="ship"]',
      '.ship-link',
      '.cruise-ship',
      '[data-ship]'
    ];
    
    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      console.log(`   ${selector}: ${count} elements`);
    }
    
    // Get page content to analyze
    const content = await page.content();
    const hasShipLinks = content.includes('/ships/');
    const hasShipText = content.includes('ship');
    
    console.log(`📊 Page analysis:`);
    console.log(`   Contains '/ships/' links: ${hasShipLinks}`);
    console.log(`   Contains 'ship' text: ${hasShipText}`);
    console.log(`   Page title: ${await page.title()}`);
    console.log(`   URL: ${page.url()}`);
    
    // Try to find any links and log them
    const allLinks = await page.locator('a').count();
    console.log(`   Total links on page: ${allLinks}`);
    
    // Get first few links to see what we're dealing with
    const firstLinks = await page.locator('a').first(5).all();
    console.log('🔗 First few links:');
    for (let i = 0; i < firstLinks.length; i++) {
      const href = await firstLinks[i].getAttribute('href');
      const text = await firstLinks[i].textContent();
      console.log(`   ${i + 1}. "${text?.trim()}" -> ${href}`);
    }
    
    await page.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testCruiseMapperScraping();