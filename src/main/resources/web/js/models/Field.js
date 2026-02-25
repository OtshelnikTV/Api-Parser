/**
 * Модель поля DTO с поддержкой вложенных структур
 */
export class Field {
    constructor(name = '', depth = 0) {
        this.name = name;
        this.type = '';
        this.description = '';
        this.format = '';
        this.example = '';
        this.required = false;
        this.depth = depth;
        this.isArray = false;
        this.refName = ''; // Имя DTO для refs
        this.children = []; // Вложенные поля
        this.source = ''; // Источник данных для поля
    }

    /**
     * Создать поле из объекта
     */
    static fromObject(obj) {
        const field = new Field(obj.name, obj.depth || 0);
        field.type = obj.type || '';
        field.description = obj.description || '';
        field.format = obj.format || '';
        field.example = obj.example || '';
        field.required = obj.required || false;
        field.isArray = obj.isArray || false;
        field.refName = obj.refName || '';
        field.source = obj.source || '';
        
        if (obj.children && Array.isArray(obj.children)) {
            field.children = obj.children.map(c => Field.fromObject(c));
        }
        
        return field;
    }

    /**
     * Проверка наличия дочерних элементов
     */
    hasChildren() {
        return this.children && this.children.length > 0;
    }

    /**
     * Получить display name с префиксом для отображения
     */
    getDisplayName(prefix = '') {
        if (!prefix) return this.name;
        return `${prefix}.${this.name}`;
    }

    /**
     * Получить тип для отображения (с учётом массивов и refs)
     */
    getDisplayType() {
        if (this.isArray && this.refName) {
            return `array<${this.refName}>`;
        }
        if (this.isArray) {
            return `array<${this.type}>`;
        }
        if (this.refName && this.hasChildren()) {
            return this.refName;
        }
        return this.type;
    }
}
