/**
 * Main Application Module
 * Orchestrates UI, authentication, data loading, and rendering.
 */

const App = {
    project: null,
    data: null,
    currentSection: 'resumen',
    photos: [],
    currentPhotoIndex: 0,

    // ========== INITIALIZATION ==========

    init() {
        this.bindEvents();
        // Check for existing session
        const session = Auth.getSession();
        if (session) {
            this.project = session;
            this.showDashboard();
        }
    },

    bindEvents() {
        // Login - use form submit to handle both Enter key and button click
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Toggle password visibility
        document.getElementById('toggle-password').addEventListener('click', () => {
            const input = document.getElementById('password-input');
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            // When showing text (was password), hide eye-icon and show eye-off
            document.querySelector('.eye-icon').classList.toggle('hidden', isPassword);
            document.querySelector('.eye-off-icon').classList.toggle('hidden', !isPassword);
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.navigateTo(btn.dataset.section));
        });

        // Header buttons
        document.getElementById('refresh-btn').addEventListener('click', () => {
            DataService.clearCache();
            this.loadData();
        });
        document.getElementById('print-btn').addEventListener('click', () => window.print());
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

        // Expense filters
        document.getElementById('filter-category').addEventListener('change', () => this.filterExpenses());
        document.getElementById('filter-subcategory').addEventListener('change', () => this.filterExpenses());
        document.getElementById('filter-date-from').addEventListener('change', () => this.filterExpenses());
        document.getElementById('filter-date-to').addEventListener('change', () => this.filterExpenses());
        document.getElementById('clear-filters').addEventListener('click', () => this.clearFilters());

        // Lightbox keyboard navigation
        document.addEventListener('keydown', (e) => {
            const lightbox = document.getElementById('lightbox');
            if (lightbox.classList.contains('hidden')) return;
            if (e.key === 'Escape') this.closeLightbox();
            if (e.key === 'ArrowLeft') this.prevPhoto();
            if (e.key === 'ArrowRight') this.nextPhoto();
        });

        // Close lightbox on background click
        document.getElementById('lightbox').addEventListener('click', (e) => {
            if (e.target.id === 'lightbox') this.closeLightbox();
        });
    },

    // ========== AUTH ==========

    handleLogin() {
        const password = document.getElementById('password-input').value;
        const errorEl = document.getElementById('login-error');

        if (!password.trim()) {
            errorEl.classList.remove('hidden');
            errorEl.textContent = 'Por favor ingresa una contraseña.';
            return;
        }

        const project = Auth.login(password);
        if (project) {
            this.project = project;
            errorEl.classList.add('hidden');
            this.showDashboard();
        } else {
            errorEl.classList.remove('hidden');
            errorEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Contraseña incorrecta. Intenta de nuevo.';
            document.getElementById('password-input').value = '';
            document.getElementById('password-input').focus();
        }
    },

    handleLogout() {
        Auth.logout();
        this.project = null;
        this.data = null;
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('password-input').value = '';
    },

    // ========== NAVIGATION ==========

    showDashboard() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('project-name').textContent = this.project.name;
        this.loadData();
    },

    navigateTo(section) {
        this.currentSection = section;
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });
        // Show/hide sections
        document.querySelectorAll('.section').forEach(sec => {
            sec.classList.toggle('hidden', sec.id !== `section-${section}`);
        });
        // Load gallery photos on first visit
        if (section === 'galeria' && this.photos.length === 0) {
            this.loadGallery();
        }
    },

    // ========== DATA LOADING ==========

    async loadData() {
        const loadingEl = document.getElementById('loading-state');
        const errorEl = document.getElementById('error-state');
        const mainEl = document.getElementById('main-content');

        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        mainEl.classList.add('hidden');

        try {
            this.data = await DataService.fetchAllData(this.project);
            loadingEl.classList.add('hidden');
            mainEl.classList.remove('hidden');
            this.renderAll();
        } catch (err) {
            console.error('Error loading data:', err);
            loadingEl.classList.add('hidden');
            errorEl.classList.remove('hidden');
            document.getElementById('error-message').textContent =
                `No se pudieron obtener los datos del proyecto. Error: ${err.message}. Verifica tu conexión e intenta de nuevo.`;
        }
    },

    // ========== RENDER ALL ==========

    renderAll() {
        const { budget, expenses, capital, fetchedAt } = this.data;
        const expSummary = DataService.calculateExpenseSummary(expenses);

        // Update timestamp
        document.getElementById('last-updated').textContent =
            `Datos actualizados: ${fetchedAt.toLocaleString('es-MX')}`;

        this.renderSummary(budget, expSummary, capital);
        this.renderBudgetVsExecuted(budget, expSummary);
        this.renderFinancials(capital);
        this.renderHouses(budget);
        this.renderSales(budget);
        this.renderExpensesTable(expenses);
    },

    // ========== SECTION: RESUMEN ==========

    renderSummary(budget, expSummary, capital) {
        // Total Investment
        const totalBudget = (budget.hardCosts.total || 0) +
                            (budget.softCosts.total || 0) +
                            (budget.terreno.total || 0);
        document.getElementById('total-investment').textContent = DataService.formatCurrency(totalBudget);

        // Total Spent
        document.getElementById('total-spent').textContent = DataService.formatCurrency(expSummary.total);

        // General Progress - Weighted: 80% Hard Cost + 20% Soft Cost (excludes Terreno)
        const hardCostBudget = budget.hardCosts.total || 0;
        const softCostBudget = budget.softCosts.total || 0;
        const hardCostSpent = expSummary.byCategory['Hard Cost'] || 0;
        const softCostSpent = expSummary.byCategory['Soft Cost'] || 0;

        const hardCostProgress = hardCostBudget > 0 ? (hardCostSpent / hardCostBudget) * 100 : 0;
        const softCostProgress = softCostBudget > 0 ? (softCostSpent / softCostBudget) * 100 : 0;

        // Weighted average: 80% weight for Hard Cost, 20% weight for Soft Cost
        const weightedProgress = (hardCostProgress * 0.80) + (softCostProgress * 0.20);
        document.getElementById('general-progress').textContent = DataService.formatPercent(weightedProgress);

        // ROI
        const roi = capital.capitalIndicators.roi || 0;
        document.getElementById('expected-roi').textContent = DataService.formatPercent(roi);

        // Category Progress Summary
        this.renderCategoryProgressSummary(budget, expSummary);

        // Capital Distribution
        this.renderCapitalDistribution(capital);
    },

    renderCategoryProgressSummary(budget, expSummary) {
        const container = document.getElementById('category-progress-summary');
        const categories = [
            {
                name: 'Hard Costs',
                budget: budget.hardCosts.total || 0,
                spent: expSummary.byCategory['Hard Cost'] || 0,
                color: 'blue'
            },
            {
                name: 'Soft Costs',
                budget: budget.softCosts.total || 0,
                spent: expSummary.byCategory['Soft Cost'] || 0,
                color: 'purple'
            },
            {
                name: 'Terreno',
                budget: budget.terreno.total || 0,
                spent: expSummary.byCategory['Terreno'] || 0,
                color: 'orange'
            }
        ];

        container.innerHTML = categories.map(cat => {
            const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
            const colorClass = pct > 100 ? 'red' : cat.color;
            return `
                <div class="progress-item">
                    <div class="progress-header">
                        <span class="progress-label">${cat.name}</span>
                        <span class="progress-values">${DataService.formatPercent(pct)}</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${colorClass}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="progress-amounts">
                        <span>Gastado: ${DataService.formatCurrencyShort(cat.spent)}</span>
                        <span>Presupuesto: ${DataService.formatCurrencyShort(cat.budget)}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderCapitalDistribution(capital) {
        const container = document.getElementById('capital-distribution');
        const uses = capital.uses;
        const total = (uses.hardCosts?.amount || 0) + (uses.softCosts?.amount || 0) + (uses.terreno?.amount || 0);

        const segments = [
            { name: 'Hard Costs', amount: uses.hardCosts?.amount || 0, pct: uses.hardCosts?.pct || 0, color: '#3182ce' },
            { name: 'Soft Costs', amount: uses.softCosts?.amount || 0, pct: uses.softCosts?.pct || 0, color: '#6b46c1' },
            { name: 'Terreno', amount: uses.terreno?.amount || 0, pct: uses.terreno?.pct || 0, color: '#dd6b20' }
        ];

        // Calculate conic gradient for pie chart
        let gradientStops = [];
        let currentAngle = 0;
        segments.forEach(s => {
            const pctOfTotal = total > 0 ? (s.amount / total) * 100 : 33.33;
            gradientStops.push(`${s.color} ${currentAngle}% ${currentAngle + pctOfTotal}%`);
            currentAngle += pctOfTotal;
        });

        container.innerHTML = `
            <div class="pie-chart-container">
                <div class="pie-chart" style="background: conic-gradient(${gradientStops.join(', ')});"></div>
                <div class="pie-chart-center">
                    <span class="pie-chart-center-value">${DataService.formatCurrencyShort(total)}</span>
                    <span class="pie-chart-center-label">Total</span>
                </div>
            </div>
            <div class="capital-legend">
                ${segments.map(s => {
                    const pctOfTotal = total > 0 ? (s.amount / total) * 100 : 0;
                    return `
                    <div class="capital-legend-item">
                        <div class="capital-legend-left">
                            <span class="legend-dot" style="background:${s.color}"></span>
                            <span>${s.name}</span>
                        </div>
                        <span class="capital-legend-amount">${DataService.formatCurrencyShort(s.amount)}</span>
                        <span class="capital-legend-pct">${DataService.formatPercent(pctOfTotal)}</span>
                    </div>
                `}).join('')}
            </div>
        `;
    },

    // ========== SECTION: PRESUPUESTO VS EJECUTADO ==========

    renderBudgetVsExecuted(budget, expSummary) {
        // Hard Costs
        this.renderBudgetCategory(
            'hard-cost-progress', 'hard-cost-badge',
            budget.hardCosts.total || 0,
            expSummary.byCategory['Hard Cost'] || 0,
            'blue'
        );

        // Soft Costs
        this.renderBudgetCategory(
            'soft-cost-progress', 'soft-cost-badge',
            budget.softCosts.total || 0,
            expSummary.byCategory['Soft Cost'] || 0,
            'purple'
        );
        this.renderSubcategoryBreakdown('soft-cost-breakdown', budget.softCosts.items || [], expSummary, 'Soft Cost', 'purple');

        // Terreno
        this.renderBudgetCategory(
            'terreno-progress', 'terreno-badge',
            budget.terreno.total || 0,
            expSummary.byCategory['Terreno'] || 0,
            'orange'
        );
        this.renderSubcategoryBreakdown('terreno-breakdown', budget.terreno.items || [], expSummary, 'Terreno', 'orange');

        // Total summary
        const totalBudget = (budget.hardCosts.total || 0) + (budget.softCosts.total || 0) + (budget.terreno.total || 0);
        const totalSpent = expSummary.total;
        const remaining = totalBudget - totalSpent;
        const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

        document.getElementById('total-budget-summary').innerHTML = `
            <div class="budget-total-item">
                <div class="budget-total-label">Presupuesto Total</div>
                <div class="budget-total-value">${DataService.formatCurrency(totalBudget)}</div>
            </div>
            <div class="budget-total-item">
                <div class="budget-total-label">Ejecutado</div>
                <div class="budget-total-value" style="color: var(--secondary)">${DataService.formatCurrency(totalSpent)}</div>
                <div class="budget-total-sub">${DataService.formatPercent(pct)} del presupuesto</div>
            </div>
            <div class="budget-total-item">
                <div class="budget-total-label">Restante</div>
                <div class="budget-total-value" style="color: ${remaining >= 0 ? 'var(--warning)' : 'var(--danger)'}">${DataService.formatCurrency(remaining)}</div>
                <div class="budget-total-sub">${DataService.formatPercent(100 - pct)} por ejecutar</div>
            </div>
        `;
    },

    renderBudgetCategory(progressId, badgeId, budgetAmount, spentAmount, color) {
        const pct = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
        const colorClass = pct > 100 ? 'red' : color;

        document.getElementById(progressId).innerHTML = `
            <div class="progress-item">
                <div class="progress-header">
                    <span class="progress-label">Ejecutado vs Presupuestado</span>
                    <span class="progress-values">${DataService.formatPercent(pct)}</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${colorClass}" style="width: ${Math.min(pct, 100)}%"></div>
                </div>
                <div class="progress-amounts">
                    <span>Ejecutado: ${DataService.formatCurrency(spentAmount)}</span>
                    <span>Presupuesto: ${DataService.formatCurrency(budgetAmount)}</span>
                </div>
            </div>
        `;

        const badge = document.getElementById(badgeId);
        badge.textContent = DataService.formatPercent(pct);
        badge.className = 'badge ' + (pct > 100 ? 'badge-red' : pct > 75 ? 'badge-orange' : 'badge-green');
    },

    renderSubcategoryBreakdown(containerId, items, expSummary, categoryKey, color) {
        const container = document.getElementById(containerId);
        if (!items.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = items.map(item => {
            const subKey = `${categoryKey}|${item.name}`;
            const spent = expSummary.bySubcategory[subKey] || 0;
            const pct = item.amount > 0 ? (spent / item.amount) * 100 : 0;
            const barColor = pct > 100 ? 'var(--danger)' : `var(--${color === 'purple' ? 'purple' : color === 'orange' ? 'warning' : 'blue'})`;

            return `
                <div class="subcategory-item">
                    <span class="subcategory-name">${item.name}</span>
                    <div class="subcategory-values">
                        <span class="subcat-budget">Pres: ${DataService.formatCurrencyShort(item.amount)}</span>
                        <span class="subcat-spent">Gast: ${DataService.formatCurrencyShort(spent)}</span>
                        <div class="subcat-bar">
                            <div class="subcat-bar-fill" style="width: ${Math.min(pct, 100)}%; background: ${barColor}"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ========== SECTION: FINANCIEROS ==========

    renderFinancials(capital) {
        const pi = capital.projectIndicators;
        const ci = capital.capitalIndicators;

        // Project Indicators
        document.getElementById('project-indicators').innerHTML = `
            <div class="indicator-row">
                <span class="indicator-label">${pi.totalIncomeLabel || 'Ingresos Totales'}</span>
                <span class="indicator-value highlight">${DataService.formatCurrency(pi.totalIncome || 0)}</span>
            </div>
            <div class="indicator-row">
                <span class="indicator-label">${pi.projectCostLabel || 'Costo del Proyecto'}</span>
                <span class="indicator-value">${DataService.formatCurrency(pi.projectCost || 0)}</span>
            </div>
            <div class="indicator-row">
                <span class="indicator-label">${pi.profitLabel || 'Utilidad'}</span>
                <span class="indicator-value positive">${DataService.formatCurrency(pi.profit || 0)}</span>
            </div>
            <div class="indicator-row">
                <span class="indicator-label">${pi.marginLabel || 'Margen de Utilidad'}</span>
                <span class="indicator-value positive">${DataService.formatPercent(pi.margin || 0)}</span>
            </div>
        `;

        // Capital Indicators
        document.getElementById('capital-indicators').innerHTML = `
            <div class="indicator-row">
                <span class="indicator-label">${ci.capitalContributedLabel || 'Capital Aportado'}</span>
                <span class="indicator-value">${DataService.formatCurrency(ci.capitalContributed || 0)}</span>
            </div>
            <div class="indicator-row">
                <span class="indicator-label">${ci.totalReturnLabel || 'Retorno Total'}</span>
                <span class="indicator-value positive">${DataService.formatCurrency(ci.totalReturn || 0)}</span>
            </div>
            <div class="indicator-row">
                <span class="indicator-label">${ci.roiLabel || 'ROI'}</span>
                <span class="indicator-value positive">${DataService.formatPercent(ci.roi || 0)}</span>
            </div>
            <div class="indicator-row">
                <span class="indicator-label">${ci.capitalMultipleLabel || 'Múltiplo de Capital'}</span>
                <span class="indicator-value highlight">${(ci.capitalMultiple || 0).toFixed(2)}x</span>
            </div>
        `;

        // Investors
        const investorsEl = document.getElementById('investors-list');
        if (capital.investors.length > 0) {
            investorsEl.innerHTML = capital.investors.map(inv => {
                const initials = inv.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                return `
                    <div class="investor-card">
                        <div class="investor-avatar">${initials}</div>
                        <div>
                            <div class="investor-name">${inv.name}</div>
                            <div class="investor-amount">${DataService.formatCurrency(inv.amount)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            investorsEl.innerHTML = '<p class="no-data">No se encontraron datos de inversionistas.</p>';
        }
    },

    // ========== SECTION: CASAS ==========

    renderHouses(budget) {
        const container = document.getElementById('houses-grid');
        if (!budget.houses.length) {
            container.innerHTML = '<p class="no-data">No se encontraron datos de las casas.</p>';
            return;
        }

        container.innerHTML = budget.houses.map((house, i) => `
            <div class="house-card">
                <div class="house-header">
                    <div class="house-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <span class="house-name">Casa ${i + 1}</span>
                </div>
                <div class="house-details">
                    <div class="house-detail">
                        <div class="house-detail-label">Superficie</div>
                        <div class="house-detail-value">${house.sqm.toLocaleString('en-US')} m&sup2;</div>
                    </div>
                    <div class="house-detail">
                        <div class="house-detail-label">Precio por m&sup2;</div>
                        <div class="house-detail-value">${DataService.formatCurrency(house.pricePerSqm)}</div>
                    </div>
                    <div class="house-detail">
                        <div class="house-detail-label">Precio de Venta</div>
                        <div class="house-detail-value">${DataService.formatCurrency(house.totalCommercial)}</div>
                    </div>
                    <div class="house-detail">
                        <div class="house-detail-label">Ingreso Neto</div>
                        <div class="house-detail-value">${DataService.formatCurrency(house.netIncome)}</div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // ========== SECTION: VENTAS (Placeholder) ==========

    renderSales(budget) {
        const container = document.getElementById('sales-grid');
        const houses = budget.houses.length ? budget.houses : [
            { totalCommercial: 0 }, { totalCommercial: 0 }
        ];

        const statuses = [
            { label: 'Disponible', class: 'status-available' },
            { label: 'Disponible', class: 'status-available' }
        ];

        container.innerHTML = houses.map((house, i) => `
            <div class="sale-card">
                <div class="sale-header">
                    <span class="sale-name">Casa ${i + 1}</span>
                    <span class="sale-status ${statuses[i].class}">${statuses[i].label}</span>
                </div>
                <div class="sale-info">
                    <div class="sale-row">
                        <span class="sale-row-label">Precio de venta</span>
                        <span class="sale-row-value">${DataService.formatCurrency(house.totalCommercial)}</span>
                    </div>
                    <div class="sale-row">
                        <span class="sale-row-label">Estado</span>
                        <span class="sale-row-value">${statuses[i].label}</span>
                    </div>
                    <div class="sale-row">
                        <span class="sale-row-label">Comprador</span>
                        <span class="sale-row-value" style="color: var(--text-muted)">Pendiente</span>
                    </div>
                    <div class="sale-row">
                        <span class="sale-row-label">Fecha estimada de cierre</span>
                        <span class="sale-row-value" style="color: var(--text-muted)">Por definir</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // ========== SECTION: GALERÍA ==========

    async loadGallery() {
        const loadingEl = document.getElementById('gallery-loading');
        const gridEl = document.getElementById('gallery-grid');
        const emptyEl = document.getElementById('gallery-empty');

        loadingEl.classList.remove('hidden');
        gridEl.classList.add('hidden');
        emptyEl.classList.add('hidden');

        try {
            // Google Drive folder approach:
            // We'll use the folder ID to construct thumbnail URLs.
            // Since we can't list files from a public folder without API key easily from client-side,
            // we embed the folder as an iframe or use known image IDs.
            // For now, we'll try to use the Google Drive embed approach.

            const folderId = this.extractFolderId(this.project.driveFolder);
            if (!folderId) {
                throw new Error('No se pudo obtener el ID de la carpeta de Drive.');
            }

            // Try fetching the folder page to extract file IDs
            const photos = await this.fetchDrivePhotos(folderId);

            if (photos.length === 0) {
                loadingEl.classList.add('hidden');
                emptyEl.classList.remove('hidden');
                // Show fallback embed
                emptyEl.innerHTML = `
                    <p>Las fotos se pueden ver directamente en Google Drive:</p>
                    <a href="${this.project.driveFolder}" target="_blank" rel="noopener" style="color: var(--primary); text-decoration: underline; margin-top: 0.5rem;">
                        Abrir carpeta de fotos en Google Drive
                    </a>
                `;
                return;
            }

            this.photos = photos;
            gridEl.innerHTML = photos.map((photo, idx) => `
                <div class="gallery-item" onclick="App.openLightbox(${idx})">
                    <img src="${photo.thumbnail}" alt="${photo.name || 'Foto de avance'}" loading="lazy" onerror="this.parentElement.style.display='none'">
                    <div class="gallery-item-overlay">${photo.name || ''}</div>
                </div>
            `).join('');

            loadingEl.classList.add('hidden');
            gridEl.classList.remove('hidden');
        } catch (err) {
            console.error('Error loading gallery:', err);
            loadingEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
            emptyEl.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a0aec0" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <p style="margin-top: 1rem;">Las fotos se pueden ver directamente en Google Drive:</p>
                <a href="${this.project.driveFolder}" target="_blank" rel="noopener" style="color: var(--primary); text-decoration: underline; margin-top: 0.5rem; font-weight: 500;">
                    Abrir carpeta de fotos en Google Drive
                </a>
            `;
        }
    },

    extractFolderId(url) {
        if (!url) return null;
        const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    },

    async fetchDrivePhotos(folderId) {
        // Since Google Drive public folders can't be easily listed via client-side JS without an API key,
        // we use a workaround: fetch the folder HTML page and parse image IDs from it.
        // Alternative: embed the folder or use Google Picker.

        // Approach: use Google Drive API with the folder embed page
        // We'll try to get file listings from the public folder embed
        const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;

        try {
            const response = await fetch(url);
            const html = await response.text();

            // Extract file IDs from the HTML
            const fileIdRegex = /data-id="([a-zA-Z0-9_-]+)"/g;
            const ids = [];
            let match;
            while ((match = fileIdRegex.exec(html)) !== null) {
                ids.push(match[1]);
            }

            if (ids.length === 0) {
                // Try another pattern
                const altRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/g;
                while ((match = altRegex.exec(html)) !== null) {
                    if (!ids.includes(match[1])) {
                        ids.push(match[1]);
                    }
                }
            }

            return ids.map(id => ({
                id,
                name: '',
                thumbnail: `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
                full: `https://drive.google.com/thumbnail?id=${id}&sz=w1600`
            }));
        } catch (e) {
            console.warn('Could not fetch Drive folder contents:', e);
            return [];
        }
    },

    openLightbox(index) {
        if (!this.photos.length) return;
        this.currentPhotoIndex = index;
        const photo = this.photos[index];
        document.getElementById('lightbox-img').src = photo.full || photo.thumbnail;
        document.getElementById('lightbox-caption').textContent = photo.name || `Foto ${index + 1} de ${this.photos.length}`;
        document.getElementById('lightbox').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    closeLightbox() {
        document.getElementById('lightbox').classList.add('hidden');
        document.body.style.overflow = '';
    },

    prevPhoto() {
        if (!this.photos.length) return;
        this.currentPhotoIndex = (this.currentPhotoIndex - 1 + this.photos.length) % this.photos.length;
        this.openLightbox(this.currentPhotoIndex);
    },

    nextPhoto() {
        if (!this.photos.length) return;
        this.currentPhotoIndex = (this.currentPhotoIndex + 1) % this.photos.length;
        this.openLightbox(this.currentPhotoIndex);
    },

    // ========== SECTION: GASTOS ==========

    renderExpensesTable(expenses) {
        // Populate subcategory filter
        const subcategories = [...new Set(expenses.map(e => e.subcategory).filter(Boolean))].sort();
        const subSelect = document.getElementById('filter-subcategory');
        subSelect.innerHTML = '<option value="all">Todas</option>' +
            subcategories.map(s => `<option value="${s}">${s}</option>`).join('');

        this.filterExpenses();
    },

    filterExpenses() {
        if (!this.data) return;

        const category = document.getElementById('filter-category').value;
        const subcategory = document.getElementById('filter-subcategory').value;
        const dateFrom = document.getElementById('filter-date-from').value;
        const dateTo = document.getElementById('filter-date-to').value;

        let filtered = [...this.data.expenses];

        if (category !== 'all') {
            filtered = filtered.filter(e => DataService.normalizeCategory(e.category) === category);
        }
        if (subcategory !== 'all') {
            filtered = filtered.filter(e => e.subcategory === subcategory);
        }
        if (dateFrom) {
            const from = new Date(dateFrom);
            filtered = filtered.filter(e => e.dateObj && e.dateObj >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            filtered = filtered.filter(e => e.dateObj && e.dateObj <= to);
        }

        const tbody = document.getElementById('expenses-tbody');
        const noExpenses = document.getElementById('no-expenses');
        const tableWrapper = document.querySelector('.table-wrapper');

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            noExpenses.classList.remove('hidden');
            tableWrapper.classList.add('hidden');
            return;
        }

        noExpenses.classList.add('hidden');
        tableWrapper.classList.remove('hidden');

        // Sort by date descending
        filtered.sort((a, b) => {
            if (!a.dateObj && !b.dateObj) return 0;
            if (!a.dateObj) return 1;
            if (!b.dateObj) return -1;
            return b.dateObj - a.dateObj;
        });

        let total = 0;
        tbody.innerHTML = filtered.map(exp => {
            total += exp.amount;
            const normCat = DataService.normalizeCategory(exp.category);
            const tagClass = normCat === 'Hard Cost' ? 'tag-hard' :
                             normCat === 'Soft Cost' ? 'tag-soft' : 'tag-terreno';
            const formattedDate = exp.dateObj
                ? exp.dateObj.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
                : exp.date || '-';

            return `
                <tr>
                    <td>${formattedDate}</td>
                    <td><span class="category-tag ${tagClass}">${normCat}</span></td>
                    <td>${exp.subcategory}</td>
                    <td class="text-right">${DataService.formatCurrency(exp.amount)}</td>
                </tr>
            `;
        }).join('');

        document.getElementById('expenses-total').innerHTML = `<strong>${DataService.formatCurrency(total)}</strong>`;
    },

    clearFilters() {
        document.getElementById('filter-category').value = 'all';
        document.getElementById('filter-subcategory').value = 'all';
        document.getElementById('filter-date-from').value = '';
        document.getElementById('filter-date-to').value = '';
        this.filterExpenses();
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
