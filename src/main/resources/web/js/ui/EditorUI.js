import { DOMHelpers } from '../utils/DOMHelpers.js';
import { FieldHelpers } from '../utils/FieldHelpers.js';

/**
 * UI компонент для редактирования спарсенных данных
 */
export class EditorUI {
    constructor(parsedData, markdownGenerator, onBackToRequests, onBackToProject) {
        this.parsedData = parsedData;
        this.markdownGenerator = markdownGenerator;
        this.onBackToRequests = onBackToRequests;
        this.onBackToProject = onBackToProject;
    }

    show() {
        DOMHelpers.hideAllScreens();
        DOMHelpers.show('main-editor');
        
        document.getElementById('status-path').textContent = this.parsedData.url;
        this.render();
        this.updateUnfilledCount();
    }

    render() {
        const content = document.getElementById('editor-content');
        
        let sections = `
            ${this.renderSection('s-general', '1. Общая информация', 'auto', this.renderGeneralInfo())}
            ${this.renderSection('s-request', '2. Request Body', 'auto', this.renderRequestBody())}
            ${this.renderSection('s-example-req', '2.1 Пример запроса', 'manual', this.renderExampleBlock('request'))}
        `;

        // Response sections
        sections += this.renderSection('s-response', '3. Response', 'auto', this.renderResponses());

        if (this.parsedData.responseSchemas.length) {
            for (let i = 0; i < this.parsedData.responseSchemas.length; i++) {
                const rs = this.parsedData.responseSchemas[i];
                sections += this.renderSection(
                    `s-resp-body-${i}`,
                    `3.${i + 1} Response Body (${rs.code}) — ${rs.schemaName}`,
                    'auto',
                    this.renderResponseBody(rs, i)
                );
            }
            sections += this.renderSection('s-example-resp', '3.2 Пример ответа', 'manual', this.renderExampleBlock('response'));
        }

        sections += `
            ${this.renderSection('s-deps', '4. Внешние зависимости', 'required', this.renderDependencies())}
            ${this.renderSection('s-logic', '5. Логика сборки', 'required', this.renderLogic())}
            ${this.renderSection('s-mermaid', '6. Блок-схема алгоритма', 'required', this.renderMermaidDiagram())}
            ${this.renderSection('s-notes', '7. Примечания', 'required', this.renderNotes())}
        `;

        content.innerHTML = sections;

        // Включить авторесайз для всех полей
        DOMHelpers.enableAutoResizeForAll();
        
        // Добавить обработчики на секции
        this.attachSectionHandlers();
        
        // Добавить обработчик для Mermaid редактора
        this.attachMermaidHandlers();
    }

    renderSection(id, title, badgeType, content, collapsed = false) {
        const badgeClass = badgeType === 'auto' ? 'badge-auto' : badgeType === 'manual' ? 'badge-manual' : 'badge-required';
        const badgeText = badgeType === 'auto' ? '✓ Авто' : badgeType === 'manual' ? '✎ Проверить' : '⚠ Заполнить';
        const collapsedClass = collapsed ? 'collapsed' : '';
        const collapsedBodyClass = collapsed ? 'collapsed-body' : '';

        return `<div class="template-section" id="${id}">
            <div class="section-header ${collapsedClass}" data-section="${id}">
                <span class="section-title">${title}<span class="section-badge ${badgeClass}">${badgeText}</span></span>
                <span class="section-chevron">▼</span>
            </div>
            <div class="section-body ${collapsedBodyClass}">${content}</div>
        </div>`;
    }

