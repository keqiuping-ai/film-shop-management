param(
  [Parameter(Mandatory = $true)]
  [string]$CredentialFile
)

$ErrorActionPreference = 'Stop'
$secure = Get-Content -Raw -Path $CredentialFile | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
