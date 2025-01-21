const puppeteer = require('puppeteer');

async function scrapeAndExtract(url) {
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        // Navigate to the page and wait for content to load
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        
        const result = await page.evaluate(() => {
            // Helper function to safely get text content
            const getTextContent = (selector) => {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : '';
            };

            // Get IPO description - using a more specific selector
            const descriptionSelector = '.row.between .six.columns h2:contains("About") + p';
            const ipoDescription = document.evaluate(
                "//h2[contains(text(), 'About')]/following-sibling::p",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.textContent.trim() || '';

            // Basic data extraction with error handling
            const IPOName = getTextContent('.ten.columns h1').replace(/\s+/g, ' ').trim() || '';
            const logoElement = document.querySelector('.ipo-logo img');
            const logoURL = logoElement ? logoElement.src : '';

            // Meta data extraction
            const ipoDate = getTextContent('.row.ipo-meta .four.columns:nth-child(1) .value');
            const listingDate = getTextContent('.row.ipo-meta .four.columns:nth-child(2) .value');
            
            // Price range extraction with better error handling
            let priceRange = '';
            const priceRangeElement = document.querySelector('.row.ipo-meta .three.columns .value');
            if (priceRangeElement) {
                const priceText = priceRangeElement.textContent
                    .trim()
                    .split('\n')[0]
                    .replace(/\s+/g, ' ')
                    .trim();
                const matches = priceText.match(/(₹\d+)\s*–\s*(₹\d+)/);
                if (matches) {
                    priceRange = `${matches[1]} – ${matches[2]}`;
                }
            }

            const issueSize = getTextContent('.row.ipo-meta .two.columns .value');
            const prospectusLink = document.querySelector('.six.columns.text-right a')?.href || '';

            // Schedule extraction with error handling
            const schedule = {};
            const scheduleRows = document.querySelectorAll('.ipo-schedule tr');
            scheduleRows.forEach(row => {
                const label = row.querySelector('.ipo-schedule-label')?.textContent.trim();
                const date = row.querySelector('.ipo-schedule-date')?.textContent.trim();
                if (label && date) {
                    schedule[label] = date;
                }
            });

            // Extract table data from the "Issue size" section
            const tableData = {};
            const tableRows = document.querySelectorAll('.mini-container.content table tbody tr');
            tableRows.forEach((row, index) => {
                if (index > 0) { // Skip header row
                    const cells = row.querySelectorAll('td');
                    if (cells.length === 2) {
                        const key = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();
                        if (key !== 'Purpose') {
                            tableData[key] = value;
                        }
                    }
                }
            });

            return {
                IPOName,
                logoURL,
                ipoDate,
                listingDate,
                priceRange,
                issueSize,
                prospectusLink,
                ipoSchedule: schedule,
                ipoDescription,
                issueSizeDetails: tableData
            };
        });

        await browser.close();

        // Create the response object without validation
        const jsonResponse = {
            ipoDetails: result
        };

        console.log('Extracted Data:', JSON.stringify(jsonResponse, null, 2));
        return jsonResponse;

    } catch (error) {
        console.error('Scraping Error:', error);
        throw error;
    }
}

const url = 'https://zerodha.com/ipo/402383/capitalnumbers-infotech/';

scrapeAndExtract(url)
    .then((result) => {
        console.log('Scraping completed successfully');
    })
    .catch((error) => {
        console.error('Error while scraping:', error);
    });