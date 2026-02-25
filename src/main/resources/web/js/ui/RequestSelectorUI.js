import { DOMHelpers } from '../utils/DOMHelpers.js';
import { LoadingOverlay } from '../utils/LoadingOverlay.js';

/**
 * UI компонент для выбора запроса (Шаг 2)
 */
export class RequestSelectorUI {
    constructor(projectState, onBack, onNext, fileService) {
        this.projectState = projectState;
        this.onBack = onBack;
        this.onNext = onNext;
        this.fileService = fileService;
        
        this.endpoints = [];
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

    async show() {
        DOMHelpers.hideAllScreens();
        DOMHelpers.show('setup-request');
        
        this.projectState.selectedRequest = null;
        this.projectState.selectedMethod = null;
        document.getElementById('btn-next-method').disabled = true;
        document.getElementById('request-search').value = '';
        
        await this.loadEndpoints();
        this.renderRequestList();
    }

    async loadEndpoints() {
        LoadingOverlay.show('Загрузка endpoints...');
        try {
            this.endpoints = await this.fileService.getProjectEndpoints(this.projectState.projectRoot);
        } catch (error) {
            console.error('Error loading endpoints:', error);
            this.endpoints = [];
        }
        LoadingOverlay.hide();
    }

    renderRequestList(filter = '') {
        const container = document.getElementById('request-list');
        const entries = this.endpoints
            .filter(ep => ep.name.toLowerCase().includes(filter.toLowerCase()));

        if (!entries.length) {
            container.innerHTML = '<div style="padding:24px;text-align:center;color:#8b949e;">Ничего не найдено</div>';
            return;
        }

        container.innerHTML = entries.map(ep => {
            const selected = this.projectState.selectedRequest === ep.name ? 'selected' : '';
            const tags = ep.methods.map(m =>
                `<span class="method-tag method-tag-${m}">${m}</span>`
            ).join('');
            
            return `<div class="request-item ${selected}" data-request="${ep.name}">
                <span class="request-item-name">${DOMHelpers.escape(ep.name)}</span>
                <div class="request-item-methods">${tags || '?'}</div>
            </div>`;
        }).join('');

        // Добавляем обработчики клика
        container.querySelectorAll('.request-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectRequest(item.dataset.request);
            });
        });
    }

    selectRequest(requestName) {
        this.projectState.selectedRequest = requestName;
        this.projectState.selectedMethod = null;
        document.getElementById('btn-next-method').disabled = false;
        
        const searchValue = document.getElementById('request-search').value;
        this.renderRequestList(searchValue);
    }

    proceedToNext() {
        if (!this.projectState.selectedRequest) return;
        this.onNext();
    }
}
