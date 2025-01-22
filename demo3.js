const puppeteer = require('puppeteer');

(async () => {
  const url = 'https://zerodha.com/ipo/402509/ema-partners-india/';

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  const financialData = await page.evaluate(() => {
    const container = document.querySelector('.mini-container');
    const script = Array.from(container.querySelectorAll('script')).find(script => script.innerText.includes('const data ='));
    const scriptContent = script ? script.innerText : '';

    const dataMatch = scriptContent.match(/const data = ({.*?});/s);
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

    return { labels, datasets };
  });

  console.log("Labels:", financialData.labels);
  financialData.datasets.forEach(dataset => {
    console.log(`${dataset.label}:`, dataset.data);
  });

  await browser.close();
})();