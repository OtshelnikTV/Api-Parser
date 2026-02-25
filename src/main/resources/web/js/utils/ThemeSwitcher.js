/**
 * ThemeSwitcher - Manages theme switching between dark and light pink themes
 */
class ThemeSwitcher {
    constructor() {
        this.THEMES = {
            DARK: 'dark',
            LIGHT_PINK: 'light-pink'
        };
        
        this.STORAGE_KEY = 'app-theme';
        this.currentTheme = this.loadTheme();
        this.applyTheme(this.currentTheme);
    }

    /**
     * Load theme from localStorage or default to dark
     */
    loadTheme() {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        return savedTheme || this.THEMES.DARK;
    }

    /**
     * Save theme to localStorage
     */
    saveTheme(theme) {
        localStorage.setItem(this.STORAGE_KEY, theme);
    }

    /**
     * Apply theme to document
     */
    applyTheme(theme) {
        const root = document.documentElement;
        
        if (theme === this.THEMES.LIGHT_PINK) {
            root.setAttribute('data-theme', 'light-pink');
        } else {
            root.removeAttribute('data-theme');
        }
        
        this.currentTheme = theme;
        this.updateToggleButton();
    }

    /**
     * Toggle between themes
     */
    toggle() {
        const newTheme = this.currentTheme === this.THEMES.DARK 
            ? this.THEMES.LIGHT_PINK 
            : this.THEMES.DARK;
        
        this.applyTheme(newTheme);
        this.saveTheme(newTheme);
    }

    /**
     * Update toggle button icon
     */
    updateToggleButton() {
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.textContent = this.currentTheme === this.THEMES.DARK ? '🌸' : '🌙';
            button.title = this.currentTheme === this.THEMES.DARK 
                ? 'Переключить на светлую розовую тему' 
                : 'Переключить на темную тему';
        }
    }

    /**
     * Get current theme
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * Check if current theme is light pink
     */
    isLightPink() {
        return this.currentTheme === this.THEMES.LIGHT_PINK;
    }
}

// Create singleton instance
const themeSwitcher = new ThemeSwitcher();

export default themeSwitcher;
