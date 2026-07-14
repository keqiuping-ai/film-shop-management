param(
  [string]$CredentialFile = "$env:APPDATA\QUAD\customer-import-token.dat"
)

$ErrorActionPreference = 'Stop'
$parent = Split-Path -Parent $CredentialFile
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$secret = Read-Host '请输入 QUAD 专用导入密钥（输入不会显示）' -AsSecureString
$secret | ConvertFrom-SecureString | Set-Content -Encoding ASCII -Path $CredentialFile
Write-Host "QUAD 导入密钥已使用 Windows DPAPI 加密保存。只有当前 Windows 用户可解密。"
