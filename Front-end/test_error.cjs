const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request =>
    console.log('REQUEST FAILED:', request.url(), request.failure().errorText)
  );

  console.log('Navigating to http://localhost:5173/voice-interview/1e71994c-28a8-493f-8580-8d1ee97df8c7 ...');
  await page.goto('http://localhost:5173/voice-interview/1e71994c-28a8-493f-8580-8d1ee97df8c7', { waitUntil: 'networkidle2' });
  
  console.log('Done.');
  await browser.close();
})();
