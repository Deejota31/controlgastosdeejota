import { expect, test, type Page } from '@playwright/test'

async function crearPlantilla(page: Page, nombre: string, descripcion: string, monto: string) {
  const dlg = page.getByRole('dialog', { name: 'Nueva plantilla de gasto' })
  await dlg.getByLabel(/Nombre/).fill(nombre)
  await dlg.getByLabel(/Ámbito/).selectOption({ index: 1 })
  await dlg.getByLabel(/Categoría/).selectOption({ index: 1 })
  const sub = dlg.getByLabel(/Subcategoría/)
  if (await sub.isEnabled()) await sub.selectOption({ index: 1 })
  await dlg.getByLabel(/Medio de pago/).selectOption({ index: 1 })
  await dlg.getByLabel('Descripción').fill(descripcion)
  await dlg.getByRole('textbox', { name: /Monto/ }).fill(monto)
  await dlg.getByRole('button', { name: 'Crear' }).click()
  await expect(dlg).toBeHidden()
}

test.describe('Gastos del mes (demo)', () => {
  test('crear plantillas y registrarlas en un lote se ve en Movimientos', async ({ page }) => {
    await page.goto('/?demo&vacio=1#/movimientos')
    await page.getByRole('button', { name: 'Gastos del mes' }).click()
    const modal = page.getByRole('dialog', { name: 'Gastos del mes' })
    await modal.getByRole('button', { name: 'Crear mi primera plantilla' }).click()
    await crearPlantilla(page, 'Plantilla Uno', 'Gasto lote uno', '12.30')
    await modal.getByRole('button', { name: 'Nueva plantilla' }).click()
    await crearPlantilla(page, 'Plantilla Dos', 'Gasto lote dos', '45')
    await modal.getByRole('button', { name: 'Todas' }).click()
    await expect(modal.getByText(/^2 gastos/)).toBeVisible()
    // Una edición temporal no cambia la plantilla.
    await modal.getByRole('textbox', { name: 'Monto de Plantilla Uno' }).fill('20')
    await modal.getByRole('button', { name: 'Registrar 2 gastos' }).click()
    await expect(modal).toBeHidden()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('gasto lote')
    await expect(page.getByText(/Gasto Lote (Uno|Dos)/i)).toHaveCount(2)
    await page.getByRole('button', { name: 'Gastos del mes' }).click()
    await expect(page.getByRole('textbox', { name: 'Monto de Plantilla Uno' })).toHaveValue('12.3')
  })

  test('no desborda en ningún ancho con el modal abierto', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.goto('about:blank')
      await page.goto('/?demo&vacio=1#/')
      await page.getByRole('button', { name: 'Gastos del mes' }).click()
      const modal = page.getByRole('dialog', { name: 'Gastos del mes' })
      await expect(modal).toBeVisible()
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d, `desborde a ${w}px`).toBeLessThanOrEqual(0)
      await modal.getByRole('button', { name: 'Crear mi primera plantilla' }).click()
      await expect(page.getByRole('dialog', { name: 'Nueva plantilla de gasto' })).toBeVisible()
      const d2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d2, `desborde del formulario a ${w}px`).toBeLessThanOrEqual(0)
    }
  })
})
