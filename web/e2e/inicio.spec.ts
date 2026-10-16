import { expect, test } from '@playwright/test'

test.describe('Inicio y filtros globales (demo)', () => {
  test('muestra el dashboard con 8 KPIs, gráficos y análisis', async ({ page }) => {
    await page.goto('/?demo#/')
    for (const t of ['Presupuesto', 'Gastado', 'Disponible', '% consumido', 'Promedio diario', 'Ticket promedio', 'Mayor gasto', 'Movimientos']) {
      await expect(page.getByRole('heading', { name: t, level: 3, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Gasto acumulado' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Gasto por ámbito' })).toBeVisible()
    await page.getByRole('tab', { name: 'Flujo de medios' }).click()
    await expect(page.getByRole('group', { name: 'Flujo de medios de pago a ámbitos' })).toBeVisible()
    await page.getByRole('tab', { name: 'Frecuencia vs monto' }).click()
    await expect(page.getByRole('group', { name: /Frecuencia contra monto/ })).toBeVisible()
  })

  test('los filtros viven en la URL, sobreviven a recargar y viajan a Movimientos', async ({ page }) => {
    await page.goto('/?demo#/')
    await page.getByRole('radio', { name: '3 meses', exact: true }).click()
    await expect(page).toHaveURL(/#\/\?p=ultimos_3/)
    await page.reload()
    await expect(page.getByRole('radio', { name: '3 meses', exact: true })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('link', { name: 'Movimientos' }).first().click()
    await expect(page).toHaveURL(/#\/movimientos\?p=ultimos_3/)
    await expect(page.getByRole('radio', { name: '3 meses', exact: true })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Limpiar filtros' }).first().click()
    await expect(page).toHaveURL(/#\/movimientos$/)
  })

  test('una URL manipulada no rompe la pantalla', async ({ page }) => {
    await page.goto('/?demo#/?p=<script>&a="><img src=x>&d=zzz')
    await expect(page.getByRole('heading', { name: 'Ticket promedio', level: 3 })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Filtros activos' })).toHaveCount(0)
  })

  test('guardar y reaplicar una vista de filtros', async ({ page }) => {
    await page.goto('/?demo#/?p=ultimos_6')
    await page.getByRole('button', { name: 'Guardar vista' }).click()
    const dlg = page.getByRole('dialog', { name: 'Guardar vista' })
    await dlg.getByLabel('Nombre de la vista').fill('Seis meses')
    await dlg.getByRole('button', { name: 'Guardar vista' }).click()
    await expect(dlg).toBeHidden()
    await page.getByRole('button', { name: 'Limpiar filtros' }).first().click()
    await expect(page).toHaveURL(/#\/$/)
    await page.getByLabel('Vistas guardadas').selectOption({ label: 'Seis meses' })
    await expect(page).toHaveURL(/p=ultimos_6/)
  })

  test('no desborda en ningún ancho', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.goto('about:blank')
      await page.goto('/?demo#/?p=ultimos_6')
      await expect(page.getByRole('heading', { name: 'Ticket promedio', level: 3 })).toBeVisible()
      for (const tab of ['Jerarquía', 'Flujo de medios', 'Frecuencia vs monto']) {
        await page.getByRole('tab', { name: tab }).click()
        const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(d, `desborde en ${tab} a ${w}px`).toBeLessThanOrEqual(0)
      }
    }
  })
})
