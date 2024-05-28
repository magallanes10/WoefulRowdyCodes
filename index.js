const fs = require('fs');
const freeport = require('freeport');
const ProxyChain = require('proxy-chain');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const express = require('express');

const app = express();

app.get('/', async (req, res) => {
  try {
    const output = await run();
    res.send(output);
  } catch (error) {
    console.error('Error during execution:', error);
    res.status(500).send('An error occurred.');
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});

async function run() {
  return new Promise((resolve, reject) => {
    freeport(async (err, port) => {
      if (err) {
        console.error('Error finding free port:', err);
        reject(err);
        return;
      }

      const proxyServer = new ProxyChain.Server({ port });

      proxyServer.listen(async () => {
        console.log(`Proxy server listening on port ${port}`);

        let browser;
        const cookies = JSON.parse(fs.readFileSync('replit.json', 'utf8'));
        const url = 'https://replit.com/@georgebeard839/Bot-Hutchins-v2-backup';

        const launchBrowser = async () => {
          const { stdout: chromiumPath } = await promisify(exec)("which chromium");

          browser = await puppeteer.launch({
            headless: false,
            executablePath: chromiumPath.trim(),
            ignoreHTTPSErrors: true,
            args: [
              '--ignore-certificate-errors',
              '--disable-gpu',
              '--disable-software-rasterizer',
              '--disable-dev-shm-usage',
              '--no-sandbox',
              `--proxy-server=127.0.0.1:${port}`
            ]
          });

          return browser;
        };

        const openNewTab = async (browser, url) => {
          const page = await browser.newPage();
          await page.setUserAgent("Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_7;en-us) AppleWebKit/530.17 (KHTML, like Gecko) Version/4.0 Safari/530.17");
          await page.setCookie(...cookies);
          await page.goto(url, { waitUntil: 'networkidle2' });
          return page;
        };

        const manageTabs = async (browser) => {
          const additionalPages = [];
          const currentTab = await openNewTab(browser, url);

          const addTab = async () => {
            if (additionalPages.length >= 2) return; // Only allow 2 additional tabs
            const newPage = await openNewTab(browser, url);
            additionalPages.push(newPage);
          };

          const deleteTab = async () => {
            if (additionalPages.length === 0) return;
            const page = additionalPages.shift(); // Remove the first additional tab
            await page.close();
          };

          const switchTabs = () => {
            let currentPageIndex = 0;
            const switchPage = () => {
              if (additionalPages.length === 0) return;
              currentPageIndex = (currentPageIndex + 1) % additionalPages.length;
              const currentPage = additionalPages[currentPageIndex];
              console.log(`Switching to additional page ${currentPageIndex + 1}`);
              currentPage.bringToFront(); // Brings the current additional page to the front
              setTimeout(switchPage, 3000);
            };
            switchPage();
          };

          switchTabs();

          while (true) {
            try {
              await addTab();
              await new Promise(resolve => setTimeout(resolve, 8000)); // Wait 8 seconds before deleting a tab
              await deleteTab();
              await new Promise(resolve => setTimeout(resolve, 8000)); // Wait 8 seconds before adding a new tab
            } catch (error) {
              console.error('Error managing tabs:', error);
              if (browser) {
                await browser.close();
              }
              browser = await launchBrowser();
              await manageTabs(browser);
            }
          }
        };

        try {
          browser = await launchBrowser();
          await manageTabs(browser);

          // Wait for 60 seconds before closing everything
          setTimeout(async () => {
            await browser.close();
            proxyServer.close(() => {
              console.log('Proxy server closed');
            });
            resolve('Browser operations completed successfully.');
          }, 60000);
        } catch (error) {
          if (browser) {
            await browser.close();
          }
          proxyServer.close(() => {
            console.log('Proxy server closed');
          });
          reject(error);
        }
      });
    });
  });
}
