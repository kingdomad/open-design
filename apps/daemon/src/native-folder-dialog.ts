export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

export type NativeFolderDialogResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'exec-failed'; detail: string };

export type NativeFolderDialogPlatform = 'darwin' | 'linux' | 'win32';

const WINDOWS_FOLDER_DIALOG_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$owner = New-Object System.Windows.Forms.Form;',
  "$owner.Text = 'Open Design';",
  '$owner.TopMost = $true;',
  '$owner.ShowInTaskbar = $true;',
  "$owner.StartPosition = 'CenterScreen';",
  '$owner.Width = 1;',
  '$owner.Height = 1;',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
  "$dialog.Description = 'Select a code folder to link';",
  '$dialog.ShowNewFolderButton = $true;',
  'try {',
  '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
  '} finally {',
  '  $owner.Dispose();',
  '}',
].join(' ');

export function buildWindowsFolderDialogCommand(): NativeFolderDialogCommand {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Sta', '-Command', WINDOWS_FOLDER_DIALOG_SCRIPT],
  };
}

export function parseFolderDialogStdout(error: unknown, stdout: string): string | null {
  if (error) {
    return null;
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

export function classifyNativeFolderDialogResult(
  platform: NativeFolderDialogPlatform,
  error: unknown,
  stdout: string,
  stderr: string,
): NativeFolderDialogResult {
  const diagnostic = stderr.trim();

  if (platform === 'darwin') {
    const cancellationText = `${diagnostic}\n${error ? errorMessage(error) : ''}`;
    if (error && /user cancel(?:ed|led)|\(-128\)/i.test(cancellationText)) {
      return { ok: false, reason: 'cancelled' };
    }
  }

  if (
    platform === 'linux' &&
    error &&
    (errorCode(error) === 1 || errorCode(error) === '1') &&
    diagnostic.length === 0
  ) {
    return { ok: false, reason: 'cancelled' };
  }

  if (error) {
    return {
      ok: false,
      reason: 'exec-failed',
      detail: diagnostic || errorMessage(error),
    };
  }

  const selected = parseFolderDialogStdout(null, stdout);
  if (!selected) return { ok: false, reason: 'cancelled' };
  return { ok: true, path: platform === 'darwin' ? selected.replace(/\/$/, '') : selected };
}
