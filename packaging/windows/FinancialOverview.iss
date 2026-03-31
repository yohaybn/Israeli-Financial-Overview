; Inno Setup 6 — compile after npm run windows:electron (packages app + Electron shell).
; Run from repo root: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\windows\FinancialOverview.iss

#define MyAppName "Financial Overview"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Financial Overview"
; Use output of: npm run windows:electron (electron-builder win-unpacked).
; For browser-only package without Electron, use: ..\\..\\dist\\windows-package
#define SourceDir "..\\..\\dist\\electron-win\\win-unpacked"

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
SetupIconFile=..\..\client\public\favicon.ico
UninstallDisplayIcon={app}\FinancialOverview.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\FinancialOverview.exe"; WorkingDir: "{app}"; IconFilename: "{app}\FinancialOverview.exe"
Name: "{group}\Open in browser (localhost)"; Filename: "{app}\resources\open-browser.cmd"; WorkingDir: "{app}\resources"; IconFilename: "{app}\FinancialOverview.exe"
Name: "{group}\Launch server (console)"; Filename: "{app}\resources\launch-FinancialOverview.cmd"; WorkingDir: "{app}\resources"; IconFilename: "{app}\FinancialOverview.exe"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\FinancialOverview.exe"; WorkingDir: "{app}"; IconFilename: "{app}\FinancialOverview.exe"; Tasks: desktopicon
