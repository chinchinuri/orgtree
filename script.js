document.addEventListener('DOMContentLoaded', () => {
    // Глобальна змінна для зберігання даних. Початково null.
    let appData = null;

    // Отримуємо посилання на елементи DOM
    const appContainer = document.getElementById('app-container');
    const initialView = document.getElementById('initial-view');
    const importInput = document.getElementById('import-json-input');
    const exportBtn = document.getElementById('export-json-btn');
    const addRootBtn = document.getElementById('add-root-btn');

    // Функція для пошуку основного масиву даних у завантаженому об'єкті
    function findDataArray(dataObject) {
        if (Array.isArray(dataObject)) {
            return dataObject;
        }
        for (const key in dataObject) {
            if (Array.isArray(dataObject[key])) {
                return dataObject[key];
            }
            if (typeof dataObject[key] === 'object' && dataObject[key] !== null) {
                const nestedArray = findDataArray(dataObject[key]);
                if (nestedArray) return nestedArray;
            }
        }
        return null;
    }

    // Головна функція рендерингу
    function renderApp() {
        const dataArray = appData ? findDataArray(appData) : null;
        
        // Якщо даних немає, нічого не робимо (початковий екран залишається)
        if (!dataArray) {
            updateUIState();
            return;
        }

        // Ховаємо початковий екран і очищуємо контейнер
        initialView.style.display = 'none';
        appContainer.innerHTML = '';
        
        const orgList = document.createElement('ul');
        orgList.className = 'organization-list';

        dataArray.forEach((org, index) => {
            orgList.appendChild(createOrgElement(org, `${index}`));
        });
        
        appContainer.appendChild(orgList);
        updateUIState();
    }

    // Рекурсивна функція для створення HTML-елемента
    function createOrgElement(org, path) {
        const li = document.createElement('li');
        li.className = 'organization-card';
        li.setAttribute('data-path', path);

        if (org.isEditing) {
            li.innerHTML = createEditForm(org, path);
        } else {
            li.innerHTML = createDisplayView(org, path);
        }

        // Ключ для дочірніх елементів може бути різним, шукаємо його
        const subsidiariesKey = Object.keys(org).find(key => Array.isArray(org[key]));
        if (subsidiariesKey && org[subsidiariesKey].length > 0) {
            const subList = document.createElement('ul');
            subList.className = 'organization-list';
            org[subsidiariesKey].forEach((subOrg, index) => {
                subList.appendChild(createOrgElement(subOrg, `${path}.${subsidiariesKey}.${index}`));
            });
            li.appendChild(subList);
        }

        return li;
    }

    // Створення HTML для відображення
    function createDisplayView(org, path) {
        let detailsHtml = '';
        for (const key in org) {
            if (key === 'isEditing' || Array.isArray(org[key])) continue;
            
            const value = org[key];
            if (typeof value === 'object' && value !== null) {
                detailsHtml += `<div><strong>${key}:</strong><div style="padding-left: 20px;">`;
                for(const subKey in value) {
                    detailsHtml += `${subKey}: ${value[subKey]}<br>`;
                }
                detailsHtml += `</div></div>`;
            } else {
                detailsHtml += `<p><strong>${key}:</strong> ${value}</p>`;
            }
        }

        return `
            <div class="org-header">
                <h3 class="org-name">${org.name || org.Name || 'Елемент без назви'}</h3>
                <div class="org-actions">
                    <button class="action-btn-add" data-action="add" data-path="${path}">Додати дочірній</button>
                    <button class="action-btn-edit" data-action="edit" data-path="${path}">Редагувати</button>
                    <button class="action-btn-delete" data-action="delete" data-path="${path}">Видалити</button>
                </div>
            </div>
            <div class="org-details">${detailsHtml}</div>
        `;
    }

    // Створення HTML для форми редагування
    function createEditForm(org, path) {
        let formFieldsHtml = '';
        for (const key in org) {
             if (key === 'isEditing' || Array.isArray(org[key])) continue;
             
             const value = org[key];
             if (typeof value === 'object' && value !== null) {
                formFieldsHtml += `<fieldset><legend>${key}</legend>`;
                for(const subKey in value) {
                    formFieldsHtml += `
                        <div class="form-group">
                            <label>${subKey}:</label>
                            <input type="text" name="${key}.${subKey}" value="${value[subKey] || ''}">
                        </div>`;
                }
                formFieldsHtml += `</fieldset>`;
             } else {
                 const isTextarea = (typeof value === 'string' && value.length > 80);
                 formFieldsHtml += `
                    <div class="form-group">
                        <label>${key}:</label>
                        ${isTextarea 
                            ? `<textarea name="${key}">${value || ''}</textarea>`
                            : `<input type="text" name="${key}" value="${value || ''}">`
                        }
                    </div>`;
             }
        }

        return `
            <form class="edit-form" data-path="${path}">
                ${formFieldsHtml}
                <div class="edit-form-actions">
                    <button type="button" class="action-btn-secondary" data-action="cancel" data-path="${path}">Скасувати</button>
                    <button type="submit" class="action-btn-success">Зберегти</button>
                </div>
            </form>
        `;
    }

    // Функція для отримання об'єкта та його батьківського масиву за шляхом
    function getObjectAndParentByPath(path) {
        const dataArray = findDataArray(appData);
        if (!path || !dataArray) return { parent: null, obj: null, index: -1 };

        const parts = path.split('.');
        let current = dataArray;
        let parent = dataArray;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const index = parseInt(part, 10);
            
            if (isNaN(index)) { // це ключ, наприклад 'subsidiaries'
                if (i > 0) {
                   parent = current;
                   current = current[parts[i-1]][part];
                }
            } else { // це індекс
                if (i === parts.length - 1) {
                    return { parent: current, obj: current[index], index: index };
                }
                parent = current;
                current = current[index];
            }
        }
        return { parent: null, obj: null, index: -1 };
    }

    // --- Обробники подій ---

    // Обробник імпорту файлу
    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                appData = JSON.parse(event.target.result);
                renderApp();
            } catch (err) {
                alert('Помилка: Не вдалося розпарсити JSON-файл.\n' + err.message);
                appData = null;
                renderApp();
            }
        };
        reader.onerror = () => {
             alert('Помилка читання файлу.');
        };
        reader.readAsText(file);
    });

    // Обробник кліків (делегування подій)
    appContainer.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const action = target.dataset.action;
        const path = target.closest('[data-path]').dataset.path;

        if (!action || !path) return;

        const { parent, obj, index } = getObjectAndParentByPath(path);
        if (!obj) return;

        switch (action) {
            case 'edit':
                obj.isEditing = true;
                break;
            case 'cancel':
                delete obj.isEditing;
                break;
            case 'delete':
                if (confirm(`Ви впевнені, що хочете видалити елемент "${obj.name || 'цей елемент'}"?`)) {
                    parent.splice(index, 1);
                }
                break;
            case 'add':
                const newSub = { name: "Новий елемент", isEditing: true };
                // Шукаємо ключ для дочірніх елементів або створюємо 'subsidiaries'
                let subsKey = Object.keys(obj).find(key => Array.isArray(obj[key]));
                if (!subsKey) {
                    subsKey = 'subsidiaries';
                    obj[subsKey] = [];
                }
                obj[subsKey].unshift(newSub);
                break;
        }
        renderApp();
    });

    // Обробник збереження форми
    appContainer.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const path = form.dataset.path;
        const { obj } = getObjectAndParentByPath(path);
        if (!obj) return;

        const formData = new FormData(form);
        for (let [key, value] of formData.entries()) {
            if (key.includes('.')) {
                const [objKey, propKey] = key.split('.');
                if (!obj[objKey]) obj[objKey] = {};
                obj[objKey][propKey] = value;
            } else {
                obj[key] = value;
            }
        }
        
        delete obj.isEditing;
        renderApp();
    });

    // Експорт в JSON
    exportBtn.addEventListener('click', () => {
        if (!appData) return;

        function cleanup(obj) {
            if (typeof obj !== 'object' || obj === null) return;
            delete obj.isEditing;
            Object.values(obj).forEach(value => {
                if (Array.isArray(value)) {
                    value.forEach(cleanup);
                }
            });
        }
        
        const dataToExport = JSON.parse(JSON.stringify(appData));
        cleanup(dataToExport);

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "orgtree-data-updated.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    // Додавання кореневого елемента
    addRootBtn.addEventListener('click', () => {
        const dataArray = findDataArray(appData);
        if (!dataArray) return;

        const newOrg = { name: "Новий кореневий елемент", isEditing: true };
        dataArray.unshift(newOrg);
        renderApp();
    });
    
    // Функція для оновлення стану кнопок в хедері
    function updateUIState() {
        const hasData = appData !== null;
        exportBtn.disabled = !hasData;
        addRootBtn.disabled = !hasData;
    }
});