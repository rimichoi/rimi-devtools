import { prefs, type Theme } from './prefs';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

export function createThemeToggle(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';

  function sync(theme: Theme): void {
    button.textContent = theme === 'dark' ? '라이트 모드' : '다크 모드';
  }

  button.addEventListener('click', () => {
    const next: Theme = prefs.getTheme() === 'dark' ? 'light' : 'dark';
    prefs.setTheme(next);
    applyTheme(next);
    sync(next);
  });

  sync(prefs.getTheme());
  return button;
}
