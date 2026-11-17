// Measures how busy the page's main thread is, first with the engine off and then while it runs flat out.
// Run it with the Playwright MCP tool (browser_run_code_unsafe, filename) against `npm run dev`.
// It slows the CPU 6x to act like a weak laptop and keeps the default four-cylinder pattern. After 3 quiet
// seconds it starts the engine and opens the throttle fully in neutral, so it sits on its 7,000 RPM limiter
// (21,000 BPM). It measures 5 seconds of that and returns the share of each second spent on work.
async (page) => {
  const url = "http://localhost:5191/";
  const cpuSlowdown = 6;
  const quietSeconds = 3;
  const seconds = 5;
  const throttlePercent = "100";

  await page.goto(url);
  const devtools = await page.context().newCDPSession(page);
  await devtools.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  await devtools.send("Performance.enable");

  const readMetrics = async () => {
    const { metrics } = await devtools.send("Performance.getMetrics");
    return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  };
  const busyShare = (before, after, name, span) => Math.round(((after[name] - before[name]) / span) * 100);

  await page.waitForTimeout(1000);
  const quietStart = await readMetrics();
  await page.waitForTimeout(quietSeconds * 1000);
  const quietEnd = await readMetrics();

  await page.locator("#play:not([disabled])").click();
  await page.waitForTimeout(2500);
  await page.locator("#throttle").evaluate((slider, value) => {
    slider.value = value;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, throttlePercent);
  await page.waitForTimeout(1500);

  const before = await readMetrics();
  await page.waitForTimeout(seconds * 1000);
  const after = await readMetrics();

  return {
    cpuSlowdown,
    throttlePercent,
    dashboard: await page.locator(".lcd").innerText(),
    engineOffBusyPercent: busyShare(quietStart, quietEnd, "TaskDuration", quietSeconds),
    mainThreadBusyPercent: busyShare(before, after, "TaskDuration", seconds),
    scriptPercent: busyShare(before, after, "ScriptDuration", seconds),
    layoutAndStylePercent: busyShare(before, after, "LayoutDuration", seconds) + busyShare(before, after, "RecalcStyleDuration", seconds),
  };
}
