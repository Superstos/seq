// Smoke test for the engine page: starts the engine, holds W for full throttle in neutral, and reads the dashboard.
// Run it with the Playwright MCP tool (browser_run_code_unsafe, filename) against `npm run dev` on port 5191.
// It returns the LCD text at idle and while revving, plus any console errors. W stays held, so a screenshot taken
// right after it shows the engine on the rev limiter.
async (page) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:5191/");
  await page.locator("#play:not([disabled])").click();
  await page.waitForTimeout(3000);
  const idle = await page.locator(".lcd").innerText();
  await page.keyboard.down("w");
  await page.waitForTimeout(2500);
  const revving = await page.locator(".lcd").innerText();
  return { idle, revving, errors };
}
