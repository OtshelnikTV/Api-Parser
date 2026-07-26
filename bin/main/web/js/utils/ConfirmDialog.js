/**
 * Кастомная модалка подтверждения вместо нативного confirm().
 * Работает одинаково и в браузере, и в IDE WebView (IntelliJ JCEF).
 */
export class ConfirmDialog {
    /**
     * @param {string} message
     * @returns {Promise<boolean>}
     */
    static show(message) {
        return new Promise((resolve) => {
            const modal   = document.getElementById('confirm-modal');
            const msgEl   = document.getElementById('confirm-message');
            const yesBtn  = document.getElementById('confirm-yes');
            const noBtn   = document.getElementById('confirm-no');

            msgEl.textContent = message;
            modal.classList.remove('hidden');

            const cleanup = (result) => {
                modal.classList.add('hidden');
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                resolve(result);
            };

            const onYes = () => cleanup(true);
            const onNo  = () => cleanup(false);

            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
        });
    }
}
