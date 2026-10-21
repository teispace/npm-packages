import { chromium, firefox } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
{
  const browser = await firefox.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3119/?content=');
  await page.evaluate(() => {
    document.addEventListener(
      'paste',
      (e) => {
        window.__clip = e.clipboardData.getData('text/html');
      },
      true,
    );
    window.__tei.setClipSource('<p style="text-align: center">mid</p><p>plain</p>');
  });
  console.log(
    'ff source',
    await page.evaluate(() => document.getElementById('clip-source').innerHTML),
  );
  await page.keyboard.press(`${mod}+c`);
  await page.getByTestId('content').click();
  await page.keyboard.press(`${mod}+v`);
  await page.waitForTimeout(200);
  console.log('ff clip', await page.evaluate(() => window.__clip));
  await browser.close();
}
{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3119/?content=');
  await page.getByTestId('content').click();
  await page.evaluate(() => {
    const t = new DataTransfer();
    t.setData('text/plain', 'one\ntwo');
    document
      .querySelector('[data-tei-content]')
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }),
      );
  });
  console.log(
    'chromium plain',
    JSON.stringify(
      await page.evaluate(() => [window.__tei.editor.getText(), window.__tei.editor.getHTML()]),
    ),
  );
  await browser.close();
}
