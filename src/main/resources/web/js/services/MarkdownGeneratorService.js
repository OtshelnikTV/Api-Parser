/**
 * Сервис для генерации Markdown документации
 */
export class MarkdownGeneratorService {
    /**
     * Генерировать Markdown из parsedData
     */
    generate(parsedData) {
        const d = parsedData;
        let md = `# ${d.operationId || 'endpoint'} — ${d.summary || 'Описание'}\n\n`;

        md += `## 1. Общая информация\n\n`;
        md += this.buildAlignedTable(['Параметр', 'Значение'], [
            ['**Метод**', '`' + d.method + '`'],
            ['**URL**', '`' + d.url + '`'],
            ['**Тег**', '`' + d.tag + '`'],
            ['**Operation**', '`' + d.operationId + '`'],
            ['**Описание**', d.summary]
        ]);
        md += '\n---\n\n';

        // Request
        const hasParams = d.parameters.length > 0;
        const hasReqBody = d.requestFields.length > 0;

        if (hasParams || hasReqBody) {
            md += `## 2. Request\n\n`;

            if (hasParams) {
                md += `### Параметры\n\n`;
                md += this.buildAlignedTable(
                    ['Параметр', 'Тип', 'Где', 'Обязательный', 'Формат', 'Описание', 'Пример'],
                    d.parameters.map(p => [
                        '`' + p.name + '`',
                        '`' + p.type + '`',
                        '`' + p.in + '`',
                        p.required ? '✅' : '❌',
                        p.format || '—',
                        p.description || '—',
                        p.example || '—'
                    ])
                );
                md += '\n';
            }

            if (hasReqBody) {
                md += `### Request Body\n\n**Схема:** \`${d.requestSchemaName}\`\n\n`;

                const flatRequest = this.flattenFieldsForDisplay(d.requestFields);
                const nestedSchemas = [...new Set(flatRequest.filter(f => f.refName && f.depth > 0).map(f => f.refName))];
                if (nestedSchemas.length > 0) {
                    md += `> **Используются вложенные схемы:** ${nestedSchemas.map(s => '`' + s + '`').join(', ')}\n\n`;
                }

                md += this.buildAlignedTable(
                    ['Поле', 'Тип', 'Обязательный', 'Формат', 'Описание', 'Источник'], 
                    this.fieldsToMdRows(d.requestFields, true)
                );
                md += '\n';
            }

            if (hasReqBody && d.exampleRequest) {
                md += `### Пример запроса\n\n\`\`\`json\n${d.exampleRequest}\n\`\`\`\n\n`;
            }

            md += '---\n\n';
        }

        // Responses
        md += `## 3. Response\n\n`;
        for (const [code, data] of Object.entries(d.responses)) {
            const desc = typeof data === 'object' ? (data.description || 'OK') : data;
            md += `### ${code} ${desc}\n\n`;
        }

        // Response Bodies
        for (const rs of d.responseSchemas) {
            md += `#### Response Body (${rs.code}) — \`${rs.schemaName}\`\n\n`;

            const flatResponse = this.flattenFieldsForDisplay(rs.fields);
            const nestedSchemas = [...new Set(flatResponse.filter(f => f.refName && f.depth > 0).map(f => f.refName))];
            if (nestedSchemas.length > 0) {
                md += `> **Используются вложенные схемы:** ${nestedSchemas.map(s => '`' + s + '`').join(', ')}\n\n`;
            }

            md += this.buildAlignedTable(
                ['Поле', 'Тип', 'Обязательный', 'Формат', 'Описание'], 
                this.fieldsToMdRows(rs.fields, false)
            );
            md += '\n';
        }

        if (d.exampleResponse) {
            md += `### Пример ответа\n\n\`\`\`json\n${d.exampleResponse}\n\`\`\`\n\n`;
        }

        if (d.errorResponses.length) {
            md += `### Ошибки\n\n`;
            md += this.buildAlignedTable(['Код', 'Описание'], d.errorResponses.map(e => [e.code, e.description]));
            md += '\n';
        }
        md += '---\n\n';

        // Dependencies
        if (d.dependencies.length) {
            md += `## 4. Внешние зависимости\n\n`;
            for (let i = 0; i < d.dependencies.length; i++) {
                const dep = d.dependencies[i];
                const depType = dep.type || 'external';
                
                // Название типа для отображения
                const typeLabels = {
                    'gateway': 'Шлюз',
                    'external': 'Внешний запрос',
                    'ffl_table': 'Таблица ФФЛ',
                    'kafka': 'Кафка',
                    'calculated': 'Вычисляемое значение'
                };
                const typeLabel = typeLabels[depType] || 'Внешний запрос';
                
                md += `### 4.${i + 1} \`${dep.name}\` — ${dep.description}\n\n`;
                
                // Строим таблицу в зависимости от типа
                const tableRows = [['**Тип**', typeLabel]];
                
                if (depType === 'external') {
                    tableRows.push(
                        ['**Метод**', '\`' + (dep.method || 'GET') + '\`'],
                        ['**URL**', '\`' + (dep.url || '') + '\`'],
                        ['**Когда**', dep.when || '—']
                    );
                } else if (depType === 'gateway' || depType === 'kafka') {
                    tableRows.push(['**Когда**', dep.when || '—']);
                } else if (depType === 'calculated') {
                    tableRows.push(['**Логика**', dep.logic || '—']);
                }
                // Для ffl_table только тип, имя и описание
                
                md += this.buildAlignedTable(['Параметр', 'Значение'], tableRows);
                md += '\n';

                // Входные параметры (для всех типов)
                if (dep.inputParams) {
                    const params = Array.isArray(dep.inputParams)
                        ? dep.inputParams
                        : typeof dep.inputParams === 'string' && dep.inputParams.trim()
                            ? dep.inputParams.split('\n').filter(l => l.trim()).map(l => {
                                const p = l.split('|').map(s => s.trim());
                                return { param: p[0] || '', source: p[1] || '', transform: p[2] || '' };
                            })
                            : [];

                    if (params.length) {
                        md += `#### Входные параметры\n\n`;
                        const pr = params.map(p => [p.param || '', p.source || '—', p.transform || '—']);
                        md += this.buildAlignedTable(['Параметр', 'Откуда', 'Трансформация'], pr) + '\n';
                    }
                }

                // Параметры ответа (для всех типов)
                if (dep.outputFields) {
                    const fields = Array.isArray(dep.outputFields)
                        ? dep.outputFields
                        : typeof dep.outputFields === 'string' && dep.outputFields.trim()
                            ? dep.outputFields.split('\n').filter(l => l.trim()).map(l => {
                                const p = l.split('|').map(s => s.trim());
                                return { field: p[0] || '', usedIn: p[1] || '', transform: p[2] || '' };
                            })
                            : [];

                    if (fields.length) {
                        md += `#### Параметры ответа\n\n`;
                        const or = fields.map(f => [f.field || '', f.usedIn || '—', f.transform || '—']);
                        md += this.buildAlignedTable(['Параметр', 'Используется в', 'Трансформация'], or) + '\n';
                    }
                }
                md += '---\n\n';
            }
        } else {
            md += `## 4. Внешние зависимости\n\nНет.\n\n---\n\n`;
        }

        md += `## 5. Логика сборки\n\n### Алгоритм\n\n\`\`\`\n${d.algorithm || 'Не указан'}\n\`\`\`\n\n---\n\n`;
        
        // Mermaid диаграмма
        if (d.mermaidDiagram && d.mermaidDiagram.trim()) {
            md += `## 6. Блок-схема алгоритма\n\n\`\`\`mermaid\n${d.mermaidDiagram}\n\`\`\`\n\n---\n\n`;
        }
        
        md += `## 7. Примечания\n\n${d.notes || 'Нет.'}\n`;

        return md;
    }

