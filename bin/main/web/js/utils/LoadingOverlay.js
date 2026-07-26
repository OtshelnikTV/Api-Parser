/**
 * Утилита для управления loading overlay
 */
export class LoadingOverlay {
    static show(message = 'Загрузка...') {
        const overlay = document.getElementById('loading-overlay');
        const text = document.getElementById('loading-text');
        const progress = document.getElementById('loading-progress');

        if (overlay) overlay.classList.remove('hidden');
        if (text) text.textContent = message;
        if (progress) progress.textContent = '';
    }

    static hide() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    static updateProgress(message) {
        const progress = document.getElementById('loading-progress');
        if (progress) progress.textContent = message;
    }
}
