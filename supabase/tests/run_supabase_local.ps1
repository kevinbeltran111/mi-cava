<#
=============================================================================
 Mi Cava - Etapa 7.1 - Validacion sobre Supabase LOCAL real (supabase start)
=============================================================================
 Ejecuta las pruebas de Etapa 7 contra el contenedor de base de datos del
 proyecto local de Supabase CLI "mi-cava", sin local_shim.sql.

 Pasos (aborta ante la primera condicion insegura):
   0. Si existe el marcador de una ejecucion interrumpida, no continua.
   1. Repositorio: branch esperada, migraciones identicas al commit aprobado
      y proyecto NO vinculado a un Supabase remoto.
   2. Contenedor: supabase_db_<ProjectId>, en ejecucion, con la etiqueta
      com.supabase.cli.project=<ProjectId> y 5432 publicado en <ExpectedDbPort>.
   3. Copia los archivos de prueba al contenedor y les quita CRLF.
   4. Preflight de solo lectura.
   5. Huella del baseline (solo lectura) contra la referencia, clasificando
      cada diferencia como AMBIENTAL (solo reglas documentadas abajo) o NO
      EXPLICADA. Una diferencia no explicada impide aprobar.
   6. Pruebas dentro de una transaccion que siempre termina en ROLLBACK.
      Antes se guarda el estado de public.analytics_alias_seq en un marcador.
   7. Restaura la secuencia (con reintentos) y solo la da por restaurada si
      una lectura posterior lo verifica. Recien entonces borra el marcador.
   8. Huella del baseline de nuevo: debe ser identica a la del paso 5 en la
      misma instancia.
   9. Guarda: re-aplicar la migracion de Etapa 7 debe abortar. SOLO si los
      pasos 6 y 7 terminaron OK; si no, se omite.
  10. Postcheck de solo lectura.
  11. Borra los archivos copiados al contenedor.
 Si el paso 6 falla, se ejecutan solo 7, 8, 10 y 11 (restauracion,
 diagnostico y limpieza) y el resultado es FALLA.

 Reglas de diferencia AMBIENTAL en la huella (unicas aceptadas):
   R1  Orden de los elementos de una ACL (no cambia ningun privilegio).
   R2  Rol que otorgo (grantor) cada elemento de una ACL (depende de que rol
       aplico las migraciones; no cambia quien tiene que privilegio).
 Cualquier otra diferencia es NO EXPLICADA.

 Escrituras fuera de la transaccion revertida: restauracion de la secuencia
 (paso 7) y el intento de re-aplicar la migracion (paso 9), que aborta en su
 guarda dentro de su propia transaccion.

 No usa supabase db push/reset/link ni comandos remotos. No contiene
 credenciales: se conecta dentro del contenedor a 127.0.0.1, donde la imagen
 de Supabase autentica por "trust".

 Uso (desde la raiz del repositorio, en PowerShell):
   powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_supabase_local.ps1
 Diagnostico de solo lectura tras una interrupcion:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_supabase_local.ps1 -SoloDiagnostico

 NUNCA cambiar ProjectId por el de otro proyecto local ni apuntar esto a un
 proyecto Supabase remoto.
