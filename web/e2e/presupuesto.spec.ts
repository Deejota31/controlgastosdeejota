import { expect, test } from '@playwright/test'

test.describe('Presupuesto (demo)', () => {
  test('crear fuente y caja contra el backend real del simulador, y verlas en el resumen', async ({ page }) => {
    await page.goto('/?demo&vacio=1#/presupuesto')
    await expect(page.getByRole('heading', { name: 'Presupuesto', level: 2 })).toBeVisible()

    await page.getByRole('button', { name: /^(Crear mi primera fuente|Nueva fuente)$/ }).first().click()
    let dlg = page.getByRole('dialog', { name: 'Nueva fuente' })
    await dlg.getByLabel('Nombre').fill('Sueldo E2E')
    await dlg.getByRole('textbox', { name: /Monto/ }).fill('1000')
    await dlg.getByRole('button', { name: 'Crear' }).click()
    await expect(dlg).toBeHidden()
    const fuente = page.getByRole('heading', { name: /Sueldo E2E/ }).locator('xpath=ancestor::li')
    await expect(fuente).toBeVisible()
    await expect(fuente.getByText('Aplicada')).toBeVisible()
    await expect(page.getByRole('region', { name: /^Resumen de / })).toContainText('1,000.00')

    await page.getByRole('tab', { name: /Cajas/ }).click()
    await page.getByRole('button', { name: 'Nueva caja' }).click()
    dlg = page.getByRole('dialog', { name: 'Nueva caja' })
    await dlg.getByLabel('Nombre').fill('Caja E2E')
    await dlg.getByRole('textbox', { name: /Monto/ }).fill('300')
    await dlg.getByRole('combobox', { name: 'Categoría' }).click()
    await page.getByRole('listbox').getByRole('option').first().click()
    await dlg.getByRole('button', { name: 'Crear' }).click()
    await expect(dlg).toBeHidden()
    const caja = page.getByRole('heading', { name: /Caja E2E/ }).locator('xpath=ancestor::li')
    await expect(caja.getByText('Aplicada')).toBeVisible()
    await expect(page.getByRole('region', { name: /^Resumen de / })).toContainText('300.00')

    // Desactivar muestra el impacto antes de escribir.
    await caja.getByRole('switch', { name: 'Caja Caja E2E activa' }).click()
    const imp = page.getByRole('dialog', { name: /Desactivar la caja/ })
    await expect(imp).toContainText('300.00')
    await imp.getByRole('button', { name: 'Desactivar' }).click()
    await expect(page.getByRole('region', { name: /^Resumen de / })).toContainText('0.00')
  })

  test('copiar del mes anterior crea lo del mes pasado una sola vez', async ({ page }) => {
    await page.goto('/?demo&vacio=1#/presupuesto')
    await page.getByRole('button', { name: /^(Crear mi primera fuente|Nueva fuente)$/ }).first().click()
    const dlg = page.getByRole('dialog', { name: 'Nueva fuente' })
    await dlg.getByLabel('Nombre').fill('Sueldo copia')
    await dlg.getByRole('textbox', { name: /Monto/ }).fill('800')
    await dlg.getByLabel('Desde el mes').fill('2020-01')
    await dlg.getByText(/Aplicarla también/).click()
    await dlg.getByRole('button', { name: 'Crear' }).click()
    await expect(dlg).toBeHidden()
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click()
    await page.getByRole('button', { name: /^Aplicar a este mes$/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Aplicar al mes' }).click()
    await expect(page.getByRole('region', { name: /^Resumen de / })).toContainText('800.00')
    await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click()
    await page.getByRole('button', { name: 'Copiar del mes anterior' }).click()
    const copiar = page.getByRole('dialog', { name: /Copiar del mes anterior/ })
    await copiar.getByRole('button', { name: /^Copiar \d/ }).click()
    await expect(copiar).toBeHidden()
    await page.getByRole('button', { name: 'Copiar del mes anterior' }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Nada que copiar' })).toBeDisabled()
  })

  test('no desborda en ningún ancho', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.goto('/?demo&vacio=1#/presupuesto')
      await expect(page.getByRole('heading', { name: 'Presupuesto', level: 2 })).toBeVisible()
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d, `desborde a ${w}px`).toBeLessThanOrEqual(0)
      // Con datos de ejemplo las tarjetas son más anchas: se revisa cada pestaña.
      await page.goto('/?demo#/presupuesto')
      for (const pestana of [/Fuentes/, /Cajas/, /Plantillas/]) {
        await page.getByRole('tab', { name: pestana }).click()
        const dp = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(dp, `desborde en ${String(pestana)} a ${w}px`).toBeLessThanOrEqual(0)
      }
      await page.goto('/?demo&vacio=1#/presupuesto')
      await page.getByRole('button', { name: /^(Crear mi primera fuente|Nueva fuente)$/ }).first().click()
      const dlg = page.getByRole('dialog', { name: 'Nueva fuente' })
      await expect(dlg).toBeVisible()
      const d2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d2, `desborde del formulario a ${w}px`).toBeLessThanOrEqual(0)
      await page.keyboard.press('Escape')
    }
  })
})
