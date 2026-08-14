import type { ToolModule } from '../../types';
import { createDropZone } from '../../ui/dropZone';
import { createCopyButton } from '../../ui/copyButton';
import { toExifRows, extractGps, formatCoordinate } from './logic';

const mod: ToolModule = {
  mount(root) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-custom';

    const preview = document.createElement('img');
    preview.className = 'exif-preview';
    preview.alt = '';
    preview.hidden = true;

    const gpsWarn = document.createElement('div');
    gpsWarn.className = 'io-warn';

    const table = document.createElement('table');
    table.className = 'exif-table';

    const error = document.createElement('div');
    error.className = 'io-error';

    const head = document.createElement('div');
    head.className = 'io-output-head section-heading';
    const headLabel = document.createElement('label');
    headLabel.textContent = '메타데이터';
    head.append(
      headLabel,
      createCopyButton(() =>
        [...table.rows].map((row) => `${row.cells[0]?.textContent}: ${row.cells[1]?.textContent}`).join('\n'),
      ),
    );

    let objectUrl: string | null = null;

    function revoke(): void {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }

    async function handleFile(file: File): Promise<void> {
      error.textContent = '';
      gpsWarn.textContent = '';
      table.replaceChildren();

      revoke();
      objectUrl = URL.createObjectURL(file);
      preview.src = objectUrl;
      preview.hidden = false;

      try {
        const exifr = await import('exifr');
        const raw = (await exifr.parse(file, { gps: true })) as Record<string, unknown> | undefined;

        if (!raw) {
          error.textContent = 'EXIF 정보가 없는 이미지입니다. (스크린샷이나 편집된 이미지는 보통 없습니다)';
          return;
        }

        const gps = extractGps(raw);
        if (gps) {
          gpsWarn.textContent = `주의: 촬영 위치(GPS)가 들어 있습니다. ${formatCoordinate(gps.lat, gps.lon)}\n공유 전에 제거를 검토하세요.`;
        }

        for (const row of toExifRows(raw)) {
          const tr = table.insertRow();
          tr.insertCell().textContent = row.label;
          tr.insertCell().textContent = row.value;
        }
      } catch (err) {
        error.textContent = `이미지를 읽지 못했습니다.\n${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const zone = createDropZone(wrap, (file) => void handleFile(file), 'image/*');
    wrap.append(preview, gpsWarn, head, table, error);
    root.append(wrap);

    return () => {
      revoke();
      zone.destroy();
      wrap.remove();
    };
  },
};

export default mod;
