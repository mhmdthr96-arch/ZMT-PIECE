# =====================================================================
# mssql-bak.ps1  --  Restore a SQL Server .bak and export its tables to JSON
# =====================================================================
param(
  [Parameter(Mandatory=$true)][string]$BakPath,
  [string]$DataDir = '',
  [string]$Instance = '(localdb)\MSSQLLocalDB',
  [string]$Mode = 'detect',
  [string]$Tables = '',
  [string]$DbName = ''
)

$ErrorActionPreference = 'Stop'

# Keep the JSON payload and SQL diagnostics readable on machines whose console
# code page is not UTF-8 (a French .NET runtime used to emit «??ExecuteNonQuery??»).
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $OutputEncoding = [Console]::OutputEncoding
} catch {}

function Emit($obj) {
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  Write-Output $json
}

function Get-CnStr($db) {
  "Server=$Instance;Database=$db;Integrated Security=True;TrustServerCertificate=True"
}

# Escape a value placed inside N'...' / '...' in a T-SQL statement.
function SqlQuote([string]$value) {
  return ([string]$value).Replace("'", "''")
}

# Escape an identifier placed inside [ ... ] in a T-SQL statement.
function SqlBracket([string]$value) {
  return ([string]$value).Replace(']', ']]')
}

# The logical file names are DIFFERENT for every legacy database (HASSAN,
# STOCK, ...). RESTORE FILELISTONLY is the only reliable source — never hardcode
# them. `,$list` keeps the ArrayList as one object instead of unrolling it.
function Get-BakLogicalFiles([string]$bakPath) {
  $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr 'master')
  try {
    $cn.Open()
    $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 300
    $cmd.CommandText = "RESTORE FILELISTONLY FROM DISK = N'$(SqlQuote $bakPath)'"
    $da = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    [void]$da.Fill($dt)
    $list = New-Object System.Collections.ArrayList
    foreach ($r in $dt.Rows) {
      [void]$list.Add([PSCustomObject]@{
        name = [string]$r['LogicalName']
        type = ([string]$r['Type']).Trim()
      })
    }
    if ($list.Count -eq 0) {
      throw "RESTORE FILELISTONLY returned no files for: $bakPath"
    }
    return ,$list
  } finally {
    $cn.Close(); $cn.Dispose()
  }
}

# Build one MOVE clause per logical file plus the exact list of temp files that
# must be removed afterwards. First D -> .mdf, first L -> .ldf, any extra
# data/full-text files get unique .ndf names.
function New-RestoreMoveClauses($logical, [string]$tempName, [string]$dataDir) {
  $dataCount = @($logical | Where-Object { $_.type -eq 'D' }).Count
  $logCount  = @($logical | Where-Object { $_.type -eq 'L' }).Count
  if ($dataCount -eq 0 -or $logCount -eq 0) {
    $seen = (@($logical | ForEach-Object { "$($_.name) [$($_.type)]" }) -join ', ')
    throw "Cannot build RESTORE MOVE clauses: at least one data (D) and one log (L) file are required. FILELISTONLY returned: $seen"
  }

  $clauses = New-Object System.Collections.ArrayList
  $targets = New-Object System.Collections.ArrayList
  $dataIndex = 0
  $logIndex = 0

  foreach ($f in $logical) {
    if ($f.type -eq 'L') {
      if ($logIndex -eq 0) { $target = Join-Path $dataDir ($tempName + '.ldf') }
      else { $target = Join-Path $dataDir ($tempName + '_log' + $logIndex + '.ldf') }
      $logIndex++
    } elseif ($f.type -eq 'D') {
      if ($dataIndex -eq 0) { $target = Join-Path $dataDir ($tempName + '.mdf') }
      else { $target = Join-Path $dataDir ($tempName + '_' + $dataIndex + '.ndf') }
      $dataIndex++
    } elseif ($f.type -eq 'F') {
      $target = Join-Path $dataDir ($tempName + '_ft' + $clauses.Count + '.ndf')
    } else {
      continue
    }
    [void]$clauses.Add("MOVE N'$(SqlQuote $f.name)' TO N'$(SqlQuote $target)'")
    [void]$targets.Add($target)
  }

  return [PSCustomObject]@{
    Clauses = $clauses.ToArray()
    Files   = $targets.ToArray()
  }
}

