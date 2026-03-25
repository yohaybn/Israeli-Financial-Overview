; Inno Setup 6 — compile after running packaging/windows/package.ps1
; Run from repo root: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\windows\FinancialOverview.iss

#define MyAppName "Financial Overview"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Financial Overview"
#define SourceDir "..\\..\\dist\\windows-package"

[Setup]
AppId={{A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\FinancialOverview
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=FinancialOverview-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\launch-FinancialOverview.cmd"; WorkingDir: "{app}"
Name: "{group}\Open Financial Overview in browser"; Filename: "{app}\open-browser.cmd"; WorkingDir: "{app}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\launch-FinancialOverview.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
