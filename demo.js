const puppeteer = require('puppeteer');
const readline = require('readline');
const axios = require('axios'); // Ensure axios is imported

async function scrapeAndExtract(url) {
    try {
        const browser = await puppeteer.launch({
            headless: "new", // Ensure your Puppeteer version supports "new"
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

            // Get IPO description
            const ipoDescription = document.evaluate(
                "//h2[contains(text(), 'About')]/following-sibling::p",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.textContent.trim() || '';

            const IPOName = getTextContent('.ten.columns h1').replace(/\s+/g, ' ').trim() || '';
            const logoElement = document.querySelector('.ipo-logo img');
            const logoURL = logoElement ? logoElement.src : '';

            const ipoDate = getTextContent('.row.ipo-meta .four.columns:nth-child(1) .value');
            const listingDate = getTextContent('.row.ipo-meta .four.columns:nth-child(2) .value');

            let priceRange = '';
            let lotSize = '';
            let ipoType = 'IPO';
            const priceRangeElement = document.querySelector('.row.ipo-meta .three.columns .value');
            if (priceRangeElement) {
                const priceText = priceRangeElement.textContent.trim();
                const matches = priceText.match(/(₹\d+)\s*–\s*(₹\d+)/);
                if (matches) {
                    priceRange = `${matches[1]} – ${matches[2]}`;
                }

                const lotSizeMatch = priceText.match(/Lot size[^0-9]*(\d+)[^0-9]*₹(\d+)/);
                if (lotSizeMatch) {
                    lotSize = lotSizeMatch[1];
                    const amount = parseInt(lotSizeMatch[2]);
                    ipoType = amount > 16000 ? 'SME-IPO' : 'IPO';
                }
            }

            const issueSize = getTextContent('.row.ipo-meta .two.columns .value');
            const prospectusLink = document.querySelector('.six.columns.text-right a')?.href || '';

            const schedule = {};
            const scheduleRows = document.querySelectorAll('.ipo-schedule tr');
            scheduleRows.forEach(row => {
                const label = row.querySelector('.ipo-schedule-label')?.textContent.trim();
                const date = row.querySelector('.ipo-schedule-date')?.textContent.trim();
                if (label && date) {
                    schedule[label] = date.replace(/\s+/g, ' ');
                }
            });

            const tableData = {};
            const tableRows = document.querySelectorAll('.mini-container.content table tbody tr');
            tableRows.forEach((row, index) => {
                if (index > 0) {
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

            // Extracting Strengths (second h2 in mini-container)
            const strengths = [];
            const strengthsElements = document.querySelectorAll('.mini-container h2:nth-of-type(2) + ul li');
            strengthsElements.forEach((item) => {
                strengths.push(item.textContent.trim());
            });

            // Extracting Risks (third h2 in mini-container)
            const risks = [];
            const risksElements = document.querySelectorAll('.mini-container h2:nth-of-type(3) + ul li');
            risksElements.forEach((item) => {
                risks.push(item.textContent.trim());
            });

            const allotmentLink = document.evaluate(
                "//h2[contains(text(), 'Allotment Status')]/following-sibling::p/a",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.href || '';

            return {
                IPOName,
                logoURL,
                ipoDate,
                listingDate,
                priceRange,
                lotSize,
                ipoType,
                issueSize,
                prospectusLink,
                ipoSchedule: schedule,
                ipoDescription,
                issueSizeDetails: tableData,
                strengths, // Added strengths data
                risks,
                allotmentLink
            };
        });

        await browser.close();

        const jsonResponse = {
            ...result,
            IPOLink: url
        };

        console.log('Extracted Data:', JSON.stringify(jsonResponse, null, 2));

        try {
            const response = await axios.post("http://localhost:3000/api/upload-ipo", jsonResponse, {
                headers: { "Content-Type": "application/json" }
            });
            console.log(response.data, "Data successfully sent to the server:");
        } catch (postError) {
            console.error("Error sending data to the server:", postError.message);
        }

        return jsonResponse;
    } catch (error) {
        console.error('Scraping Error:', error);
        throw error;
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Please enter the URL: ', (url) => {
    scrapeAndExtract(url)
        .then(() => {
            console.log('Scraping completed successfully');
        })
        .catch((error) => {
            console.error('Error while scraping:', error);
        })
        .finally(() => {
            rl.close();
        });
});
