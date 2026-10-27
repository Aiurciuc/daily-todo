import { expect, test } from '@playwright/test';

test('hour dividers span every day and align with the time axis (mock API)', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path === '/api/auth/me'
        ? { id: 1, name: 'Taylor', email: 'taylor@example.test' }
        : [],
    });
  });
  await page.goto('/');
  await expect(page.locator('.day-column')).toHaveCount(7);

  const assertLines = async () => {
    const rows = await page.locator('.day-column').evaluateAll((columns) => {
      const axisRows = [...document.querySelectorAll('.time-axis > div')];
      return columns.flatMap((column) => [...column.querySelectorAll('.hour-slot')].map((slot, index) => {
        const style = getComputedStyle(slot);
        const rect = slot.getBoundingClientRect();
        const axis = axisRows[index].getBoundingClientRect();
        return {
          border: style.borderBottomWidth,
          borderStyle: style.borderBottomStyle,
          color: style.borderBottomColor,
          axisColor: getComputedStyle(axisRows[index]).borderBottomColor,
          height: rect.height,
          alignment: Math.abs(rect.bottom - axis.bottom),
          widthGap: Math.abs(rect.width - column.clientWidth),
        };
      }));
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.border).toBe('1px');
      expect(row.borderStyle).toBe('solid');
      expect(row.color).toBe(row.axisColor);
      expect(row.height).toBe(64);
      expect(row.alignment).toBeLessThan(1);
      expect(row.widthGap).toBeLessThan(1);
    }
  };
  await assertLines();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.calendar-scroll').evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.scrollTop = 900;
  });
  await assertLines();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.locator('.day-column')).toHaveCount(1);
  await assertLines();
});