=============================================================================
#>
[CmdletBinding()]
param(
  [string]$ProjectId      = 'mi-cava',
  [int]   $ExpectedDbPort = 54422,
  [string]$ExpectedBranch = 'etapa7-1-modelo-inteligencia',
  [string]$ApprovedCommit = 'defeca834ab8cbfeec7116970c05b2a69fcd6908',
  [string]$ReferenceFingerprint = '',
  [switch]$SoloDiagnostico,
  [switch]$AceptarEstadoSecuencia
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$TestsDir  = $PSScriptRoot
$RepoRoot  = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Container = "supabase_db_$ProjectId"
$RemoteDir = '/tmp/micava_etapa7_tests'
$Migration = '20261025000000_etapa7_modelo_inteligencia.sql'
$Stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile   = Join-Path $env:TEMP "micava_etapa7_supabase_local_$Stamp.log"
$Marker    = Join-Path $env:TEMP "micava_etapa7_secuencia_pendiente_$ProjectId.txt"
if (-not $ReferenceFingerprint) { $ReferenceFingerprint = Join-Path $TestsDir 'baseline_fingerprint.expected.txt' }

$Results     = [ordered]@{}
$Copied      = $false
$SeqCaptured = $false
$SeqBefore   = $null
$SeqDone     = $false
$TestsOk     = $false
$FpBefore    = $null

# --- utilidades --------------------------------------------------------------

function Log([string]$Message) {
  Write-Host $Message
  Add-Content -Path $LogFile -Value $Message -Encoding UTF8
}

function LogFileOnly([string[]]$Lines) {
  if ($Lines) { Add-Content -Path $LogFile -Value $Lines -Encoding UTF8 }
}

function Stop-Run([string]$Message) {
  Log "ABORTADO: $Message"
  throw "ABORTADO: $Message"
}

# Ejecuta un programa externo sin que stderr se convierta en excepcion.
function Invoke-Native([string]$Exe, [string[]]$ArgList) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out  = & $Exe @ArgList 2>&1
    $code = $LASTEXITCODE
  } catch {
    $out  = @("$($_.Exception.Message)")
    $code = 255
  } finally {
    $ErrorActionPreference = $prev
  }
  $lines = @($out | ForEach-Object { "$_" })
  return [pscustomobject]@{ Code = $code; Lines = $lines }
}

# psql dentro del contenedor del proyecto, siempre contra 127.0.0.1:5432/postgres.
function Invoke-Psql([string[]]$PsqlArgs, [switch]$Quiet) {
  $argv = @('exec', $Container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
            '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres') + $PsqlArgs
  $r = Invoke-Native 'docker' $argv
  if ($Quiet) { LogFileOnly $r.Lines } else { foreach ($l in $r.Lines) { Log "    $l" } }
  return $r
}

function Invoke-ContainerShell([string]$Command) {
  return Invoke-Native 'docker' @('exec', '-u', 'root', $Container, 'sh', '-c', $Command)
}

# --- huella ------------------------------------------------------------------

function Get-Fingerprint {
  $r = Invoke-Psql @('-At', '-f', "$RemoteDir/baseline_fingerprint.sql") -Quiet
  if ($r.Code -ne 0) { return $null }
  return ,$r.Lines
}

# Aplica solo R1 (orden de la ACL) y R2 (grantor) a los segmentos acl={...}.
function Get-NormalizedFpLine([string]$Line) {
  return [regex]::Replace($Line, 'acl=\{([^}]*)\}', {
    param($m)
    $items = @($m.Groups[1].Value -split ',' | Where-Object { $_ -ne '' } |
               ForEach-Object { $_ -replace '/[^/]*$', '/<grantor>' } | Sort-Object)
    'acl={' + ($items -join ',') + '}'
  })
}

function Test-SameLines([string[]]$A, [string[]]$B) {
  if ($A.Count -ne $B.Count) { return $false }
  for ($i = 0; $i -lt $A.Count; $i++) { if ($A[$i] -cne $B[$i]) { return $false } }
  return $true
}

function Get-FpKind([string]$Line) {
  if ($Line -match '^(table|column|constraint|index|trigger|policy|function|bucket)\|') { return $Matches[1] }
  return 'continuacion'
}

