const puppeteer = require('puppeteer');
const readline = require('readline');

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
            let lotSize = '';
            let ipoType = 'IPO';  // Default value
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
                
                // Extract lot size and amount
                const lotSizeText = priceRangeElement.textContent.trim();
                const lotSizeMatch = lotSizeText.match(/Lot size[^0-9]*(\d+)[^0-9]*₹(\d+)/);
                if (lotSizeMatch) {
                    lotSize = lotSizeMatch[1];
                    // Determine IPO type based on amount
                    const amount = parseInt(lotSizeMatch[2]);
                    ipoType = amount > 16000 ? 'SME-IPO' : 'IPO';
                }
            }

            const issueSize = getTextContent('.row.ipo-meta .two.columns .value');
            const prospectusLink = document.querySelector('.six.columns.text-right a')?.href || '';

            // Schedule extraction with error handling
            const schedule = {};
            const scheduleRows = document.querySelectorAll('.ipo-schedule tr');
            scheduleRows.forEach(row => {
                const label = row.querySelector('.ipo-schedule-label')?.textContent.trim();
                let date = row.querySelector('.ipo-schedule-date')?.textContent.trim();
                if (label && date) {
                    // Remove extra spaces from the date value
                    date = date.replace(/\s+/g, ' ');
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

            // Extract strengths
            const strengthsListItems = document.evaluate(
                "//h3[contains(text(), 'Strengths')]/following-sibling::ul/li",
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
            );
            const strengths = [];
            for (let i = 0; i < strengthsListItems.snapshotLength; i++) {
                strengths.push(strengthsListItems.snapshotItem(i).textContent.trim());
            }

            // Extract risks
            const risksListItems = document.evaluate(
                "//h2[contains(text(), 'Risks')]/following-sibling::ul/li",
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
            );
            const risks = [];
            for (let i = 0; i < risksListItems.snapshotLength; i++) {
                risks.push(risksListItems.snapshotItem(i).textContent.trim());
            }

            // Extract allotment link
            const allotmentLinkElement = document.evaluate(
                "//h2[contains(text(), 'Allotment Status')]/following-sibling::p/a",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;
            const allotmentLink = allotmentLinkElement ? allotmentLinkElement.href : '';

            // Extract financial data
            const financialScript = Array.from(document.querySelectorAll('.mini-container script')).find(script => script.innerText.includes('const data ='));
            const financialScriptContent = financialScript ? financialScript.innerText : '';

            const dataMatch = financialScriptContent.match(/const data = ({.*?});/s);
            let dataObject = {};
            if (dataMatch) {
                dataObject = JSON.parse(dataMatch[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
            }

            // Extract labels and datasets
            const labels = dataObject.labels;
            const datasets = dataObject.datasets.map(dataset => ({
                label: dataset.label,
                data: dataset.data
            }));

            // Format the financial data as requested
            let formattedFinancialData = {};
            datasets.forEach(dataset => {
                formattedFinancialData[dataset.label] = dataset.data;
            });

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
                strengths,
                risks,
                allotmentLink,
                financialData: {
                    labels,
                    ...formattedFinancialData
                }
            };
        });

        await browser.close();

        // Create the response object with the IPO URL
        const jsonResponse = {
            ipoDetails: {
                ...result,
                IPOLink: url  // Added the URL to the response
            }
        };

        console.log('Extracted Data:', JSON.stringify(jsonResponse, null, 2));
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
        .then((result) => {
            console.log('Scraping completed successfully');
        })
        .catch((error) => {
            console.error('Error while scraping:', error);
        })
        .finally(() => {
            rl.close();
        });
});