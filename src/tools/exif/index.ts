import type { ToolModule } from '../../types';
import { createDropZone } from '../../ui/dropZone';
import { createCopyButton } from '../../ui/copyButton';
import { toExifResult, extractGps, formatCoordinate } from './logic';

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
    head.className = 'io-output-head';
    const headLabel = document.createElement('label');
    headLabel.textContent = '메타데이터';
    head.append(
      headLabel,
      createCopyButton(() =>
        [...table.rows].map((row) => `${row.cells[0]?.textContent}: ${row.cells[1]?.textContent}`).join('\n'),
      ),
    );

    let objectUrl: string | null = null;
    // 드롭당 세대 번호. handleFile 이 async 라서 파일 A 처리 중에 파일 B 를
    // 드롭하면 두 호출이 동시에 진행될 수 있다 — 늦게 끝난 쪽이 먼저 끝난 쪽의
    // 미리보기 위에 자기 메타데이터와 GPS 배너를 덮어쓰는 걸 막는다. 언마운트도
    // "이후 결과는 전부 stale" 이라는 점에서 동일하므로 cleanup 에서도 증가시킨다.
    let generation = 0;

    function revoke(): void {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }

    async function handleFile(file: File): Promise<void> {
      const gen = ++generation;

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
        if (gen !== generation) return; // 더 최근 드롭이 있었다 — 이 결과는 버린다

        if (!raw) {
          error.textContent = 'EXIF 정보가 없는 이미지입니다. (스크린샷이나 편집된 이미지는 보통 없습니다)';
          return;
        }

        const result = toExifResult(raw);
        if (!result.ok) {
          error.textContent = result.error;
          return;
        }

        const gps = extractGps(raw);
        if (gps) {
          gpsWarn.textContent = `주의: 촬영 위치(GPS)가 들어 있습니다. ${formatCoordinate(gps.lat, gps.lon)}\n공유 전에 제거를 검토하세요.`;
        }

        if (result.value.partial) {
          error.textContent = '이미지 일부가 손상되어 있어 메타데이터 일부만 표시됩니다.';
        }

        for (const row of result.value.rows) {
          const tr = table.insertRow();
          tr.insertCell().textContent = row.label;
          tr.insertCell().textContent = row.value;
        }
      } catch (err) {
        if (gen !== generation) return; // 더 최근 드롭이 있었다 — 이 실패도 버린다
        error.textContent = `이미지를 읽지 못했습니다.\n${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const zone = createDropZone(wrap, (file) => void handleFile(file), 'image/*');
    // 라벨 스트립과 표를 하나의 패널로 묶는다. 형제 두 요소를 테두리 하나로
    // 감싸는 것은 CSS 만으로는 안 되므로 여기서 컨테이너를 만든다.
    const metaPanel = document.createElement('div');
    metaPanel.className = 'panel';
    metaPanel.append(head, table);
    wrap.append(preview, gpsWarn, metaPanel, error);
    root.append(wrap);

    return () => {
      generation++; // 언마운트 후 도착하는 결과도 stale 로 취급해 제거된 DOM 을 건드리지 않는다
      revoke();
      zone.destroy();
      wrap.remove();
    };
  },
};

export default mod;
