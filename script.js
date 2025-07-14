document.addEventListener('DOMContentLoaded', () => {
    let appData = null;
    let currentSearchQuery = '';

    const appContainer = document.getElementById('app-container');
    const initialView = document.getElementById('initial-view');
    const importInput = document.getElementById('import-json-input');
    const exportBtn = document.getElementById('export-json-btn');
    const addRootBtn = document.getElementById('add-root-btn');
    const searchInput = document.getElementById('search-input');

    // --- SERVICE FUNCTIONS ---
    function findDataArray(dataObject) { if (Array.isArray(dataObject)) return dataObject; for (const key in dataObject) { if (Array.isArray(dataObject[key])) return dataObject[key]; if (typeof dataObject[key] === 'object' && dataObject[key] !== null) { const nestedArray = findDataArray(dataObject[key]); if (nestedArray) return nestedArray; } } return null; }
    function isMatch(org, query) { for (const key in org) { if (key.startsWith('_') || Array.isArray(org[key])) continue; const value = org[key]; if (typeof value === 'object' && value !== null) { if (isMatch(value, query)) return true; } else if (value && value.toString().toLowerCase().includes(query)) { return true; } } return false; }
    function formatValue(key, value) { if (typeof value !== 'string' || !value) return value; const lVal = value.toLowerCase(); const lKey = key.toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `<a href="mailto:${value}">${value}</a>`; if (lVal.startsWith('http') || lVal.startsWith('www.')) { const href = lVal.startsWith('http') ? value : `//${value}`; return `<a href="${href}" target="_blank" rel="noopener noreferrer">${value}</a>`; } if (lKey.includes('address') || lKey.includes('адреса')) { const encodedAddress = encodeURIComponent(value); return `<a href="https://www.google.com/maps/search/?api=1&query=${encodedAddress}" target="_blank" rel="noopener noreferrer">${value}</a>`; } return value; }
    function getObjectAndParentByPath(path) { const dataArray = findDataArray(appData); if (!path || !dataArray) return { parent: null, obj: null, index: -1 }; const parts = path.split('.'); let current = dataArray; for (let i = 0; i < parts.length - 1; i++) { if (current === undefined) return { parent: null, obj: null, index: -1 }; current = current[parts[i]]; } const lastPart = parts[parts.length - 1]; if (current && current[lastPart] !== undefined) { const targetIndex = parseInt(lastPart, 10); return { parent: current, obj: current[lastPart], index: targetIndex }; } return { parent: null, obj: null, index: -1 }; }

    // --- SEARCH LOGIC ---
    function markMatchesAndAncestors(dataArray, query) { let hasMatchInChildren = false; if (!dataArray) return false; dataArray.forEach(org => { const subsKey = Object.keys(org).find(key => Array.isArray(org[key])); const childrenHasMatch = subsKey ? markMatchesAndAncestors(org[subsKey], query) : false; if (isMatch(org, query)) { org._searchState = 'highlight'; hasMatchInChildren = true; } else if (childrenHasMatch) { org._searchState = 'ancestor'; org.isCollapsed = false; hasMatchInChildren = true; } else { org._searchState = 'dimmed'; } }); return hasMatchInChildren; }
    
    // --- RENDER LOGIC ---
    function renderApp() {
        const dataArray = appData ? findDataArray(appData) : null;
        if (!dataArray) { updateUIState(); return; }

        if (currentSearchQuery) {
            markMatchesAndAncestors(dataArray, currentSearchQuery);
        } else {
            const clearSearchState = (arr) => { if (!arr) return; arr.forEach(item => { delete item._searchState; const subsKey = Object.keys(item).find(key => Array.isArray(item[key])); if (subsKey) clearSearchState(item[subsKey]); }); };
            clearSearchState(dataArray);
        }

        initialView.style.display = 'none';
        appContainer.innerHTML = '';
        const orgList = document.createElement('ul');
        orgList.className = 'organization-list';
        dataArray.forEach((org, index) => orgList.appendChild(createOrgElement(org, `${index}`)));
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
            org[subsKey].forEach((subOrg, index) => subList.appendChild(createOrgElement(subOrg, `${path}.${subsKey}.${index}`)));
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
                if (lat && lon) { detailsHtml += `<div><strong>${key}:</strong> <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener noreferrer">Переглянути на карті (${lat}, ${lon})</a></div>`; }
                else { let subDetails = ''; for (const subKey in value) subDetails += `<div><strong>${subKey}:</strong> ${formatValue(subKey, value[subKey])}</div>`; detailsHtml += `<div><strong>${key}:</strong><div style="padding-left: 20px;">${subDetails}</div></div>`; }
            } else { detailsHtml += `<p><strong>${key}:</strong> ${formatValue(key, value)}</p>`; }
        }
        const subsKey = Object.keys(org).find(key => Array.isArray(org[key]));
        const hasChildren = subsKey && org[subsKey].length > 0;
        const toggleButton = hasChildren ? `<span class="toggle-collapse" data-action="toggle-collapse" data-path="${path}">${org.isCollapsed ? '＋' : '−'}</span>` : '<span style="display:inline-block; width: 24px;"></span>';
        return `<div class="org-header"><div class="org-name-container">${toggleButton}<h3 class="org-name">${org.name || org.Name || 'Елемент без назви'}</h3></div><div class="org-actions"><button class="action-btn-add" data-action="add" data-path="${path}">Додати дочірній</button><button class="action-btn-edit" data-action="edit" data-path="${path}">Редагувати</button><button class="action-btn-delete" data-action="delete" data-path="${path}">Видалити</button></div></div><div class="org-details">${detailsHtml}</div>`;
    }

    // --- РЕКУРСИВНЕ СТВОРЕННЯ ФОРМИ ---
    function createEditForm(org, path) {
        const formContainer = document.createElement('div');
        formContainer.className = 'edit-form-field-container';
        
        createRecursiveFormFields(formContainer, org);

        return `
            <form class="edit-form" data-path="${path}">
                ${formContainer.outerHTML}
                <div class="edit-form-actions">
                    <button type="button" class="action-btn-secondary" data-action="cancel" data-path="${path}">Скасувати</button>
                    <button type="submit" class="action-btn-success">Зберегти</button>
                </div>
            </form>`;
    }
    
    function createRecursiveFormFields(container, data) {
        for (const key in data) {
            if (key.startsWith('_') || key === 'isEditing' || key === 'isCollapsed' || Array.isArray(data[key])) continue;
            
            const value = data[key];

            if (typeof value === 'object' && value !== null) {
                // Вкладений об'єкт -> Fieldset
                const fieldset = document.createElement('fieldset');
                fieldset.className = 'edit-form-fieldset';
                fieldset.innerHTML = `
                    <div class="fieldset-header">
                        <input type="text" data-type="key" value="${key}" placeholder="Назва об'єкта">
                        <button type="button" class="delete-btn" data-action="delete-node" title="Видалити об'єкт">&times;</button>
                    </div>
                    <div class="edit-form-field-container"></div>
                    <div class="fieldset-actions">
                        <button type="button" class="add-btn" data-action="add-field-to-object">Додати поле</button>
                    </div>
                `;
                container.appendChild(fieldset);
                createRecursiveFormFields(fieldset.querySelector('.edit-form-field-container'), value);
            } else {
                // Просте поле -> Рядок
                const fieldRow = document.createElement('div');
                fieldRow.className = 'form-field-row';
                const isTextarea = (typeof value === 'string' && value.length > 80);
                const valueInput = isTextarea ? `<textarea data-type="value">${value || ''}</textarea>` : `<input type="text" data-type="value" value="${value || ''}">`;
                fieldRow.innerHTML = `
                    <input type="text" data-type="key" value="${key}" placeholder="Ключ">
                    ${valueInput}
                    <button type="button" class="delete-btn" data-action="delete-node" title="Видалити поле">&times;</button>
                `;
                container.appendChild(fieldRow);
            }
        }
        // Кнопки для додавання нових полів на поточному рівні
        const actions = document.createElement('div');
        actions.className = 'fieldset-actions';
        actions.innerHTML = `
            <button type="button" class="add-btn" data-action="add-field-to-object">Додати поле</button>
            <button type="button" class="add-btn" data-action="add-object">Додати об'єкт</button>
        `;
        container.appendChild(actions);
    }
    
    // --- EVENT HANDLERS ---
    importInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { appData = JSON.parse(event.target.result); renderApp(); } catch (err) { alert('Помилка: ' + err.message); appData = null; renderApp(); } }; reader.readAsText(file); });
    searchInput.addEventListener('input', (e) => { currentSearchQuery = e.target.value.toLowerCase().trim(); renderApp(); });

    appContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        // Дії всередині форми редагування
        switch (action) {
            case 'delete-node': target.parentElement.closest('.form-field-row, .edit-form-fieldset').remove(); return;
            case 'add-field-to-object': {
                const container = target.closest('.edit-form-fieldset, .edit-form-field-container').querySelector('.edit-form-field-container');
                const fieldRow = document.createElement('div');
                fieldRow.className = 'form-field-row';
                fieldRow.innerHTML = `<input type="text" data-type="key" value="нове_поле" placeholder="Ключ"><input type="text" data-type="value" value="" placeholder="Значення"><button type="button" class="delete-btn" data-action="delete-node" title="Видалити поле">&times;</button>`;
                container.appendChild(fieldRow);
                return;
            }
            case 'add-object': {
                const container = target.closest('.edit-form-field-container');
                const fieldset = document.createElement('fieldset');
                fieldset.className = 'edit-form-fieldset';
                fieldset.innerHTML = `<div class="fieldset-header"><input type="text" data-type="key" value="новий_обєкт" placeholder="Назва об'єкта"><button type="button" class="delete-btn" data-action="delete-node" title="Видалити об'єкт">&times;</button></div><div class="edit-form-field-container"></div><div class="fieldset-actions"><button type="button" class="add-btn" data-action="add-field-to-object">Додати поле</button></div>`;
                container.appendChild(fieldset);
                return;
            }
        }

        // Дії над елементами дерева
        const path = target.closest('[data-path]').dataset.path;
        if (!path) return;
        const { parent, obj, index } = getObjectAndParentByPath(path);
        if (!obj) { console.error("Error finding object for path:", path); return; }

        switch (action) {
            case 'edit': obj.isEditing = true; break;
            case 'cancel': delete obj.isEditing; break;
            case 'delete': if (confirm(`Ви впевнені?`)) { parent.splice(index, 1); } break;
            case 'add': const newSub = { name: "Новий елемент", isEditing: true }; let subsKey = Object.keys(obj).find(key => Array.isArray(obj[key])); if (!subsKey) { subsKey = 'subsidiaries'; obj[subsKey] = []; } obj[subsKey].unshift(newSub); obj.isCollapsed = false; break;
            case 'toggle-collapse': obj.isCollapsed = !obj.isCollapsed; break;
        }
        renderApp();
    });
    
    // --- РЕКУРСИВНИЙ ЗБІР ДАНИХ З ФОРМИ ПРИ ЗБЕРЕЖЕННІ ---
    appContainer.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const path = form.dataset.path;
        const { obj: originalObject } = getObjectAndParentByPath(path);
        if (!originalObject) return;

        const buildObjectFromNode = (container) => {
            const data = {};
            container.childNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                if (node.classList.contains('form-field-row')) {
                    const key = node.querySelector('[data-type="key"]').value.trim();
                    const value = node.querySelector('[data-type="value"]').value;
                    if (key) data[key] = value;
                } else if (node.classList.contains('edit-form-fieldset')) {
                    const key = node.querySelector('[data-type="key"]').value.trim();
                    if (key) {
                        data[key] = buildObjectFromNode(node.querySelector('.edit-form-field-container'));
                    }
                }
            });
            return data;
        };
        
        const newObjectData = buildObjectFromNode(form.querySelector('.edit-form-field-container'));
        
        // Зберігаємо системні поля та масиви з оригінального об'єкта
        for (const key in originalObject) {
            if (key.startsWith('_') || key === 'isCollapsed' || Array.isArray(originalObject[key])) {
                newObjectData[key] = originalObject[key];
            }
        }
        
        Object.keys(originalObject).forEach(key => delete originalObject[key]);
        Object.assign(originalObject, newObjectData);
        delete originalObject.isEditing;
        renderApp();
    });

    // --- Експорт та інші утиліти ---
    exportBtn.addEventListener('click', () => { if (!appData) return; function cleanup(obj) { if (typeof obj !== 'object' || obj === null) return; Object.keys(obj).forEach(key => { if (key.startsWith('_') || key === 'isEditing' || key === 'isCollapsed') { delete obj[key]; } }); Object.values(obj).forEach(value => { if (Array.isArray(value)) value.forEach(cleanup); }); } const dataToExport = JSON.parse(JSON.stringify(appData)); cleanup(dataToExport); const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2)); const downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", "orgtree-data-updated.json"); document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove(); });
    addRootBtn.addEventListener('click', () => { const dataArray = findDataArray(appData); if (!dataArray) return; const newOrg = { name: "Новий кореневий елемент", isEditing: true }; dataArray.unshift(newOrg); renderApp(); });
    function updateUIState() { const hasData = appData !== null; exportBtn.disabled = !hasData; addRootBtn.disabled = !hasData; searchInput.disabled = !hasData; }
});