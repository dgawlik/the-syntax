

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$PromptPath
)

copilot --silent --allow-all-tools --agent=spl -p (Get-Content -LiteralPath $PromptPath -Raw)