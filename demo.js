const puppeteer = require('puppeteer');

async function scrapeAndExtract(url) {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Go to the page and wait for it to load
        await page.goto(url, { waitUntil: 'load', timeout: 0 });

        // Wait for the '.ten.columns h1' selector to appear
        await page.waitForSelector('.ten.columns h1', { timeout: 10000 });

        // Extract the h1 text, logo URL, additional IPO meta data, prospectus link, and IPO schedule
        const result = await page.evaluate(() => {
            const h1Element = document.querySelector('.ten.columns h1');
            const logoElement = document.querySelector('.ipo-logo img');

            // Extract IPO meta data
            const ipoDate = document.querySelector('.row.ipo-meta .four.columns:nth-child(1) .value')?.textContent.trim() || '';
            const listingDate = document.querySelector('.row.ipo-meta .four.columns:nth-child(2) .value')?.textContent.trim() || '';
            
            // Improved price range extraction and formatting
            const priceRangeElement = document.querySelector('.row.ipo-meta .three.columns .value');
            let priceRange = '';
            if (priceRangeElement) {
                const priceText = priceRangeElement.textContent
                    .trim()
                    .split('\n')[0]  // Take only the first line
                    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                    .trim();
                    
                // Extract only the price range portion
                const matches = priceText.match(/(₹\d+)\s*–\s*(₹\d+)/);
                if (matches) {
                    priceRange = `${matches[1]} – ${matches[2]}`;
                }
            }

            const issueSize = document.querySelector('.row.ipo-meta .two.columns .value')?.textContent.trim() || '';

            // Extract the "Download prospectus" link
            const prospectusLink = document.querySelector('.six.columns.text-right a')?.href || '';

            // Extract IPO schedule data
            const scheduleRows = document.querySelectorAll('.ipo-schedule tr');
            const schedule = {};
            scheduleRows.forEach(row => {
                const label = row.querySelector('.ipo-schedule-label')?.textContent.trim() || '';
                const date = row.querySelector('.ipo-schedule-date')?.textContent.trim() || '';
                if (label && date) {
                    // Format schedule as label: date
                    schedule[label] = date;
                }
            });

            return {
                h1Text: h1Element ? h1Element.textContent.trim().split('\n')[0] : '',
                logoURL: logoElement ? logoElement.src : '',
                ipoDate,
                listingDate,
                priceRange,
                issueSize,
                prospectusLink,
                ipoSchedule: schedule
            };
        });

        // Close the browser
        await browser.close();

        // Log the results as a JSON object for REST API
        const jsonResponse = {
            ipoDetails: {
                h1Text: result.h1Text,
                logoURL: result.logoURL,
                ipoDate: result.ipoDate,
                listingDate: result.listingDate,
                priceRange: result.priceRange,
                issueSize: result.issueSize,
                prospectusLink: result.prospectusLink,
                ipoSchedule: result.ipoSchedule
            }
        };

        console.log('Extracted Data:', JSON.stringify(jsonResponse, null, 2));

        return jsonResponse;
    } catch (error) {
        console.error('Error:', error);
    }
}

// URL to scrape
const url = 'https://zerodha.com/ipo/402383/capitalnumbers-infotech/';

// Execute the function
scrapeAndExtract(url)
    .then((result) => {
        // Handle success, possibly send the result to an API
    })
    .catch((error) => {
        console.error('Error while scraping:', error);
    });
