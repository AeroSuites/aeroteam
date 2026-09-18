// Edge Function : réception automatique du fichier consignes (CONSIGNES S*.xlsm).
// Appelée par le raccourci iPad (puis, avec licence premium, par le flux Power Automate).
// Elle analyse le fichier et stocke le résultat CÔTÉ ADMIN (consignes + effectif par avion).
// Elle ne modifie JAMAIS les profils leaders : l'assignation à un leader reste manuelle
// depuis la page Importer consignes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as XLSX from 'npm:xlsx'
import { parseConsignesWorkbook } from './consignesExcel.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const expected = Deno.env.get('CONSIGNES_SYNC_SECRET') || ''
  const given = req.headers.get('x-sync-secret') || ''
  if (!expected || given !== expected) return json({ ok: false, error: 'secret_invalide' }, 401)

  // ?dry=1 : analyse sans écriture (test)
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  )

  try {
    const buf = new Uint8Array(await req.arrayBuffer())
    if (buf.length < 1000) return json({ ok: false, error: 'fichier_vide_ou_invalide' }, 400)
    const fileName = req.headers.get('x-file-name') || 'consignes.xlsm'

    const wb = XLSX.read(buf, { type: 'array' })
    const report = parseConsignesWorkbook(wb) as Record<
      string,
      { blocks?: { immat: string; shifts?: Record<string, string[]> }[] }
    >

    // Avions ayant au moins une consigne dans le fichier
    const immats = new Set<string>()
    for (const sheet of Object.values(report)) {
      for (const block of sheet.blocks || []) {
        const hasTasks = Object.values(block.shifts || {}).some(
          (tasks) => Array.isArray(tasks) && tasks.length > 0
        )
        if (hasTasks && block.immat) immats.add(block.immat)
      }
    }
    const aircraft = [...immats].sort()
    const days = Object.keys(report)

    if (!dryRun) {
      const { error: insErr } = await supabase.from('consignes_imports').insert({
        file_name: fileName,
        aircraft_count: aircraft.length,
        report,
      })
      if (insErr) return json({ ok: false, error: insErr.message }, 500)
      await supabase.from('import_runs').insert({
        source: 'auto',
        file_name: fileName,
        days,
        aircraft_updated: aircraft.length,
        aircraft_skipped: [],
        details: { aircraft },
      })
    }

    return json({
      ok: true,
      dry_run: dryRun,
      days: days.length,
      aircraft,
      message: `${aircraft.length} avion(s) avec consignes sur ${days.length} jour(s)${
        dryRun ? ' (test, non enregistré)' : ' — enregistré côté admin'
      }`,
    })
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500)
  }
})
