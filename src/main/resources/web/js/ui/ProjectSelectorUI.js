import { DOMHelpers } from '../utils/DOMHelpers.js';
import { LoadingOverlay } from '../utils/LoadingOverlay.js';
import { NotificationService } from '../utils/NotificationService.js';

/**
 * UI компонент для выбора проекта (Шаг 1)
 */
export class ProjectSelectorUI {
    constructor(fileService, projectState, onNext) {
        this.fileService = fileService;
        this.projectState = projectState;
        this.onNext = onNext;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // в прокси-режиме папка не выбирается, проекты загружаются автоматически

        // Обработчик кнопки "Далее"
        document.getElementById('btn-save-project').addEventListener('click', () => {
            this.saveAndProceed();
        });

        // Обработчик выбора проекта
        document.addEventListener('click', (e) => {
            const projectItem = e.target.closest('.project-item');
            if (projectItem && projectItem.dataset.projectName) {
                this.onProjectSelected(projectItem.dataset.projectName);
            }
        });
    }

    // Пояснение: в proxy-режиме проекты загружаются при показе экрана

    displayProjects(projects) {
        const container = document.getElementById('project-list-container');
        const projectList = document.getElementById('project-list');

        projectList.innerHTML = '';

        for (const project of projects) {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.dataset.projectName = project.name;
            projectItem.innerHTML = `
                <div class="project-item-icon">📦</div>
                <div class="project-item-content">
                    <div class="project-item-name">${DOMHelpers.escape(project.name)}</div>
                    <div class="project-item-info">${DOMHelpers.escape(project.rootPath || '')}</div>
                </div>
            `;
            projectList.appendChild(projectItem);
        }

        container.style.display = 'block';
    }

    async onProjectSelected(projectName) {
        // Убрать предыдущее выделение
        document.querySelectorAll('.project-item').forEach(el => {
            el.classList.remove('selected');
        });

        const selectedEl = document.querySelector(`[data-project-name="${projectName}"]`);
        if (selectedEl) {
            selectedEl.classList.add('selected');
        }

        this.projectState.selectedProjectName = projectName;

        LoadingOverlay.show('Индексация проекта...');
        LoadingOverlay.updateProgress(`Загрузка ${projectName}...`);

        setTimeout(async () => {
            try {
                const result = await this.fileService.indexProject(projectName, this.projectState);

                document.getElementById('project-file-count').textContent =
                    `${result.endpointsCount} endpoints, ${result.schemasCount} schemas`;
                document.getElementById('btn-save-project').disabled = false;

                LoadingOverlay.hide();
                NotificationService.success(`Проект ${projectName} загружен`);
            } catch (error) {
                console.error(error);
                NotificationService.error('Ошибка: ' + error.message);
                LoadingOverlay.hide();
            }
        }, 50);
    }

    saveAndProceed() {
        if (!this.projectState.isProjectReady()) {
            NotificationService.error('Не найдены endpoints');
            return;
        }
        
        this.onNext();
    }

    async show() {
        DOMHelpers.hideAllScreens();
        DOMHelpers.show('setup-project');
        // загрузить проекты с сервера
        LoadingOverlay.show('Загрузка проектов...');
        try {
            const projects = await this.fileService.discoverProjects();
            if (projects.length === 0) {
                throw new Error('Не найдено ни одного проекта в redocly.yaml');
            }
            this.projectState.availableProjects = projects;
            this.displayProjects(projects);
        } catch (e) {
            console.error(e);
            NotificationService.error('Ошибка: ' + e.message);
        } finally {
            LoadingOverlay.hide();
        }
    }
}
