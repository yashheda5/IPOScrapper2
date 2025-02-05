const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeLastTable(url) {
    try {
        // Fetch the webpage
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const html = response.data;
        const $ = cheerio.load(html);

        // Get the last table
        const lastTable = $('table').last();
        
        if (lastTable.length === 0) {
            throw new Error('No tables found on the page');
        }

        // Extract headers
        const headers = [];
        lastTable.find('th').each((i, elem) => {
            headers.push($(elem).text().trim());
        });

        // Extract rows
        const data = [];
        lastTable.find('tbody tr').each((i, row) => {
            const rowData = {};
            $(row).find('td').each((j, cell) => {
                let value = $(cell).text().trim();
                // Convert numeric values
                if (headers[j].includes('lakhs') || headers[j].includes('times')) {
                    value = parseFloat(value.replace('x', ''));
                }
                rowData[headers[j]] = value;
            });
            data.push(rowData);
        });

        return data;

    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

// Execute the scraping
const url = 'https://zerodha.com/ipo/403864/chamunda-electricals/';

scrapeLastTable(url)
    .then(data => {
        if (data) {
            console.table(data);
        }
    })
    .catch(error => console.error('Error:', error));