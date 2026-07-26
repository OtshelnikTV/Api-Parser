/**
 * Менеджер истории для undo/redo функционала
 */
export class HistoryManager {
    constructor(maxSize = 50) {
        this.history = [];          // стек состояний
        this.currentIndex = -1;     // текущая позиция в истории
        this.maxSize = maxSize;     // максимальный размер истории
        this.isRestoring = false;   // флаг для предотвращения рекурсии
    }

    /**
     * Сохранить текущее состояние в историю
     * @param {Object} state - состояние для сохранения
     */
    push(state) {
        if (this.isRestoring) return;

        // Глубокое клонирование состояния
        const clonedState = JSON.parse(JSON.stringify(state));

        // Если мы не в конце истории, удаляем все состояния после текущего
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Добавляем новое состояние
        this.history.push(clonedState);
        this.currentIndex++;

        // Ограничиваем размер истории
        if (this.history.length > this.maxSize) {
            this.history.shift();
            this.currentIndex--;
        }
    }

    /**
     * Отменить последнее изменение
     * @returns {Object|null} предыдущее состояние или null
     */
    undo() {
        if (!this.canUndo()) return null;

        this.currentIndex--;
        this.isRestoring = true;
        const state = JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        this.isRestoring = false;
        return state;
    }

    /**
     * Повторить отмененное изменение
     * @returns {Object|null} следующее состояние или null
     */
    redo() {
        if (!this.canRedo()) return null;

        this.currentIndex++;
        this.isRestoring = true;
        const state = JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        this.isRestoring = false;
        return state;
    }

    /**
     * Проверить, можно ли отменить
     * @returns {boolean}
     */
    canUndo() {
        return this.currentIndex > 0;
    }

    /**
     * Проверить, можно ли повторить
     * @returns {boolean}
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    /**
     * Очистить всю историю
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }

    /**
     * Получить размер истории
     * @returns {number}
     */
    size() {
        return this.history.length;
    }

    /**
     * Получить текущую позицию в истории
     * @returns {number}
     */
    getCurrentIndex() {
        return this.currentIndex;
    }
}
