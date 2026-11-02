import { runtimeValue } from './bindings';

type LegacyEvent = any;
type LegacyValue = any;

export function exportData(): void {
  const RuntimeBlob = runtimeValue<typeof Blob>('Blob');
  const blob = new RuntimeBlob(
    [
      runtimeValue<typeof JSON>('JSON').stringify(
        runtimeValue('state'),
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const anchor = runtimeValue<Document>('document').createElement('a');
  anchor.href = runtimeValue<typeof URL>('URL').createObjectURL(blob);
  anchor.download =
    runtimeValue<LegacyValue>('APP_BRAND_SLUG') + '-backup.json';
  anchor.click();
  runtimeValue<typeof URL>('URL').revokeObjectURL(anchor.href);
}

export function handleFileImport(event: LegacyEvent): void {
  if (event.target.id !== 'importFile') return;
  const file = event.target.files[0];
  if (!file) return;
  const RuntimeFileReader = runtimeValue<typeof FileReader>('FileReader');
  const reader = new RuntimeFileReader();
  reader.onload = function () {
    try {
      const data = runtimeValue<typeof JSON>('JSON').parse(
        reader.result as string,
      );
      if (
        !data ||
        !runtimeValue<typeof Array>('Array').isArray(data.ingredients)
      ) {
        const RuntimeError = runtimeValue<typeof Error>('Error');
        throw new RuntimeError(
          'not a ' +
            runtimeValue<LegacyValue>('APP_BRAND_NAME') +
            ' backup',
        );
      }
      if (
        runtimeValue<(value: LegacyValue, activity: string) => boolean>(
          'replaceCostingStateSafely',
        )(data, 'Imported a backup file')
      ) {
        runtimeValue<(message: string) => void>('alert')(
          'Backup imported successfully.',
        );
      }
    } catch (error) {
      runtimeValue<(message: string) => void>('alert')(
        'Could not read that file: ' + (error as LegacyValue).message,
      );
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}
