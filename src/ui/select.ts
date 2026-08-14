export function createSelect(entries: readonly (readonly [string, string])[]): HTMLSelectElement {
  const select = document.createElement('select');
  for (const [value, label] of entries) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  return select;
}
