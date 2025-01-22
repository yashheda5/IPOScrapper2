const puppeteer = require('puppeteer');

(async function scrapeFullPage() {
  try {
    // Launch the browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Go to the target URL
    await page.goto('https://zerodha.com/ipo/402509/ema-partners-india/');

    // Get the entire HTML content of the page
    const pageContent = await page.content();

    // Log the full HTML of the page
    console.log(pageContent);

    // Close the browser
    await browser.close();
  } catch (error) {
    console.error("Error scraping page content:", error);
  }
})();
