/**
 * Утилиты для работы с полями
 */
export class FieldHelpers {
    /**
     * Flatten полей в плоский массив
     */
    static flattenFields(fields, prefix = '', depth = 0, pathPrefix = 'parsedData.requestFields') {
        const result = [];
        for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            const displayName = prefix ? `${prefix}.${f.name}` : f.name;
            const fieldPath = depth === 0 ? `${pathPrefix}[${i}]` : `${pathPrefix}.children[${i}]`;
            
            result.push({
                name: f.name,
                displayName: displayName,
                type: f.isArray ? `array<${f.refName || f.type}>` : (f.refName && f.type !== 'array' ? f.refName : f.type),
                description: f.description,
                format: f.format,
                example: f.example,
                required: f.required,
                depth: depth,
                refName: f.refName,
                isArray: f.isArray,
                source: f.source || '',
                hasChildren: f.children && f.children.length > 0,
                fieldRef: f, // Ссылка на оригинальное поле для data-binding
                fieldPath: fieldPath // Путь для data-binding
            });
            if (f.children && f.children.length > 0) {
                const childPrefix = f.isArray ? `${displayName}[]` : displayName;
                result.push(...this.flattenFields(f.children, childPrefix, depth + 1, fieldPath));
            }
        }
        return result;
    }

    /**
     * Генерация примера JSON из полей
     */
    static generateExampleFromFields(fields) {
        const obj = {};
        for (const f of fields) {
            if (f.children && f.children.length > 0) {
                const childObj = this.generateExampleFromFields(f.children);
                obj[f.name] = f.isArray ? [childObj] : childObj;
            } else if (f.example !== undefined && f.example !== '') {
                if (f.type === 'integer') {
                    const n = parseInt(f.example, 10);
                    obj[f.name] = isNaN(n) ? f.example : n;
                } else if (f.type === 'number') {
                    const n = parseFloat(f.example);
                    obj[f.name] = isNaN(n) ? f.example : n;
                } else if (f.type === 'boolean') {
                    obj[f.name] = f.example === 'true';
                } else {
                    obj[f.name] = f.example;
                }
            } else {
                switch (f.type) {
                    case 'integer':
                        obj[f.name] = f.format === 'int64' ? 100000 : 12345;
                        break;
                    case 'number':
                        obj[f.name] = 99.99;
                        break;
                    case 'boolean':
                        obj[f.name] = true;
                        break;
                    case 'string':
                        if (f.format === 'date-time') obj[f.name] = '2024-01-15T10:30:00Z';
                        else if (f.format === 'date') obj[f.name] = '2024-01-15';
                        else if (f.format === 'uuid') obj[f.name] = '550e8400-e29b-41d4-a716-446655440000';
                        else obj[f.name] = 'string_value';
                        break;
                    case 'array':
                        obj[f.name] = [];
                        break;
                    case 'object':
                        obj[f.name] = {};
                        break;
                    default:
                        obj[f.name] = null;
                }
            }
        }
        return obj;
    }
}
