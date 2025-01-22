const puppeteer = require('puppeteer');
const readline = require('readline');
const axios = require('axios');

async function scrapeAndExtract(url) {
    let browser;
    console.log('\nStarting scraping process...');

    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        await page.goto(url, { 
            waitUntil: 'networkidle0', 
            timeout: 60000 
        });

        console.log('Page loaded successfully, extracting data...');

        // Extract financial data
        const financialData = await page.evaluate(() => {
            try {
                const container = document.querySelector('.mini-container');
                const script = Array.from(container.querySelectorAll('script'))
                    .find(script => script.innerText.includes('const data ='));
                
                if (!script) return null;

                const dataMatch = script.innerText.match(/const data = ({.*?});/s);
                if (!dataMatch) return null;

                const dataObject = JSON.parse(
                    dataMatch[1]
                        .replace(/(\w+):/g, '"$1":')
                        .replace(/'/g, '"')
                );

                return {
                    labels: dataObject.labels || [],
                    datasets: dataObject.datasets.map(dataset => ({
                        label: dataset.label,
                        data: dataset.data
                    }))
                };
            } catch (e) {
                console.error('Error parsing financial data:', e);
                return null;
            }
        });

        // Extract IPO details
        const result = await page.evaluate(() => {
            // Utility functions
            const getText = (selector) => {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : '';
            };

            const getXPathText = (xpath) => {
                const element = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;
                return element ? element.textContent.trim() : '';
            };

            // Function to get list items after a heading
            const getListItemsAfterHeading = (headingText) => {
                const xpathQuery = `//h2[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${headingText.toLowerCase()}')]|//h3[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${headingText.toLowerCase()}')]`;
                
                const headingElement = document.evaluate(
                    xpathQuery,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;

                if (!headingElement) return [];

                let nextElement = headingElement.nextElementSibling;
                while (nextElement && nextElement.tagName.toLowerCase() !== 'ul') {
                    nextElement = nextElement.nextElementSibling;
                }

                if (nextElement && nextElement.tagName.toLowerCase() === 'ul') {
                    return Array.from(nextElement.querySelectorAll('li'))
                        .map(li => li.textContent.trim())
                        .filter(text => text.length > 0);
                }

                return [];
            };

            // Function to get allotment link
            const getAllotmentLink = () => {
                const allotmentStatusH2 = document.querySelector('.mini-container h2:has(b), .mini-container h2:has(strong)');
                if (!allotmentStatusH2) return '';
                
                const allotmentAnchor = allotmentStatusH2.nextElementSibling?.querySelector('a');
                return allotmentAnchor ? allotmentAnchor.href : '';
            };

            // Basic IPO Information
            const basicInfo = {
                IPOName: getText('.ten.columns h1').replace(/\s+/g, ' ').trim(),
                logoURL: document.querySelector('.ipo-logo img')?.src || '',
                ipoDate: getText('.row.ipo-meta .four.columns:nth-child(1) .value'),
                listingDate: getText('.row.ipo-meta .four.columns:nth-child(2) .value')
            };

            // Price and Size Information
            const priceElement = document.querySelector('.row.ipo-meta .three.columns .value');
            const priceInfo = (() => {
                if (!priceElement) return {};
                
                const priceText = priceElement.textContent.trim();
                const priceMatch = priceText.match(/(₹\d+)\s*–\s*(₹\d+)/);
                const lotMatch = priceText.match(/Lot size[^0-9]*(\d+)[^0-9]*₹(\d+)/);
                
                return {
                    priceRange: priceMatch ? `${priceMatch[1]} – ${priceMatch[2]}` : '',
                    lotSize: lotMatch ? lotMatch[1] : '',
                    ipoType: lotMatch && parseInt(lotMatch[2]) > 16000 ? 'SME-IPO' : 'IPO'
                };
            })();

            // Schedule Information
            const schedule = {};
            document.querySelectorAll('.ipo-schedule tr').forEach(row => {
                const label = row.querySelector('.ipo-schedule-label')?.textContent.trim();
                const date = row.querySelector('.ipo-schedule-date')?.textContent.trim();
                if (label && date) {
                    schedule[label] = date.replace(/\s+/g, ' ');
                }
            });

            // Issue Size Details
            const issueSize = {};
            document.querySelectorAll('.mini-container.content table tbody tr').forEach((row, index) => {
                if (index > 0) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length === 2) {
                        const key = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();
                        if (key !== 'Purpose') {
                            issueSize[key] = value;
                        }
                    }
                }
            });

            return {
                ...basicInfo,
                ...priceInfo,
                issueSize: getText('.row.ipo-meta .two.columns .value'),
                prospectusLink: document.querySelector('.six.columns.text-right a')?.href || '',
                ipoSchedule: schedule,
                ipoDescription: getXPathText("//h2[contains(text(), 'About')]/following-sibling::p"),
                issueSizeDetails: issueSize,
                strengths: getListItemsAfterHeading('strengths'),
                risks: getListItemsAfterHeading('risks'),
                allotmentLink: getAllotmentLink()
            };
        });

        // Transform financial data for API
        const transformedFinancialData = {
            labels: financialData?.labels || [],
            TotalAssets: financialData?.datasets.find(d => d.label === "Total Assets")?.data || [],
            Revenue: financialData?.datasets.find(d => d.label === "Revenue")?.data || [],
            ProfitAfterTax: financialData?.datasets.find(d => d.label === "Profit After Tax")?.data || []
        };

        // Prepare final response
        const finalResponse = {
            ...result,
            financialData: transformedFinancialData,
            IPOLink: url
        };

        console.log('\n=== Scraped Data ===');
        console.log(JSON.stringify(finalResponse, null, 2));

        // Send data to server
        try {
            console.log('\nSending data to server...');
            const response = await axios.post(
                "http://localhost:3000/api/upload-ipo", 
                finalResponse, 
                { headers: { "Content-Type": "application/json" }}
            );
            
            console.log('\n=== Server Response ===');
            console.log(JSON.stringify(response.data, null, 2));
            
            console.log('\n=== Database Status ===');
            if (response.data._id) {
                console.log('✅ Successfully added to database with ID:', response.data._id);
            } else {
                console.log('❌ Failed to add to database - No ID returned');
            }
        } catch (postError) {
            console.error("\n=== Server Error ===");
            console.error("❌ Failed to send data to server:", postError.message);
            throw postError;
        }

        return finalResponse;
    } catch (error) {
        console.error('\n=== Scraping Error ===');
        console.error('❌ Error during scraping:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log('\nBrowser closed successfully');
        }
    }
}

// Setup CLI interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Run the scraper
rl.question('Please enter the IPO URL: ', async (url) => {
    try {
        await scrapeAndExtract(url);
        console.log('\n=== Final Status ===');
        console.log('✅ Scraping process completed successfully');
    } catch (error) {
        console.log('\n=== Final Status ===');
        console.log('❌ Scraping process failed');
        console.error('Error details:', error.message);
    } finally {
        rl.close();
    }
});