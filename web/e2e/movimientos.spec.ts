import { expect, test, type Page } from '@playwright/test'

const nuevo = (page: Page) => page.getByRole('button', { name: /^Nuevo (gasto|movimiento)$/ }).first()

async function crear(page: Page, descripcion: string, monto = '23,45') {
  await nuevo(page).click()
  const dlg = page.getByRole('dialog', { name: 'Nuevo movimiento' })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('radiogroup', { name: 'Categoría' }).getByRole('radio').first().click()
  const subs = dlg.getByRole('radiogroup', { name: 'Subcategoría' })
  if (await subs.count()) {
    if ((await subs.getByRole('radio', { checked: true }).count()) === 0) await subs.getByRole('radio').first().click()
  }
  await dlg.getByLabel('Descripción').fill(descripcion)
  await dlg.getByLabel('Monto').fill(monto)
  return dlg
}

test.describe('Movimientos (demo)', () => {
  test('crear un movimiento lo muestra al instante y un doble clic no lo duplica', async ({ page }) => {
    await page.goto('/?demo#/movimientos')
    await expect(page.getByRole('searchbox', { name: 'Buscar movimientos' })).toBeVisible()
    const dlg = await crear(page, 'Prueba doble clic')
    const guardar = dlg.getByRole('button', { name: 'Guardar movimiento' })
    // Dos clics en la misma tarea: el segundo llega antes de que React cierre el formulario.
    await guardar.evaluate((b: HTMLButtonElement) => {
      b.click()
      b.click()
    })
    await expect(dlg).toBeHidden()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('Prueba doble clic')
    await expect(page.getByText('Prueba Doble Clic')).toHaveCount(1)
  })

  test('el formulario no desborda en ningún ancho y el borrador se protege', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.goto('/?demo#/movimientos')
      await nuevo(page).click()
      const dlg = page.getByRole('dialog', { name: 'Nuevo movimiento' })
      await expect(dlg).toBeVisible()
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d, `desborde a ${w}px`).toBeLessThanOrEqual(0)
      await dlg.getByLabel('Notas').fill('borrador')
      await page.keyboard.press('Escape')
      await expect(page.getByText('¿Descartar los cambios?')).toBeVisible()
      await page.getByRole('button', { name: 'Descartar' }).click()
      await expect(dlg).toBeHidden()
    }
  })

  test('selección persistente y anulación en lote con vista previa', async ({ page }) => {
    await page.goto('/?demo#/movimientos')
    await page.getByRole('radio', { name: 'Todo', exact: true }).click()
    const filas = page.getByRole('checkbox', { name: /^Seleccionar (?!los)/ })
    await filas.nth(0).check()
    await filas.nth(1).check()
    await expect(page.getByText('2 seleccionados')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('zzzz-no-existe')
    await expect(page.getByText('2 seleccionados')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('')
    await page.getByRole('region', { name: 'Acciones sobre la selección' }).getByRole('button', { name: 'Anular' }).click()
    const dlg = page.getByRole('dialog', { name: 'Anular movimientos' })
    await expect(dlg).toContainText('Se aplicará a 2 de 2')
    await dlg.getByRole('button', { name: 'Anular' }).click()
    await expect(page.getByText('2 movimientos actualizados.')).toBeVisible()
  })

  test('el menú de fila se abre dentro de la pantalla y se maneja con teclado', async ({ page }) => {
    await page.goto('/?demo#/movimientos')
    await page.getByRole('radio', { name: 'Todo', exact: true }).click()
    const boton = page.getByRole('button', { name: /^Acciones de/ }).last()
    await boton.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const caja = await menu.boundingBox()
    const vp = page.viewportSize()!
    expect(caja!.x).toBeGreaterThanOrEqual(0)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(vp.width)
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(vp.height)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(boton).toBeFocused()
  })
})