    attachSectionHandlers() {
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('collapsed');
                header.nextElementSibling.classList.toggle('collapsed-body');
            });
        });
    }

    renderGeneralInfo() {
        const mc = `method-${this.parsedData.method.toLowerCase()}`;
        return `<div class="kv-grid">
            <div class="kv-label">Метод</div>
            <div class="kv-value cell-auto">
                <span class="cell-static"><span class="method-badge ${mc}">${DOMHelpers.escape(this.parsedData.method)}</span></span>
            </div>
            <div class="kv-label">URL</div>
            <div class="kv-value cell-auto">
                <input type="text" class="cell-input auto-filled" value="${DOMHelpers.escape(this.parsedData.url)}" 
                    data-bind="parsedData.url">
            </div>
            <div class="kv-label">Тег</div>
            <div class="kv-value cell-auto">
                <input type="text" class="cell-input auto-filled" value="${DOMHelpers.escape(this.parsedData.tag)}" 
                    data-bind="parsedData.tag">
            </div>
            <div class="kv-label">Operation</div>
            <div class="kv-value cell-auto">
                <input type="text" class="cell-input auto-filled" value="${DOMHelpers.escape(this.parsedData.operationId)}" 
                    data-bind="parsedData.operationId">
            </div>
            <div class="kv-label">Описание</div>
            <div class="kv-value ${this.parsedData.summary ? 'cell-auto' : 'cell-manual'}">
                <textarea class="cell-input ${this.parsedData.summary ? 'auto-filled' : ''}" 
                    data-bind="parsedData.summary" placeholder="Описание...">${DOMHelpers.escape(this.parsedData.summary)}</textarea>
            </div>
        </div>`;
    }

    renderRequestBody() {
        let html = '';

        // Параметры (query, path, header)
        if (this.parsedData.parameters.length) {
            html += `<h4 style="color:#58a6ff;margin-bottom:12px;">Параметры</h4>`;
            let paramRows = '';
            for (let i = 0; i < this.parsedData.parameters.length; i++) {
                const p = this.parsedData.parameters[i];
                const inBadge = `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(88,166,255,0.15);color:#58a6ff;font-weight:600;">${p.in}</span>`;
                paramRows += `<tr>
                    <td class="cell-auto"><span class="cell-static"><code>${DOMHelpers.escape(p.name)}</code> ${inBadge}</span></td>
                    <td class="cell-auto"><span class="cell-static"><code>${DOMHelpers.escape(p.type)}</code></span></td>
                    <td class="cell-auto"><span class="cell-static">${p.required ? '✅' : '❌'}</span></td>
                    <td class="cell-auto"><span class="cell-static">${DOMHelpers.escape(p.format || '—')}</span></td>
                    <td class="cell-auto"><span class="cell-static">${DOMHelpers.escape(p.description || '—')}</span></td>
                    <td class="cell-auto"><span class="cell-static">${DOMHelpers.escape(p.example || '—')}</span></td>
                </tr>`;
            }
            html += `<div class="table-wrapper"><table class="edit-table">
                <thead><tr><th>Параметр</th><th>Тип</th><th>Обяз.</th><th>Формат</th><th>Описание</th><th>Пример</th></tr></thead>
                <tbody>${paramRows}</tbody></table></div>`;
        }

        // Request Body
        if (this.parsedData.requestFields.length) {
            if (html) html += '<div style="height:20px;"></div>';
            html += `<h4 style="color:#58a6ff;margin-bottom:12px;">Request Body</h4>`;
            html += `<p style="margin-bottom:12px;color:#8b949e;">Схема: <code style="color:#58a6ff;">${DOMHelpers.escape(this.parsedData.requestSchemaName)}</code></p>`;
            html += this.renderFieldsTable(this.parsedData.requestFields, true);
        }

        if (!html) {
            html = `<div class="info-note"><span class="info-note-icon">ℹ️</span><span>Параметры и Request Body не обнаружены.</span></div>`;
        }

        return html;
    }

    renderFieldsTable(fields, showSource = false) {
        if (!fields.length) {
            return `<div class="info-note"><span class="info-note-icon">ℹ️</span><span>Поля не обнаружены.</span></div>`;
        }

        const flat = FieldHelpers.flattenFields(fields);

        // Информация о вложенных структурах
        const maxDepth = Math.max(...flat.map(f => f.depth), 0);
        const hasNested = maxDepth > 0;

        let infoPanel = '';
        if (hasNested) {
            const nestedCount = flat.filter(f => f.depth > 0).length;
            const schemaNames = [...new Set(flat.filter(f => f.refName).map(f => f.refName))];
            infoPanel = `<div class="info-note" style="margin-bottom:12px;">
                <span class="info-note-icon">🔗</span>
                <span>Обнаружена вложенная структура: ${nestedCount} вложенных полей, использованы схемы: ${schemaNames.map(s => '<code>' + DOMHelpers.escape(s) + '</code>').join(', ')}</span>
            </div>`;
        }

        let rows = '';
        for (let i = 0; i < flat.length; i++) {
            const f = flat[i];
            const indentPx = f.depth * 24;

            // Древовидная структура
            let depthMarker = '';
            if (f.depth > 0) {
                const markers = [];
                for (let d = 1; d < f.depth; d++) {
                    markers.push('│&nbsp;&nbsp;');
                }
                markers.push('├─');
                depthMarker = '<span class="indent-marker">' + markers.join('') + ' </span>';
            }

            // Бейджи
            const refBadge = f.refName ? `<span class="nested-dto-badge">${DOMHelpers.escape(f.refName)}</span>` : '';
            const arrayBadge = f.isArray ? '<span class="array-badge">[]</span>' : '';

            const nameDisplay = `<div class="field-name-wrapper" style="margin-left:${indentPx}px">${depthMarker}<code>${DOMHelpers.escape(f.name)}</code>${arrayBadge}${refBadge}</div>`;

            const rowClass = f.depth > 0 ? ' nested-field' : '';

            // Если showSource = true, добавляем столбец "Источник"
            const sourceCell = showSource ? `<td class="cell-required">
                    <textarea class="cell-input" data-bind="${f.fieldPath}.source" placeholder="📥 Прямой ввод / 🧮 Вычисляемое">${DOMHelpers.escape(f.source || '')}</textarea>
                </td>` : '';

            rows += `<tr class="${rowClass}">
                <td class="cell-auto"><span class="cell-static">${nameDisplay}</span></td>
                <td class="cell-auto"><span class="cell-static"><code>${DOMHelpers.escape(f.type)}</code></span></td>
                <td class="cell-auto"><span class="cell-static">${f.required ? '✅' : '❌'}</span></td>
                <td class="cell-auto"><span class="cell-static">${DOMHelpers.escape(f.format || '—')}</span></td>
                <td class="${f.description ? 'cell-auto' : 'cell-manual'}">
                    <span class="cell-static">${DOMHelpers.escape(f.description || '—')}</span>
                </td>
                <td class="${f.example ? 'cell-auto' : 'cell-manual'}">
                    <span class="cell-static">${DOMHelpers.escape(f.example || '—')}</span>
                </td>
                ${sourceCell}
            </tr>`;
        }

        const sourceHeader = showSource ? '<th>Источник</th>' : '';

        return infoPanel + `<div class="table-wrapper"><table class="edit-table">
            <thead><tr><th>Поле</th><th>Тип</th><th>Обяз.</th><th>Формат</th><th>Описание</th><th>Пример</th>${sourceHeader}</tr></thead>
            <tbody>${rows}</tbody></table></div>`;
    }

    renderResponseBody(rs, idx) {
        return `<p style="margin-bottom:12px;color:#8b949e;">
            Код: <span class="response-code response-2xx">${rs.code}</span>
            Схема: <code style="color:#58a6ff;">${DOMHelpers.escape(rs.schemaName)}</code>
        </p>
        ${this.renderFieldsTable(rs.fields)}`;
    }

    renderExampleBlock(type) {
        const isReq = type === 'request';
        const value = isReq ? this.parsedData.exampleRequest : this.parsedData.exampleResponse;
        const binding = isReq ? 'parsedData.exampleRequest' : 'parsedData.exampleResponse';
        const fromMdFlag = isReq ? this.parsedData.exampleRequestFromMd : this.parsedData.exampleResponseFromMd;
        const note = fromMdFlag ? '' : `<div class="info-note"><span class="info-note-icon">✏️</span><span>Пример сгенерирован из DTO. Замените значения на реалистичные.</span></div>`;
        return `${note}
            <textarea class="block-editor highlight-manual" data-bind="${binding}" placeholder='{"field":"value"}'>${DOMHelpers.escape(value)}</textarea>`;
    }

    renderResponses() {
        let successHtml = '';
        for (const [code, data] of Object.entries(this.parsedData.responses)) {
            const desc = typeof data === 'object' ? (data.description || 'OK') : data;
            const cc = code.startsWith('2') ? 'response-2xx' : code.startsWith('4') ? 'response-4xx' : 'response-5xx';
            const hasSchema = this.parsedData.responseSchemas.find(r => r.code === code);
            const schemaNote = hasSchema ? ` → <code style="color:#bc8cff;">${hasSchema.schemaName}</code>` : ' (без тела)';
            successHtml += `<div class="response-group"><span class="response-code ${cc}">${code}</span>${DOMHelpers.escape(desc)}${schemaNote}</div>`;
        }
        if (!successHtml) {
            successHtml = `<div class="response-group"><span class="response-code response-2xx">200</span> OK</div>`;
        }

        let errRows = '';
        for (let i = 0; i < this.parsedData.errorResponses.length; i++) {
            const e = this.parsedData.errorResponses[i];
            errRows += `<tr>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(e.code)}" data-bind="parsedData.errorResponses[${i}].code">
                </td>
                <td class="cell-manual">
                    <textarea class="cell-input" data-bind="parsedData.errorResponses[${i}].description" placeholder="Описание...">${DOMHelpers.escape(e.description)}</textarea>
                </td>
                <td style="width:40px;text-align:center;">
                    <button class="delete-row-btn" data-action="removeErrorResp" data-index="${i}">✕</button>
                </td>
            </tr>`;
        }
        
        return `<h4 style="color:#3fb950;margin-bottom:8px;">Ответы</h4>${successHtml}
            <h4 style="color:#d29922;margin:16px 0 8px;">Ошибки</h4>
            <div class="table-wrapper"><table class="edit-table">
                <thead><tr><th>Код</th><th>Описание</th><th></th></tr></thead>
                <tbody>${errRows}</tbody>
            </table></div>
            <button class="add-row-btn" data-action="addErrorResp">+ Добавить ошибку</button>`;
    }

    renderDependencies() {
        let html = '';
        for (let i = 0; i < this.parsedData.dependencies.length; i++) {
            html += this.renderDepCard(i, this.parsedData.dependencies[i]);
        }
        
        return `<div class="info-note"><span class="info-note-icon">🔴</span><span>Добавьте внешние API вызовы.</span></div>
            <div id="deps-container">${html}</div>
            <button class="add-row-btn" data-action="addDep" style="margin-top:12px;">+ Добавить зависимость</button>`;
    }

    renderDepCard(i, dep) {
        // Устанавливаем тип по умолчанию, если не задан
        if (!dep.type) {
            dep.type = 'external';
        }

        // --- Нормализуем inputParams ---
        let inputParams;
        if (Array.isArray(dep.inputParams)) {
            inputParams = dep.inputParams;
        } else if (typeof dep.inputParams === 'string' && dep.inputParams.trim()) {
            inputParams = dep.inputParams.split('\n').filter(l => l.trim()).map(l => {
                const parts = l.split('|').map(s => s.trim());
                return { param: parts[0] || '', source: parts[1] || '', transform: parts[2] || '' };
            });
            dep.inputParams = inputParams;
        } else {
            inputParams = [];
            dep.inputParams = inputParams;
        }

        // --- Нормализуем outputFields ---
        let outputFields;
        if (Array.isArray(dep.outputFields)) {
            outputFields = dep.outputFields;
        } else if (typeof dep.outputFields === 'string' && dep.outputFields.trim()) {
            outputFields = dep.outputFields.split('\n').filter(l => l.trim()).map(l => {
                const parts = l.split('|').map(s => s.trim());
                return { field: parts[0] || '', usedIn: parts[1] || '', transform: parts[2] || '' };
            });
            dep.outputFields = outputFields;
        } else {
            outputFields = [];
            dep.outputFields = outputFields;
        }

        // --- Генерируем строки таблиц ---
        const inputParamsRows = inputParams.map((p, idx) => {
            return `<tr>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(p.param || '')}"
                        data-bind="parsedData.dependencies[${i}].inputParams[${idx}].param" placeholder="param">
                </td>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(p.source || '')}"
                        data-bind="parsedData.dependencies[${i}].inputParams[${idx}].source" placeholder="source">
                </td>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(p.transform || '')}"
                        data-bind="parsedData.dependencies[${i}].inputParams[${idx}].transform" placeholder="transform">
                </td>
                <td style="width:40px;text-align:center;">
                    <button class="delete-row-btn" data-action="removeInputParam" data-dep-index="${i}" data-param-index="${idx}">✕</button>
                </td>
            </tr>`;
        }).join('');

        const outputFieldsRows = outputFields.map((f, idx) => {
            return `<tr>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(f.field || '')}"
                        data-bind="parsedData.dependencies[${i}].outputFields[${idx}].field" placeholder="field">
                </td>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(f.usedIn || '')}"
                        data-bind="parsedData.dependencies[${i}].outputFields[${idx}].usedIn" placeholder="usedIn">
                </td>
                <td class="cell-manual">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(f.transform || '')}"
                        data-bind="parsedData.dependencies[${i}].outputFields[${idx}].transform" placeholder="transform">
                </td>
                <td style="width:40px;text-align:center;">
                    <button class="delete-row-btn" data-action="removeOutputField" data-dep-index="${i}" data-field-index="${idx}">✕</button>
                </td>
            </tr>`;
        }).join('');

        // --- Генерируем HTML в зависимости от типа ---
        const depType = dep.type || 'external';
        
        let fieldsHTML = '';
        
        // Общие поля: тип и имя
        fieldsHTML += `
            <div class="kv-label">Тип</div>
            <div class="kv-value cell-required">
                <select class="cell-input" data-bind="parsedData.dependencies[${i}].type">
                    <option value="gateway" ${depType === 'gateway' ? 'selected' : ''}>Шлюз</option>
                    <option value="external" ${depType === 'external' ? 'selected' : ''}>Внешний запрос</option>
                    <option value="ffl_table" ${depType === 'ffl_table' ? 'selected' : ''}>Таблица ФФЛ</option>
                    <option value="kafka" ${depType === 'kafka' ? 'selected' : ''}>Кафка</option>
                    <option value="calculated" ${depType === 'calculated' ? 'selected' : ''}>Вычисляемое значение</option>
                </select>
            </div>
            <div class="kv-label">Имя</div>
            <div class="kv-value cell-required">
                <input type="text" class="cell-input" value="${DOMHelpers.escape(dep.name || '')}"
                    data-bind="parsedData.dependencies[${i}].name" placeholder="RecNum">
            </div>
            <div class="kv-label">Описание</div>
            <div class="kv-value cell-required">
                <textarea class="cell-input" data-bind="parsedData.dependencies[${i}].description" placeholder="Получение...">${DOMHelpers.escape(dep.description || '')}</textarea>
            </div>`;

        // Условные поля в зависимости от типа
        if (depType === 'external') {
            // Внешний запрос: Метод, URL, Когда
            fieldsHTML += `
                <div class="kv-label">Метод</div>
                <div class="kv-value cell-required">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(dep.method || 'GET')}"
                        data-bind="parsedData.dependencies[${i}].method" placeholder="GET">
                </div>
                <div class="kv-label">URL</div>
                <div class="kv-value cell-required">
                    <input type="text" class="cell-input" value="${DOMHelpers.escape(dep.url || '')}"
                        data-bind="parsedData.dependencies[${i}].url" placeholder="/api/v1/...">
                </div>
                <div class="kv-label">Когда</div>
                <div class="kv-value cell-required">
                    <textarea class="cell-input" data-bind="parsedData.dependencies[${i}].when" placeholder="Условие...">${DOMHelpers.escape(dep.when || '')}</textarea>
                </div>`;
        } else if (depType === 'gateway' || depType === 'kafka') {
            // Шлюз / Кафка: Когда
            fieldsHTML += `
                <div class="kv-label">Когда</div>
                <div class="kv-value cell-required">
                    <textarea class="cell-input" data-bind="parsedData.dependencies[${i}].when" placeholder="Условие...">${DOMHelpers.escape(dep.when || '')}</textarea>
                </div>`;
        } else if (depType === 'calculated') {
            // Вычисляемое значение: Логика
            fieldsHTML += `
                <div class="kv-label">Логика</div>
                <div class="kv-value cell-required">
                    <textarea class="cell-input" data-bind="parsedData.dependencies[${i}].logic" placeholder="Описание логики вычисления..." style="min-height:100px;">${DOMHelpers.escape(dep.logic || '')}</textarea>
                </div>`;
        }
        // Для ffl_table только Имя и Описание (уже добавлены)

        // --- Остальной HTML без изменений ---
        return `<div class="dep-card" id="dep-${i}">
            <div class="dep-card-header">
                <span class="dep-card-title">${DOMHelpers.escape(dep.name) || `Зависимость #${i + 1}`}</span>
                <button class="dep-remove-btn" data-action="removeDep" data-index="${i}">✕</button>
            </div>
            <div class="kv-grid" style="margin-bottom:12px;">
                ${fieldsHTML}
            </div>
            <h5 style="color:#8b949e;margin:8px 0;">Входные параметры </h5>
            <div class="table-wrapper"><table class="edit-table">
                <thead><tr><th>Параметр</th><th>Источник</th><th>Трансформация</th><th></th></tr></thead>
                <tbody>${inputParamsRows}</tbody>
            </table></div>
            <button class="add-row-btn" data-action="addInputParam" data-dep-index="${i}">+ Добавить параметр</button>
            <h5 style="color:#8b949e;margin:8px 0;">Параметры ответа </h5>
            <div class="table-wrapper"><table class="edit-table">
                <thead><tr><th>Параметр</th><th>Используется в</th><th>Трансформация</th><th></th></tr></thead>
                <tbody>${outputFieldsRows}</tbody>
            </table></div>
            <button class="add-row-btn" data-action="addOutputField" data-dep-index="${i}">+ Добавить параметр</button>
        </div>`;
    }

    renderLogic() {
        // only prompt if there's no algorithm at all
        const note = this.parsedData.algorithm && this.parsedData.algorithm.trim()
            ? ''
            : `<div class="info-note"><span class="info-note-icon">🔴</span><span>Опишите алгоритм.</span></div>`;
        return `${note}
            <textarea class="block-editor highlight-required" data-bind="parsedData.algorithm" 
                placeholder="ВХОД: DTO&#10;ШАГ 1: ...&#10;ВЫХОД: 200 OK" 
                style="min-height:200px;">${DOMHelpers.escape(this.parsedData.algorithm)}</textarea>`;
    }

    renderNotes() {
        const note = this.parsedData.notes && this.parsedData.notes.trim()
            ? ''
            : `<div class="info-note"><span class="info-note-icon">🔴</span><span>Примечания.</span></div>`;
        return `${note}
            <textarea class="block-editor highlight-required" data-bind="parsedData.notes" 
                placeholder="- Edge cases..." 
                style="min-height:150px;">${DOMHelpers.escape(this.parsedData.notes)}</textarea>`;
    }

    updateUnfilledCount() {
        const count = this.parsedData.getUnfilledCount();
        document.getElementById('unfilled-count').textContent = count;
    }

    renderMermaidDiagram() {
        const defaultDiagram = `graph TD
    Start[Начало] --> Input[Получение входных данных]
    Input --> Process[Обработка данных]
    Process --> Decision{Успешно?}
    Decision -->|Да| Success[Возврат результата]
    Decision -->|Нет| Error[Обработка ошибки]
    Success --> End[Конец]
    Error --> End`;

        const diagramValue = this.parsedData.mermaidDiagram || defaultDiagram;

        return `<div class="info-note"><span class="info-note-icon">🔴</span><span>Создайте блок-схему алгоритма. Используйте синтаксис Mermaid.</span></div>
            <div class="mermaid-editor-container">
                <div class="mermaid-editor-panel">
                    <div class="mermaid-panel-header">
                        <span class="icon">✏️</span>
                        <span>Редактор</span>
                    </div>
                    <textarea 
                        id="mermaid-code-editor" 
                        class="mermaid-code-editor highlight-required" 
                        data-bind="parsedData.mermaidDiagram" 
                        placeholder="${DOMHelpers.escape(defaultDiagram)}">${DOMHelpers.escape(diagramValue)}</textarea>
                </div>
                <div class="mermaid-editor-panel">
                    <div class="mermaid-panel-header">
                        <span class="icon">👁️</span>
                        <span>Предпросмотр</span>
                    </div>
                    <div id="mermaid-preview" class="mermaid-preview-container">
                        <div class="mermaid-preview-empty">Введите код диаграммы слева...</div>
                    </div>
                </div>
            </div>`;
    }

    attachMermaidHandlers() {
        const editor = document.getElementById('mermaid-code-editor');
        const preview = document.getElementById('mermaid-preview');
        
        if (!editor || !preview) return;

        let debounceTimer;
        const updatePreview = async () => {
            const code = editor.value.trim();

            if (!code) {
                preview.innerHTML = '<div class="mermaid-preview-empty">Введите код диаграммы слева...</div>';
                return;
            }

            // если библиотека ещё не загрузилась, подождём немного и повторим
            if (typeof mermaid === 'undefined') {
                preview.innerHTML = `<div class="mermaid-preview-error">
                    <strong>Библиотека Mermaid пока не загружена, подождите...</strong>
                </div>`;
                setTimeout(updatePreview, 200);
                return;
            }

            try {
                // Очистка предыдущей диаграммы
                preview.innerHTML = '';

                // удалить предыдущие контейнеры mermaid (dmermaid-*)
                document.querySelectorAll('div[id^="dmermaid-"]').forEach(el => el.remove());

                // Создание уникального ID для диаграммы
                const id = 'mermaid-' + Date.now();

                // Рендеринг диаграммы
                const { svg } = await mermaid.render(id, code);

                // detect actual error graphic (look for element, not just style rule)
                if (/<path[^>]+class="error-icon"/.test(svg)) {
                    throw new Error('Syntax error in text');
                }

                preview.innerHTML = `<div class="mermaid-preview-content">${svg}</div>`;

                // повторный вынос контейнеров (иногда mermaid добавляет их даже при успешном рендере)
                document.querySelectorAll('div[id^="dmermaid-"]').forEach(el => el.remove());
            } catch (error) {
                console.error('mermaid render error', error);
                preview.innerHTML = `<div class="mermaid-preview-error">
                    <strong>Ошибка синтаксиса:</strong><br>
                    ${DOMHelpers.escape(error.message || 'Проверьте код диаграммы')}
                </div>`;
            }
        };

        // Обработчик изменений с debounce
        editor.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updatePreview, 500);
        });

        // Начальный рендеринг
        updatePreview();
    }
}