    /**
     * Построить выровненную таблицу
     */
    buildAlignedTable(headers, rows) {
        const w = headers.map(h => h.length);
        for (const r of rows) {
            for (let i = 0; i < headers.length; i++) {
                w[i] = Math.max(w[i], String(r[i] || '').length);
            }
        }
        for (let i = 0; i < w.length; i++) {
            w[i] = Math.max(w[i], 3);
        }

        let t = '| ' + headers.map((h, i) => this.padRight(h, w[i])).join(' | ') + ' |\n';
        t += '|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|\n';
        for (const r of rows) {
            t += '| ' + r.map((c, i) => this.padRight(String(c || ''), w[i])).join(' | ') + ' |\n';
        }
        return t;
    }

    /**
     * Padding строки справа
     */
    padRight(s, l) {
        s = String(s);
        while (s.length < l) s += ' ';
        return s;
    }

    /**
     * Конвертировать поля в строки для Markdown
     */
    fieldsToMdRows(fields, includeSource = false, prefix = '', depth = 0) {
        const rows = [];
        for (const f of fields) {
            const indent = '  '.repeat(depth * 2);
            const treeSymbol = depth > 0 ? '└─ ' : '';

            let displayName = f.name;
            if (prefix) {
                displayName = `${prefix}.${f.name}`;
            }

            const visualName = depth > 0 ? indent + treeSymbol + displayName : displayName;

            let typeName = f.type;
            if (f.isArray && f.refName) {
                typeName = `array<${f.refName}>`;
            } else if (f.isArray) {
                typeName = `array<${f.type}>`;
            } else if (f.refName && f.children?.length) {
                typeName = f.refName;
            }

            const row = [
                '`' + visualName + '`',
                '`' + typeName + '`',
                f.required ? '✅' : '❌',
                f.format || '—',
                f.description || '—'
            ];

            if (includeSource) {
                row.push(f.source || '—');
            }

            rows.push(row);

            if (f.children && f.children.length) {
                const childPrefix = f.isArray ? displayName + '[]' : displayName;
                rows.push(...this.fieldsToMdRows(f.children, includeSource, childPrefix, depth + 1));
            }
        }
        return rows;
    }

    /**
     * Flatten fields для подсчёта вложенных схем
     */
    flattenFieldsForDisplay(fields, depth = 0) {
        const result = [];
        for (const f of fields) {
            result.push({
                name: f.name,
                refName: f.refName,
                depth: depth
            });
            if (f.children && f.children.length > 0) {
                result.push(...this.flattenFieldsForDisplay(f.children, depth + 1));
            }
        }
        return result;
    }
}