try {
  # selftest needs no real backup; every other mode still validates the path.
  if ($Mode -ne 'selftest' -and -not (Test-Path -LiteralPath $BakPath)) {
    throw "Backup file not found: $BakPath"
  }
  if (-not $DataDir) { $DataDir = [System.IO.Path]::GetTempPath() }
  if (-not (Test-Path -LiteralPath $DataDir)) {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  }

  # Deterministic self-test of the MOVE builder: no SQL connection, no backup
  # file. Covers multiple data files, a log file and a quote in a logical name.
  if ($Mode -eq 'selftest') {
    $sample = @(
      [PSCustomObject]@{ name = 'DATA_1'; type = 'D' },
      [PSCustomObject]@{ name = 'DATA_2'; type = 'D' },
      [PSCustomObject]@{ name = 'DATA_log'; type = 'L' },
      [PSCustomObject]@{ name = "O'Brien_FT"; type = 'F' }
    )
    $moves = New-RestoreMoveClauses -logical $sample -tempName 'SELFTEST' -dataDir 'C:\ZMT'
    Emit @{ ok = $true; mode = 'selftest'; moves = $moves.Clauses; files = $moves.Files }
    exit 0
  }

  # Diagnostic-only mode: reports the logical names and the exact MOVE clauses
  # that will be used, without restoring or touching any database.
  if ($Mode -eq 'filelist') {
    $logical = Get-BakLogicalFiles -bakPath $BakPath
    $preview = New-RestoreMoveClauses -logical $logical -tempName 'ZMT_FILELIST_PREVIEW' -dataDir $DataDir
    Emit @{
      ok = $true; mode = 'filelist'
      logical = $logical.ToArray()
      moves = $preview.Clauses
      files = $preview.Files
    }
    exit 0
  }

  if ($Mode -eq 'detect') {
    $logical = Get-BakLogicalFiles -bakPath $BakPath
    $tmpName = if ($DbName) { $DbName } else { 'ZMT_TMP_' + (Get-Date -Format 'yyyyMMddHHmmss') + '_' + (Get-Random -Maximum 9999) }
    $moves = New-RestoreMoveClauses -logical $logical -tempName $tmpName -dataDir $DataDir

    $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr 'master')
    try {
      $cn.Open()
      $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 600
      $cmd.CommandText = "RESTORE DATABASE [$(SqlBracket $tmpName)] FROM DISK = N'$(SqlQuote $BakPath)' WITH $($moves.Clauses -join ', '), REPLACE, RECOVERY, STATS = 10"
      $cmd.ExecuteNonQuery() | Out-Null
    } finally { $cn.Close(); $cn.Dispose() }

    $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr $tmpName)
    try {
      $cn.Open()
      $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 300
      $cmd.CommandText = "SELECT s.name + '.' + t.name AS tbl, p.rows AS rows FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id JOIN sys.partitions p ON t.object_id=p.object_id AND p.index_id IN (0,1) WHERE s.name='dbo' GROUP BY s.name, t.name, p.rows ORDER BY t.name"
      $da = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
      $tblDt = New-Object System.Data.DataTable; [void]$da.Fill($tblDt)
      $tblArr = New-Object System.Collections.ArrayList
      foreach ($r in $tblDt.Rows) { [void]$tblArr.Add([PSCustomObject]@{ name = [string]$r['tbl']; rows = [int]$r['rows'] }) }
    } finally { $cn.Close(); $cn.Dispose() }

    $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr 'master')
    try {
      $cn.Open()
      $c = $cn.CreateCommand(); $c.CommandTimeout = 120
      $c.CommandText = "ALTER DATABASE [$(SqlBracket $tmpName)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$(SqlBracket $tmpName)]"
      try { $c.ExecuteNonQuery() | Out-Null } catch {}
    } finally { $cn.Close(); $cn.Dispose() }

    foreach ($f in $moves.Files) {
      try { Remove-Item -LiteralPath $f -ErrorAction SilentlyContinue } catch {}
    }

    Emit @{ ok = $true; mode = 'detect'; tables = $tblArr.ToArray(); logical = $logical.ToArray() }
    exit 0
  }

  if ($Mode -eq 'export') {
    $tmpName = if ($DbName) { $DbName } else { 'ZMT_TMP_' + (Get-Date -Format 'yyyyMMddHHmmss') + '_' + (Get-Random -Maximum 9999) }
    $logical = Get-BakLogicalFiles -bakPath $BakPath
    $moves = New-RestoreMoveClauses -logical $logical -tempName $tmpName -dataDir $DataDir

    $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr 'master')
    try {
      $cn.Open()
      $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 600
      $cmd.CommandText = "RESTORE DATABASE [$(SqlBracket $tmpName)] FROM DISK = N'$(SqlQuote $BakPath)' WITH $($moves.Clauses -join ', '), REPLACE, RECOVERY, STATS = 10"
      $cmd.ExecuteNonQuery() | Out-Null
    } finally { $cn.Close(); $cn.Dispose() }

    if (-not $Tables) {
      $Tables = 'Stock,Client,Clientbis,Fournisseur,Fournisseurbis,Fact1,Fact2,Fact1four,Fact2Four,credit_clients,mouvement_caisse'
    }
    $tableList = $Tables.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }

    $exported = New-Object System.Collections.ArrayList
    foreach ($t in $tableList) {
      $tblName = $t
      if ($t -match '\.') { $tblName = $t.Split('.')[1] }
      $outFile = Join-Path $DataDir ($tblName + '.json')
      $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr $tmpName)
      try {
        $cn.Open()
        $da = New-Object System.Data.SqlClient.SqlDataAdapter ("SELECT * FROM dbo.[$(SqlBracket $tblName)]", $cn)
        $dt = New-Object System.Data.DataTable
        [void]$da.Fill($dt)
        $cols = @($dt.Columns | ForEach-Object { $_.ColumnName })
        $rows = New-Object System.Collections.ArrayList
        foreach ($r in $dt.Rows) {
          $o = [ordered]@{}
          foreach ($c in $cols) {
            $v = $r[$c]
            if ($v -is [System.DBNull]) { $o[$c] = $null }
            elseif ($v -is [DateTime]) { $o[$c] = $v.ToString('yyyy-MM-dd HH:mm:ss') }
            elseif ($v -is [byte[]]) { $o[$c] = '' }
            elseif ($v -is [bool]) { $o[$c] = [bool]$v }
            else { $o[$c] = $v }
          }
          [void]$rows.Add([PSCustomObject]$o)
        }
        $json = ConvertTo-Json -InputObject $rows -Depth 4 -Compress
        [System.IO.File]::WriteAllText($outFile, $json, (New-Object System.Text.UTF8Encoding($false)))
        [void]$exported.Add([PSCustomObject]@{ name = $tblName; rows = $rows.Count; file = $outFile })
      } finally { $cn.Close(); $cn.Dispose() }
    }

    $cn = New-Object System.Data.SqlClient.SqlConnection (Get-CnStr 'master')
    try {
      $cn.Open()
      $c = $cn.CreateCommand(); $c.CommandTimeout = 120
      $c.CommandText = "ALTER DATABASE [$(SqlBracket $tmpName)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$(SqlBracket $tmpName)]"
      try { $c.ExecuteNonQuery() | Out-Null } catch {}
    } finally { $cn.Close(); $cn.Dispose() }

    foreach ($f in $moves.Files) {
      try { Remove-Item -LiteralPath $f -ErrorAction SilentlyContinue } catch {}
    }

    Emit @{ ok = $true; mode = 'export'; dataDir = $DataDir; tables = $exported.ToArray() }
    exit 0
  }

  throw "Unknown mode: $Mode"
} catch {
  Emit @{ ok = $false; mode = $Mode; error = $_.Exception.Message }
  exit 1
}