# Compara la huella real con la referencia (PostgreSQL + shim).
function Compare-WithReference([string[]]$Actual) {
  $expected = @(Get-Content -Path $ReferenceFingerprint -Encoding UTF8)
  if (Test-SameLines $expected $Actual) {
    Log "    OK: identica a la referencia ($($Actual.Count) lineas)"
    return 'OK (identica a la referencia)'
  }
  $rawDiff = @(Compare-Object -ReferenceObject $expected -DifferenceObject $Actual -CaseSensitive)
  $normExpected = @($expected | ForEach-Object { Get-NormalizedFpLine $_ })
  $normActual   = @($Actual   | ForEach-Object { Get-NormalizedFpLine $_ })
  $normDiff = @(Compare-Object -ReferenceObject $normExpected -DifferenceObject $normActual -CaseSensitive)

  # Lineas cuya diferencia desaparece al normalizar: AMBIENTALES (R1/R2).
  $unexplainedNorm = @{}
  foreach ($x in $normDiff) { $unexplainedNorm[$x.InputObject] = $true }
  $envLines = @(); $badLines = @()
  foreach ($x in $rawDiff) {
    $n = Get-NormalizedFpLine $x.InputObject
    $side = if ($x.SideIndicator -eq '<=') { 'referencia' } else { 'Supabase local' }
    $entry = '[{0}] [{1}] {2}' -f $side, (Get-FpKind $x.InputObject), $x.InputObject
    if ($unexplainedNorm.ContainsKey($n)) { $badLines += $entry } else { $envLines += $entry }
  }
  if ($envLines.Count -gt 0) {
    Log "    Diferencias AMBIENTALES explicadas por R1/R2 (orden o grantor de ACL): $($envLines.Count) lineas"
    foreach ($e in $envLines) { Log "      $e" }
  }
  if ($badLines.Count -gt 0) {
    Log "    Diferencias NO EXPLICADAS: $($badLines.Count) lineas (impiden aprobar; requieren analisis)"
    foreach ($e in $badLines) { Log "      $e" }
    return "FALLA ($($badLines.Count) diferencias no explicadas)"
  }
  return "OK (solo diferencias ambientales R1/R2: $($envLines.Count) lineas)"
}

# --- secuencia de alias ------------------------------------------------------

function Get-SeqState {
  $r = Invoke-Psql @('-At', '-c', "select last_value || '|' || is_called from public.analytics_alias_seq") -Quiet
  if ($r.Code -ne 0 -or $r.Lines.Count -lt 1) { return $null }
  return $r.Lines[0].Trim()
}

# Restaura y VERIFICA. Devuelve el texto de resultado.
function Restore-Sequence {
  $last, $called = $SeqBefore.Split('|')
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $now = Get-SeqState
    if ($null -eq $now) {
      Log "    Intento ${attempt}: no se pudo leer la secuencia"
    } elseif ($now -eq $SeqBefore) {
      if ($attempt -eq 1) { Log "    Sin cambios (verificado: $now)"; return 'OK (sin cambios, verificado)' }
      Log "    Restaurada y verificada: $now"
      return 'OK (restaurada y verificada)'
    } else {
      Log "    Intento ${attempt}: estado $now, restaurando a $SeqBefore"
      $null = Invoke-Psql @('-At', '-c', "select setval('public.analytics_alias_seq', $last, $called)") -Quiet
    }
    Start-Sleep -Seconds 2
  }
  $final = Get-SeqState
  if ($final -eq $SeqBefore) { Log "    Restaurada y verificada: $final"; return 'OK (restaurada y verificada)' }
  Log "    NO VERIFICADA: estado leido '$final', esperado '$SeqBefore'"
  return 'NO VERIFICADA'
}

function Show-InterruptionHelp {
  Log '    Procedimiento: supabase/README.md, seccion "Ejecucion interrumpida".'
  Log '    1) Diagnostico (solo lectura):'
  Log '       powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\tests\run_supabase_local.ps1 -SoloDiagnostico'
  Log "    2) Estado previo guardado en: $Marker"
}

# --- inicio ------------------------------------------------------------------

Log '== Mi Cava - Etapa 7.1 - Validacion sobre Supabase local real'
Log "   Log completo: $LogFile"
Log "   Fecha: $(Get-Date -Format 's')"
if ($SoloDiagnostico) { Log '   MODO: solo diagnostico (solo lectura)' }

