import { DOMHelpers } from '../utils/DOMHelpers.js';

/**
 * UI компонент для выбора метода (Шаг 3)
 */
export class MethodSelectorUI {
    constructor(projectState, onBack, onParse) {
        this.projectState = projectState;
        this.onBack = onBack;
        this.onParse = onParse;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Кнопка "Назад"
        const backBtn = document.getElementById('btn-back-to-requests');
        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.onBack();
            });
        }

        // Кнопка "Парсить"
        const parseBtn = document.getElementById('btn-parse');
        if (parseBtn) {
            parseBtn.addEventListener('click', () => {
                this.startParsing();
            });
        }
    }

    show() {
        const folder = this.projectState.getSelectedRequestFolder();
        if (!folder) return;

        // Если только один метод - сразу парсим
        if (folder.methods.length === 1) {
            this.projectState.selectedMethod = folder.methods[0];
            this.onParse();
            return;
        }

        // Показываем выбор метода
        DOMHelpers.hideAllScreens();
        DOMHelpers.show('setup-method');
        
        document.getElementById('selected-endpoint-name').textContent = this.projectState.selectedRequest;
        document.getElementById('btn-parse').disabled = true;
        
        this.renderMethodSelector(folder.methods);
    }

    renderMethodSelector(methods) {
        const colors = {
            get: '#58a6ff',
            post: '#3fb950',
            put: '#d29922',
            delete: '#f85149',
            patch: '#bc8cff'
        };

        const html = methods.map(m => {
            const color = colors[m] || '#8b949e';
            const rgb = this.hexToRgb(color);
            
            return `<button class="method-select-btn" data-method="${m}" 
                style="padding:16px 32px;border:2px solid ${color};background:rgba(${rgb},0.1);color:${color};border-radius:8px;font-size:16px;font-weight:700;text-transform:uppercase;cursor:pointer;transition:all 0.2s;">
                ${m}
            </button>`;
        }).join('');

        document.getElementById('method-selector').innerHTML = html;

        // Добавляем обработчики
        document.querySelectorAll('.method-select-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectMethod(btn.dataset.method));
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.05)';
                btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            });
            btn.addEventListener('mouseleave', () => {
                if (this.projectState.selectedMethod !== btn.dataset.method) {
                    btn.style.transform = 'scale(1)';
                    btn.style.boxShadow = 'none';
                }
            });
        });
    }

    selectMethod(method) {
        this.projectState.selectedMethod = method;
        
        // Подсветка выбранного
        document.querySelectorAll('.method-select-btn').forEach(btn => {
            if (btn.dataset.method === method) {
                btn.style.boxShadow = '0 0 0 3px #2ea043';
                btn.style.transform = 'scale(1.05)';
            } else {
                btn.style.opacity = '0.5';
            }
        });
        
        document.getElementById('btn-parse').disabled = false;
    }

    startParsing() {
        if (!this.projectState.selectedMethod) return;
        this.onParse();
    }

    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }
}
