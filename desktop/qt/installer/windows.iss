; Inno Setup script for the Qt desktop shell. Built by desktop/qt/scripts/package.py:
;   ISCC /DAppVersion=x.y.z /DSourceDir=... /DOutputDir=... /DOutputBaseFilename=... windows.iss
; Per-user install without UAC, like the Electron NSIS config (oneClick, perMachine: false).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Data Slicer Qt"
#define AppExe "Data Slicer Qt.exe"

[Setup]
AppId={{6C1E3E0B-9B7E-4C8C-9F0B-3D5A8E2C7A41}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Henry Wiechert (datafeta.io)
AppCopyright=Copyright (C) 2024-2026 Henry Wiechert (datafeta.io)
DefaultDirName={localappdata}\Programs\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
CloseApplications=yes

[InstallDelete]
; Drop files from the previous version before copying the new bundle.
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