try {
  # ---------------------------------------------------------------------------
  if (-not $SoloDiagnostico) {
    Log '== 0. Marcador de ejecucion interrumpida'
    if (Test-Path $Marker) {
      Log '    Existe el marcador de una ejecucion anterior que no verifico la secuencia:'
      foreach ($l in (Get-Content -Path $Marker)) { Log "      $l" }
      Show-InterruptionHelp
      Stop-Run 'resolver la ejecucion interrumpida antes de volver a correr las pruebas'
    }
    Log '    OK: no hay ejecuciones interrumpidas pendientes'
    $Results['0. Marcador'] = 'OK'
  }

  # ---------------------------------------------------------------------------
  Log '== 1. Repositorio'
  Push-Location $RepoRoot
  try {
    $branch = (Invoke-Native 'git' @('rev-parse', '--abbrev-ref', 'HEAD')).Lines[0]
    $head   = (Invoke-Native 'git' @('rev-parse', 'HEAD')).Lines[0]
    Log "    Raiz: $RepoRoot"
    Log "    Branch: $branch  HEAD: $head"
    if ($branch -ne $ExpectedBranch) { Stop-Run "branch actual '$branch', se espera '$ExpectedBranch'" }
    if ($head -ne $ApprovedCommit) { Log "    AVISO: HEAD difiere del commit aprobado $ApprovedCommit" }
    $d = Invoke-Native 'git' @('diff', '--quiet', $ApprovedCommit, '--', 'supabase/migrations')
    if ($d.Code -ne 0) { Stop-Run 'supabase/migrations difiere del commit aprobado' }
    $s = Invoke-Native 'git' @('status', '--porcelain', '--', 'supabase/migrations')
    if (@($s.Lines | Where-Object { $_.Trim() -ne '' }).Count -gt 0) {
      Stop-Run 'hay cambios o archivos no versionados en supabase/migrations'
    }
    Log '    OK: migraciones identicas al commit aprobado'
    if (Test-Path (Join-Path $RepoRoot 'supabase\.temp\project-ref')) {
      Stop-Run 'el proyecto esta vinculado a un Supabase remoto (supabase\.temp\project-ref)'
    }
    Log '    OK: proyecto no vinculado a remoto'
  } finally {
    Pop-Location
  }
  $Results['1. Repositorio'] = 'OK'

  # ---------------------------------------------------------------------------
  Log "== 2. Contenedor $Container"
  # Solo los campos necesarios: evita ConvertFrom-Json sobre el inspect
  # completo (claves duplicadas por mayusculas en PowerShell 5.1) y formatos
  # con comillas dobles internas.
  $i = Invoke-Native 'docker' @('inspect', '--format', '{{.State.Running}}', $Container)
  if ($i.Code -ne 0) { Stop-Run "no existe el contenedor $Container (supabase start?)" }
  if ($i.Lines[0].Trim() -ne 'true') { Stop-Run "$Container no esta en ejecucion" }
  $labelsJson = (Invoke-Native 'docker' @('inspect', '--format', '{{json .Config.Labels}}', $Container)).Lines -join ''
  $label = $null
  if ($labelsJson -match '"com\.supabase\.cli\.project"\s*:\s*"([^"]*)"') { $label = $Matches[1] }
  if ($label -ne $ProjectId) { Stop-Run "etiqueta com.supabase.cli.project='$label', se espera '$ProjectId'" }
  $bindJson = (Invoke-Native 'docker' @('inspect', '--format', '{{json .HostConfig.PortBindings}}', $Container)).Lines -join ''
  $ports = @()
  if ($bindJson -match '"5432/tcp"\s*:\s*\[([^\]]*)\]') {
    $ports = @([regex]::Matches($Matches[1], '"HostPort"\s*:\s*"(\d+)"') | ForEach-Object { $_.Groups[1].Value })
  }
  if ($ports -notcontains "$ExpectedDbPort") { Stop-Run "5432/tcp publicado en '$($ports -join ',')', se espera $ExpectedDbPort" }
  Log "    OK: en ejecucion, etiqueta '$label', puerto $ExpectedDbPort"
  $others = (Invoke-Native 'docker' @('ps', '--format', '{{.Names}}')).Lines | Where-Object { $_ -like 'supabase_db_*' -and $_ -ne $Container }
  foreach ($o in @($others)) { Log "    (otro proyecto local en ejecucion, NO se usa: $o)" }
  $Results['2. Contenedor'] = 'OK'

  # ---------------------------------------------------------------------------
  Log '== 3. Copia de archivos al contenedor'
  $files = @('etapa7_modelo_inteligencia_test.sql', 'baseline_fingerprint.sql',
             'supabase_local_preflight.sql', 'supabase_local_run_tests.sql',
             'supabase_local_postcheck.sql', 'supabase_local_diagnostico.sql')
  $r = Invoke-ContainerShell ('rm -rf ' + $RemoteDir + ' && mkdir -p ' + $RemoteDir)
  if ($r.Code -ne 0) { Stop-Run 'no se pudo crear el directorio temporal en el contenedor' }
  $Copied = $true
  foreach ($f in $files) {
    $r = Invoke-Native 'docker' @('cp', (Join-Path $TestsDir $f), "${Container}:$RemoteDir/$f")
    if ($r.Code -ne 0) { Stop-Run "docker cp fallo para $f" }
  }
  $r = Invoke-Native 'docker' @('cp', (Join-Path $RepoRoot "supabase\migrations\$Migration"), "${Container}:$RemoteDir/$Migration")
  if ($r.Code -ne 0) { Stop-Run "docker cp fallo para $Migration" }
  $r = Invoke-ContainerShell ('sed -i ''s/\r$//'' ' + $RemoteDir + '/*.sql && chmod a+rx ' + $RemoteDir + ' && chmod a+r ' + $RemoteDir + '/*.sql')
  if ($r.Code -ne 0) { Stop-Run 'no se pudo normalizar CRLF en el contenedor' }
  Log "    OK: $($files.Count + 1) archivos en ${Container}:$RemoteDir"
  $Results['3. Copia'] = 'OK'

  # ---------------------------------------------------------------------------
  if ($SoloDiagnostico) {
    Log '== Diagnostico (solo lectura)'
    $r = Invoke-Psql @('-f', "$RemoteDir/supabase_local_diagnostico.sql")
    $Results['Diagnostico'] = $(if ($r.Code -eq 0) { 'OK (ver salida)' } else { "FALLA (codigo $($r.Code))" })
    if (Test-Path $Marker) {
      Log "    Marcador presente ($Marker):"
      foreach ($l in (Get-Content -Path $Marker)) { Log "      $l" }
    } else {
      Log '    No hay marcador de ejecucion interrumpida.'
    }
  } else {

  # ---------------------------------------------------------------------------
  Log '== 4. Preflight (solo lectura)'
  $r = Invoke-Psql @('-f', "$RemoteDir/supabase_local_preflight.sql")
  if ($r.Code -ne 0) { Stop-Run 'el preflight no paso; no se ejecuta ninguna prueba' }
  $Results['4. Preflight'] = 'OK'

  # ---------------------------------------------------------------------------
  Log '== 5. Huella del baseline vs referencia (PostgreSQL + shim)'
  $FpBefore = Get-Fingerprint
  if ($null -eq $FpBefore) { Stop-Run 'no se pudo calcular la huella del baseline' }
  $Results['5. Huella vs referencia'] = Compare-WithReference $FpBefore

  # ---------------------------------------------------------------------------
  Log '== 6. Pruebas Etapa 7 (transaccion con ROLLBACK)'
  $usersBefore = (Invoke-Psql @('-At', '-c', 'select count(*) from auth.users') -Quiet).Lines[0].Trim()
  $identities  = (Invoke-Psql @('-At', '-c', 'select count(*) from public.analytics_identity') -Quiet).Lines[0].Trim()
  $SeqBefore   = Get-SeqState
  if ($null -eq $SeqBefore -or $SeqBefore -notmatch '^\d+\|(true|false)$') { Stop-Run "estado de secuencia ilegible: '$SeqBefore'" }
  Log "    Estado previo: auth.users=$usersBefore, analytics_identity=$identities, analytics_alias_seq=$SeqBefore"
  if ($identities -eq '0' -and $SeqBefore -like '*|true' -and -not $AceptarEstadoSecuencia) {
    Log '    La secuencia fue consumida pero analytics_identity esta vacia: posible ejecucion interrumpida anterior.'
    Show-InterruptionHelp
    Stop-Run 'estado de la secuencia no verificado (usar -AceptarEstadoSecuencia solo tras diagnosticarlo)'
  }
  # Marcador ANTES de tocar la secuencia: sobrevive a una interrupcion abrupta.
  Set-Content -Path $Marker -Encoding ASCII -Value @(
    "proyecto=$ProjectId", "contenedor=$Container", "inicio=$(Get-Date -Format 's')",
    "secuencia_previa=$SeqBefore", "auth_users_previo=$usersBefore", "log=$LogFile")
  $SeqCaptured = $true
  try {
    $r = Invoke-Psql @('-f', "$RemoteDir/supabase_local_run_tests.sql") -Quiet
    $show = $false
    foreach ($l in $r.Lines) {
      if ($l -match '== Fallas') { $show = $true }
      if ($show -or $l -match 'ERROR|FALLA') { Log "    $l" }
    }
    $summary = @($r.Lines | Where-Object { $_ -match 'PRUEBAS ETAPA 7: (\d+) de \1 OK' })
    $rolledBack = @($r.Lines | Where-Object { $_ -match 'TRANSACCION DE PRUEBAS REVERTIDA' }).Count -gt 0
    if ($r.Code -eq 0 -and $summary.Count -gt 0 -and $rolledBack) {
      $TestsOk = $true
      $Results['6. Pruebas'] = 'OK (' + ($summary[0] -replace '.*PRUEBAS ETAPA 7: ', '') + ')'
    } else {
      $Results['6. Pruebas'] = "FALLA (codigo $($r.Code))"
    }
  } finally {
    Log '== 7. Restauracion y verificacion de la secuencia de alias'
    $Results['7. Secuencia'] = Restore-Sequence
    $SeqDone = $true
    if ($Results['7. Secuencia'] -like 'OK*') {
      Remove-Item -Path $Marker -ErrorAction SilentlyContinue
    } else {
      Show-InterruptionHelp
    }
  }

  # ---------------------------------------------------------------------------
  Log '== 8. Huella del baseline: antes vs despues en esta instancia'
  $fpAfter = Get-Fingerprint
  if ($null -eq $fpAfter) {
    $Results['8. Huella antes/despues'] = 'FALLA (no se pudo calcular)'
  } elseif (Test-SameLines $FpBefore $fpAfter) {
    Log "    OK: identica a la del paso 5 ($($fpAfter.Count) lineas)"
    $Results['8. Huella antes/despues'] = 'OK (identica)'
  } else {
    Log '    DIFERENCIAS en la misma instancia (posible regresion):'
    foreach ($x in (Compare-Object -ReferenceObject $FpBefore -DifferenceObject $fpAfter -CaseSensitive)) {
      $side = if ($x.SideIndicator -eq '<=') { 'antes' } else { 'despues' }
      Log "      [$side] $($x.InputObject)"
    }
    $Results['8. Huella antes/despues'] = 'FALLA (cambio durante la ejecucion)'
  }

  # ---------------------------------------------------------------------------
  Log '== 9. Guarda: re-aplicar la migracion de Etapa 7 debe abortar'
  if (-not $TestsOk) {
    Log '    OMITIDA: las pruebas no terminaron satisfactoriamente'
    $Results['9. Guarda'] = 'OMITIDA (pruebas fallidas)'
  } elseif ($Results['7. Secuencia'] -notlike 'OK*') {
    Log '    OMITIDA: la secuencia de alias no quedo verificada'
    $Results['9. Guarda'] = 'OMITIDA (secuencia no verificada)'
  } else {
    $r = Invoke-Psql @('-f', "$RemoteDir/$Migration") -Quiet
    $guard = @($r.Lines | Where-Object { $_ -match 'alguna de las tablas de Etapa 7 ya existe' })
    if ($r.Code -ne 0 -and $guard.Count -gt 0) {
      Log '    OK: abortada por la guarda, sin cambios'
      $Results['9. Guarda'] = 'OK'
    } else {
      foreach ($l in $r.Lines) { Log "    $l" }
      $Results['9. Guarda'] = "FALLA (codigo $($r.Code))"
    }
  }

  # ---------------------------------------------------------------------------
  Log '== 10. Postcheck (solo lectura)'
  $last, $called = $SeqBefore.Split('|')
  $r = Invoke-Psql @('-v', "users_before=$usersBefore", '-v', "seq_last=$last",
                     '-v', "seq_called=$called", '-f', "$RemoteDir/supabase_local_postcheck.sql")
  $Results['10. Postcheck'] = $(if ($r.Code -eq 0) { 'OK' } else { 'FALLA' })
  }  # fin de pasos 4-10 (modo normal)
}
catch {
  $Results['Ejecucion'] = 'ABORTADO'
  if ($_.Exception.Message -notlike 'ABORTADO:*') { Log "    ERROR: $($_.Exception.Message)" }
}
finally {
  # Si se capturo la secuencia y no se llego a restaurar (error inesperado
  # entre la captura y el paso 7), se intenta aqui.
  if ($SeqCaptured -and -not $SeqDone) {
    Log '== 7. Restauracion y verificacion de la secuencia de alias (tras error)'
    try {
      $Results['7. Secuencia'] = Restore-Sequence
      if ($Results['7. Secuencia'] -like 'OK*') { Remove-Item -Path $Marker -ErrorAction SilentlyContinue }
      else { Show-InterruptionHelp }
    } catch {
      $Results['7. Secuencia'] = 'NO VERIFICADA'
      Show-InterruptionHelp
    }
  }
  if ($Copied) {
    Log '== 11. Limpieza de archivos temporales en el contenedor'
    $r = Invoke-ContainerShell ('rm -rf ' + $RemoteDir)
    Log $(if ($r.Code -eq 0) { '    OK' } else { '    AVISO: no se pudo borrar ' + $RemoteDir })
  }
}

Log ''
Log ('== RESUMEN (Supabase local, contenedor ' + $Container + ')')
foreach ($k in $Results.Keys) { Log ('    {0,-28} {1}' -f $k, $Results[$k]) }

if ($SoloDiagnostico) {
  Log '    RESULTADO: DIAGNOSTICO (no valida la etapa)'
  Log "    Log: $LogFile"
  exit $(if ($Results['Diagnostico'] -like 'OK*') { 0 } else { 1 })
}

$required = @('0. Marcador', '1. Repositorio', '2. Contenedor', '3. Copia', '4. Preflight',
              '5. Huella vs referencia', '6. Pruebas', '7. Secuencia',
              '8. Huella antes/despues', '9. Guarda', '10. Postcheck')
$approved = $true
foreach ($k in $required) {
  if (-not $Results.Contains($k) -or $Results[$k] -notlike 'OK*') { $approved = $false }
}
if ($Results.Contains('Ejecucion')) { $approved = $false }
Log $(if ($approved) { '    RESULTADO: APROBADA' } else { '    RESULTADO: FALLA' })
Log "    Log: $LogFile"
if ($approved) { exit 0 } else { exit 1 }
