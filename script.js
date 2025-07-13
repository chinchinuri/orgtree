document.addEventListener('DOMContentLoaded', () => {
    let appData = null;
    let currentSearchQuery = '';

    const appContainer = document.getElementById('app-container');
    const initialView = document.getElementById('initial-view');
    const importInput = document.getElementById('import-json-input');
    const exportBtn = document.getElementById('export-json-btn');
    const addRootBtn = document.getElementById('add-root-btn');
    const searchInput = document.getElementById('search-input');

    function findDataArray(dataObject) {
        if (Array.isArray(dataObject)) return dataObject;
        for (const key in dataObject) {
            if (Array.isArray(dataObject[key])) return dataObject[key];
            if (typeof dataObject[key] === 'object' && dataObject[key] !== null) {
                const nestedArray = findDataArray(dataObject[key]);
                if (nestedArray) return nestedArray;
            }
        }
        return null;
    }
    
    function isMatch(org, query) {
        for (const key in org) {
            if (key.startsWith('_') || Array.isArray(org[key])) continue;
            const value = org[key];
            if (typeof value === 'object' && value !== null) {
                if (isMatch(value, query)) return true;
            } else if (value && value.toString().toLowerCase().includes(query)) {
                return true;
            }
        }
        return false;
    }
    
    function markMatchesAndAncestors(dataArray, query) {
        let hasMatchInChildren = false;
        if (!dataArray) return false;
        dataArray.forEach(org => {
            const subsKey = Object.keys(org).find(key => Array.isArray(org[key]));
            const childrenHasMatch = subsKey ? markMatchesAndAncestors(org[subsKey], query) : false;
            if (isMatch(org, query)) {
                org._searchState = 'highlight';
                hasMatchInChildren = true;
            } else if (childrenHasMatch) {
                org._searchState = 'ancestor';
                org.isCollapsed = false;
                hasMatchInChildren = true;
            } else {
                org._searchState = 'dimmed';
            }
        });
        return hasMatchInChildren;
    }

    function formatValue(key, value) {
        if (typeof value !== 'string' || !value) return value;
        const lowerCaseValue = value.toLowerCase();
        const lowerCaseKey = key.toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `<a href="mailto:${value}">${value}</a>`;
        if (lowerCaseValue.startsWith('http') || lowerCaseValue.startsWith('www.')) {
            const href = lowerCaseValue.startsWith('http') ? value : `//${value}`;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${value}</a>`;
        }
        if (lowerCaseKey.includes('address') || lowerCaseKey.includes('адреса')) {
            const encodedAddress = encodeURIComponent(value);
            return `<a href="https://www.google.com/maps/search/?api=1&query=${encodedAddress}" target="_blank" rel="noopener noreferrer">${value}</a>`;
        }
        return value;
    }

    function renderApp() {
        const dataArray = appData ? findDataArray(appData) : null;
        if (!dataArray) { updateUIState(); return; }

        if (currentSearchQuery) {
            markMatchesAndAncestors(dataArray, currentSearchQuery);
        } else {
            function clearSearchState(arr) {
                if (!arr) return;
                arr.forEach(item => {
                    delete item._searchState;
                    const subsKey = Object.keys(item).find(key => Array.isArray(item[key]));
                    if (subsKey) clearSearchState(item[subsKey]);
                });
            }
            clearSearchState(dataArray);
        }

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

    function createOrgElement(org, path) {
        const li = document.createElement('li');
        const searchClass = currentSearchQuery ? org._searchState || 'dimmed' : '';
        li.className = `organization-card ${searchClass}`;
        li.setAttribute('data-path', path);

        if (org.isEditing) {
            li.innerHTML = createEditForm(org, path);
        } else {
            li.innerHTML = createDisplayView(org, path);
        }

        const subsKey = Object.keys(org).find(key => Array.isArray(org[key]));
        if (subsKey && org[subsKey].length > 0 && !org.isCollapsed) {
            const subList = document.createElement('ul');
            subList.className = 'organization-list';
            org[subsKey].forEach((subOrg, index) => {
                subList.appendChild(createOrgElement(subOrg, `${path}.${subsKey}.${index}`));
            });
            li.appendChild(subList);
        }
        return li;
    }

    function createDisplayView(org, path) {
        let detailsHtml = '';
        for (const key in org) {
            if (key.startsWith('_') || key === 'isEditing' || key === 'isCollapsed' || Array.isArray(org[key])) continue;
            const value = org[key];
            if (typeof value === 'object' && value !== null) {
                const lat = value.latitude || value.lat || value.широта;
                const lon = value.longitude || value.lon || value.lng || value.довгота;
                if (lat && lon) {
                    detailsHtml += `<div><strong>${key}:</strong> <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener noreferrer">Переглянути на карті (${lat}, ${lon})</a></div>`;
                } else {
                    let subDetails = '';
                    for (const subKey in value) subDetails += `<div><strong>${subKey}:</strong> ${formatValue(subKey, value[subKey])}</div>`;
                    detailsHtml += `<div><strong>${key}:</strong><div style="padding-left: 20px;">${subDetails}</div></div>`;
                }
            } else {
                detailsHtml += `<p><strong>${key}:</strong> ${formatValue(key, value)}</p>`;
            }
        }
        const subsKey = Object.keys(org).find(key => Array.isArray(org[key]));
        const hasChildren = subsKey && org[subsKey].length > 0;
        const toggleButton = hasChildren ? `<span class="toggle-collapse" data-action="toggle-collapse" data-path="${path}">${org.isCollapsed ? '+' : '−'}</span>` : '<span style="display:inline-block; width: 24px;"></span>';
        return `<div class="org-header"><div class="org-name-container">${toggleButton}<h3 class="org-name">${org.name || org.Name || 'Елемент без назви'}</h3></div><div class="org-actions"><button class="action-btn-add" data-action="add" data-path="${path}">Додати дочірній</button><button class="action-btn-edit" data-action="edit" data-path="${path}">Редагувати</button><button class="action-btn-delete" data-action="delete" data-path="${path}">Видалити</button></div></div><div class="org-details">${detailsHtml}</div>`;
    }

    // --- ПОВНІСТЮ ПЕРЕПИСАНА ФУНКЦІЯ ---
    function createEditForm(org, path) {
        let simpleFieldsHtml = '';
        let complexFieldsHtml = '';

        for (const key in org) {
            if (key.startsWith('_') || key === 'isEditing' || key === 'isCollapsed' || Array.isArray(org[key])) continue;
            
            const value = org[key];
            if (typeof value === 'object' && value !== null) {
                // Вкладені об'єкти (не редагуємо структуру, лише значення)
                complexFieldsHtml += `<fieldset><legend>${key}</legend>`;
                for(const subKey in value) {
                    complexFieldsHtml += `<div class="form-group"><label>${subKey}:</label><input type="text" class="form-complex-value" data-parent-key="${key}" name="${subKey}" value="${value[subKey] || ''}"></div>`;
                }
                complexFieldsHtml += `</fieldset>`;
            } else {
                // Прості ключ-значення (повністю редаговані)
                const isTextarea = (typeof value === 'string' && value.length > 80);
                const valueInput = isTextarea 
                    ? `<textarea data-type="value">${value || ''}</textarea>`
                    : `<input type="text" data-type="value" value="${value || ''}">`;
                simpleFieldsHtml += `
                    <div class="form-field-row">
                        <input type="text" data-type="key" value="${key}" placeholder="Ключ">
                        ${valueInput}
                        <button type="button" class="delete-field-btn" data-action="delete-field" title="Видалити поле">&times;</button>
                    </div>`;
            }
        }

        return `
            <form class="edit-form" data-path="${path}">
                <div class="edit-form-fields">
                    ${simpleFieldsHtml}
                </div>
                <button type="button" class="add-field-btn" data-action="add-field">+ Додати поле</button>
                <hr>
                ${complexFieldsHtml}
                <div class="edit-form-actions">
                    <button type="button" class="action-btn-secondary" data-action="cancel" data-path="${path}">Скасувати</button>
                    <button type="submit" class="action-btn-success">Зберегти</button>
                </div>
            </form>`;
    }
    
    function getObjectAndParentByPath(path) {
        const dataArray = findDataArray(appData);
        if (!path || !dataArray) return { parent: null, obj: null, index: -1 };
        const parts = path.split('.');
        let current = dataArray;
        for (let i = 0; i < parts.length - 1; i++) {
            if (current === undefined) return { parent: null, obj: null, index: -1 };
            current = current[parts[i]];
        }
        const lastPart = parts[parts.length - 1];
        if (current && current[lastPart] !== undefined) {
            const targetIndex = parseInt(lastPart, 10);
            return { parent: current, obj: current[lastPart], index: targetIndex };
        }
        return { parent: null, obj: null, index: -1 };
    }
    
    // --- Обробники подій (доповнені) ---
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
        reader.readAsText(file);
    });

    searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value.toLowerCase().trim();
        renderApp();
    });

    appContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;

        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        // Обробка дій всередині форми редагування
        if (action === 'delete-field') {
            target.closest('.form-field-row').remove();
            return;
        }
        if (action === 'add-field') {
            const fieldsContainer = target.previousElementSibling;
            const newFieldHtml = `
                <div class="form-field-row">
                    <input type="text" data-type="key" value="нове_поле" placeholder="Ключ">
                    <input type="text" data-type="value" value="" placeholder="Значення">
                    <button type="button" class="delete-field-btn" data-action="delete-field" title="Видалити поле">&times;</button>
                </div>`;
            fieldsContainer.insertAdjacentHTML('beforeend', newFieldHtml);
            return;
        }

        // Обробка дій над елементами дерева
        const path = target.closest('[data-path]').dataset.path;
        if (!path) return;
        const { parent, obj, index } = getObjectAndParentByPath(path);
        if (!obj) { console.error("Не вдалося знайти об'єкт за шляхом:", path); return; }

        switch (action) {
            case 'edit': obj.isEditing = true; break;
            case 'cancel': delete obj.isEditing; break;
            case 'delete': if (confirm(`Ви впевнені?`)) { parent.splice(index, 1); } break;
            case 'add':
                const newSub = { name: "Новий елемент", isEditing: true };
                let subsKey = Object.keys(obj).find(key => Array.isArray(obj[key]));
                if (!subsKey) { subsKey = 'subsidiaries'; obj[subsKey] = []; }
                obj[subsKey].unshift(newSub);
                obj.isCollapsed = false;
                break;
            case 'toggle-collapse': obj.isCollapsed = !obj.isCollapsed; break;
        }
        renderApp();
    });
    
    // --- ПОВНІСТЮ ПЕРЕПИСАНИЙ ОБРОБНИК ЗБЕРЕЖЕННЯ ---
    appContainer.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const path = form.dataset.path;
        const { obj: originalObject } = getObjectAndParentByPath(path);
        if (!originalObject) return;

        const newObjectData = {};

        // 1. Збираємо прості поля (з можливістю зміни ключа)
        form.querySelectorAll('.form-field-row').forEach(row => {
            const key = row.querySelector('[data-type="key"]').value.trim();
            const value = row.querySelector('[data-type="value"]').value;
            if (key) {
                newObjectData[key] = value;
            }
        });

        // 2. Збираємо значення з комплексних полів (де ключ не змінюється)
        form.querySelectorAll('.form-complex-value').forEach(input => {
            const parentKey = input.dataset.parentKey;
            const subKey = input.name;
            const value = input.value;
            if (!newObjectData[parentKey]) {
                newObjectData[parentKey] = {};
            }
            newObjectData[parentKey][subKey] = value;
        });

        // 3. Зберігаємо системні поля та масиви з оригінального об'єкта
        for (const key in originalObject) {
            if (key.startsWith('_') || key === 'isCollapsed' || Array.isArray(originalObject[key])) {
                newObjectData[key] = originalObject[key];
            }
        }
        
        // 4. Повністю замінюємо дані в оригінальному об'єкті
        Object.keys(originalObject).forEach(key => delete originalObject[key]);
        Object.assign(originalObject, newObjectData);

        delete originalObject.isEditing;
        renderApp();
    });

    exportBtn.addEventListener('click', () => {
        if (!appData) return;
        function cleanup(obj) {
            if (typeof obj !== 'object' || obj === null) return;
            Object.keys(obj).forEach(key => {
                if (key.startsWith('_') || key === 'isEditing' || key === 'isCollapsed') {
                    delete obj[key];
                }
            });
            Object.values(obj).forEach(value => {
                if (Array.isArray(value)) value.forEach(cleanup);
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

    addRootBtn.addEventListener('click', () => {
        const dataArray = findDataArray(appData);
        if (!dataArray) return;
        const newOrg = { name: "Новий кореневий елемент", isEditing: true };
        dataArray.unshift(newOrg);
        renderApp();
    });
    
    function updateUIState() {
        const hasData = appData !== null;
        exportBtn.disabled = !hasData;
        addRootBtn.disabled = !hasData;
        searchInput.disabled = !hasData;
    }
});