import { expect, test } from '@playwright/test'

test.describe('Catálogo (demo)', () => {
  test('crear una categoría con el backend real del simulador y encontrarla con el buscador', async ({ page }) => {
    await page.goto('/?demo&vacio=1#/catalogo')
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Categoría', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: 'Nueva categoría' })
    await dlg.getByLabel('Nombre').fill('Mascotas E2E')
    await dlg.getByRole('button', { name: 'Crear' }).click()
    await expect(dlg).toBeHidden()
    await page.getByRole('searchbox', { name: 'Buscar en el catálogo' }).fill('mascotas')
    await expect(page.locator('mark', { hasText: /Mascotas/i }).first()).toBeVisible()
  })

  test('un nombre repetido se rechaza sin cerrar el formulario', async ({ page }) => {
    await page.goto('/?demo&vacio=1#/catalogo')
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Medio de pago' }).click()
    const dlg = page.getByRole('dialog', { name: 'Nuevo medio de pago' })
    await dlg.getByLabel('Nombre').fill('efectivo')
    await dlg.getByRole('button', { name: 'Crear' }).click()
    await expect(dlg.getByText('Ya existe uno con ese nombre en este nivel.')).toBeVisible()
    await expect(dlg).toBeVisible()
  })

  test('no desborda en ningún ancho', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.goto('/?demo#/catalogo')
      await expect(page.getByRole('searchbox', { name: 'Buscar en el catálogo' })).toBeVisible()
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d, `desborde a ${w}px`).toBeLessThanOrEqual(0)
      await page.getByRole('button', { name: 'Agregar', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Categoría', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Nueva categoría' })).toBeVisible()
      const d2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(d2, `desborde del formulario a ${w}px`).toBeLessThanOrEqual(0)
      await page.keyboard.press('Escape')
    }
  })
})
