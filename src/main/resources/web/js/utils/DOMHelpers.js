/**
 * Утилиты для работы с DOM
 */
export class DOMHelpers {
    /**
     * Экранирование HTML
     */
    static escape(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Показать элемент
     */
    static show(elementOrId) {
        const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (el) el.classList.remove('hidden');
    }

    /**
     * Скрыть элемент
     */
    static hide(elementOrId) {
        const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (el) el.classList.add('hidden');
    }

    /**
     * Скрыть все экраны
     */
    static hideAllScreens() {
        ['setup-project', 'setup-request', 'setup-method', 'main-editor'].forEach(id => {
            this.hide(id);
        });
    }

    /**
     * Автоматический resize для textarea
     */
    static autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 32) + 'px';
    }

    /**
     * Установить обработчик авторесайза на все textarea
     */
    static enableAutoResizeForAll() {
        document.querySelectorAll('textarea.cell-input, textarea.block-editor').forEach(ta => {
            this.autoResize(ta);
            ta.addEventListener('input', () => this.autoResize(ta));
        });
    }
}
