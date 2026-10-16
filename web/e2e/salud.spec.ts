import { expect, test } from '@playwright/test'

const SECCIONES = ['calidad', 'presupuesto', 'evolucion', 'compromisos', 'conciliacion']

test.describe('Salud financiera (demo)', () => {
  test('cinco tarjetas-pestaña y calidad con anillo y revisión', async ({ page }) => {
    await page.goto('/?demo#/salud')
    await expect(page.getByRole('tab')).toHaveCount(5)
    await expect(page.getByRole('img', { name: /Calidad de datos: \d+ de 100/ })).toBeVisible()
    await page.getByRole('button', { name: 'Revisar datos' }).click()
    await expect(page.getByRole('dialog', { name: 'Revisar datos' })).toBeVisible()
    await page.getByRole('tab', { name: /Duplicados/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).last().click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('conciliación: grupo → verificar con diferencia → corregir → historial, sin crear movimientos', async ({ page }) => {
    await page.goto('/?demo#/salud?seccion=conciliacion')
    await page.getByRole('button', { name: /Crear mi primer grupo|Nuevo grupo/ }).first().click()
    const g = page.getByRole('dialog', { name: 'Nuevo grupo de fondos' })
    await g.getByLabel(/Nombre del grupo/).fill('Cuentas demo')
    await g.getByRole('checkbox').first().check({ force: true }).catch(async () => g.locator('label').filter({ has: page.locator('input[type=checkbox]') }).first().click())
    await g.getByRole('button', { name: 'Guardar grupo' }).click()
    await expect(g).toBeHidden()

    await page.getByRole('button', { name: 'Verificar saldo' }).click()
    const v = page.getByRole('dialog', { name: 'Verificar saldo' })
    await v.getByRole('textbox', { name: 'Saldo real' }).fill('1')
    await expect(v.getByRole('status')).toContainText('Diferencia')
    await v.getByRole('button', { name: 'Guardar verificación' }).click()
    await expect(v).toBeHidden()
    await expect(page.getByText('Pendiente', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Revisar diferencia' }).click()
    const r = page.getByRole('dialog', { name: 'Revisar diferencia' })
    await r.getByLabel('Estado').selectOption('cerrada_justificada')
    await expect(r.getByRole('button', { name: 'Guardar seguimiento' })).toBeDisabled()
    await r.getByLabel('Causa de la diferencia').fill('Comisión bancaria')
    await r.getByRole('button', { name: 'Guardar seguimiento' }).click()
    await expect(r).toBeHidden()
    await expect(page.getByText('Cerrada con diferencia justificada').first()).toBeVisible()

    await page.getByRole('button', { name: 'Volver a verificar' }).click()
    const v2 = page.getByRole('dialog', { name: 'Volver a verificar' })
    await v2.getByRole('textbox', { name: 'Saldo real' }).fill('2')
    await v2.getByRole('button', { name: 'Guardar verificación' }).click()
    await expect(v2).toBeHidden()
    await expect(page.getByText(/Historial de verificaciones corregidas \(1\)/)).toBeVisible()
  })

  test('ninguna sección desborda en ningún ancho', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 })
      for (const s of SECCIONES) {
        await page.goto('about:blank')
        await page.goto(`/?demo#/salud?seccion=${s}`)
        await expect(page.getByRole('tabpanel')).toBeVisible()
        const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(d, `desborde en ${s} a ${w}px`).toBeLessThanOrEqual(0)
      }
    }
  })
})
