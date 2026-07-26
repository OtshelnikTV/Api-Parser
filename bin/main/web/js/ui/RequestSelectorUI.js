import { DOMHelpers } from '../utils/DOMHelpers.js';

/**
 * UI компонент для выбора запроса (Шаг 2)
 */
export class RequestSelectorUI {
    constructor(fileService, projectState, onBack, onNext) {
        this.fileService = fileService;
        this.projectState = projectState;
        this.onBack = onBack;
        this.onNext = onNext;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Поиск
        document.getElementById('request-search').addEventListener('input', (e) => {
            this.renderRequestList(e.target.value);
        });

        // Кнопка "Назад"
        const backBtn = document.getElementById('btn-back-to-project');
        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.onBack();
            });
        }

        // Кнопка "Далее"
        const nextBtn = document.getElementById('btn-next-method');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.proceedToNext();
            });
        }
    }

    show() {
        DOMHelpers.hideAllScreens();
        DOMHelpers.show('setup-request');
        
        this.projectState.selectedRequest = null;
        this.projectState.selectedMethod = null;
        document.getElementById('btn-next-method').disabled = true;
        document.getElementById('request-search').value = '';
        
        this.renderRequestList();
    }

    renderRequestList(filter = '') {
        const container = document.getElementById('request-list');
        const entries = this.projectState.getEndpointsList()
            .filter(ep => ep.name.toLowerCase().includes(filter.toLowerCase()));

        if (!entries.length) {
            container.innerHTML = '<div style="padding:24px;text-align:center;color:#8b949e;">Ничего не найдено</div>';
            return;
        }

        container.innerHTML = entries.map(ep => {
            const selected = this.projectState.selectedRequest === ep.name ? 'selected' : '';
            
            // ✅ Если методы не загружены, показываем "?"
            const tags = ep.methods && ep.methods.length > 0
                ? ep.methods.map(m => `<span class="method-tag method-tag-${m}">${m}</span>`).join('')
                : '<span style="color:#8b949e;">?</span>';
            
            return `<div class="request-item ${selected}" data-request="${ep.name}">
                <span class="request-item-name">${DOMHelpers.escape(ep.name)}</span>
                <div class="request-item-methods">${tags}</div>
            </div>`;
        }).join('');

        // Добавляем обработчики клика
        container.querySelectorAll('.request-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectRequest(item.dataset.request);
            });
        });
    }

    async selectRequest(requestName) {
        this.projectState.selectedRequest = requestName;
        this.projectState.selectedMethod = null;
        
        // ✅ Загружаем содержимое endpoint перед переходом далее
        const searchValue = document.getElementById('request-search').value;
        this.renderRequestList(searchValue);
        
        // Показываем индикатор загрузки на кнопке
        const btn = document.getElementById('btn-next-method');
        btn.disabled = true;
        btn.textContent = 'Загрузка...';
        
        try {
            // ✅ Ленивая загрузка содержимого
            await this.fileService.loadEndpointContent(requestName, this.projectState);
            
            // Обновляем список (теперь методы известны)
            this.renderRequestList(searchValue);
            
            btn.disabled = false;
            btn.textContent = 'Далее →';
        } catch (error) {
            console.error('Ошибка загрузки endpoint:', error);
            btn.disabled = false;
            btn.textContent = 'Далее →';
            // Можно показать уведомление об ошибке
        }
    }

    proceedToNext() {
        if (!this.projectState.selectedRequest) return;
        this.onNext();
    }
}
