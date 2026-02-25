/**
 * Сервис для показа уведомлений
 */
export class NotificationService {
    /**
     * Показать уведомление
     * @param {string} message - Текст сообщения
     * @param {string} type - Тип: 'success', 'error', 'info'
     */
    static show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3200);
    }

    static success(message) {
        this.show(message, 'success');
    }

    static error(message) {
        this.show(message, 'error');
    }

    static info(message) {
        this.show(message, 'info');
    }
}
