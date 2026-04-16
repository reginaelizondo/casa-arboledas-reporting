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
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

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
        this.renderSubcategoryBreakdown('hard-cost-breakdown', budget.hardCosts.items || [], expSummary, 'Hard Cost', 'blue');

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
        const isOverBudget = pct > 100;
        const isComplete = pct >= 99.5 && pct <= 100.5;

        // Colores originales para la barra principal (azul/morado/naranja)
        let colorClass = color;
        let statusIcon = '';

        if (isOverBudget) {
            colorClass = 'red';
            statusIcon = '<span class="status-icon over">⚠</span>';
        } else if (isComplete) {
            colorClass = 'complete';
            statusIcon = '<span class="status-icon complete">✓</span>';
        }

        document.getElementById(progressId).innerHTML = `
            <div class="progress-item">
                <div class="progress-header">
                    <span class="progress-label">Ejecutado vs Presupuestado ${statusIcon}</span>
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
        badge.className = 'badge badge-' + color;
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
            const isOverBudget = pct > 100;
            // Verde si está por debajo del presupuesto, Rojo si lo supera
            const barColor = isOverBudget ? 'var(--danger)' : 'var(--success)';
            const spentColor = isOverBudget ? 'var(--danger)' : 'var(--success)';

            return `
                <div class="subcategory-item">
                    <span class="subcategory-name">${item.name}</span>
                    <div class="subcategory-values">
                        <span class="subcat-budget">Pres: ${DataService.formatCurrencyShort(item.amount)}</span>
                        <span class="subcat-spent" style="color: ${spentColor}">Gast: ${DataService.formatCurrencyShort(spent)}</span>
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

        // Project Duration
        const pd = capital.projectDuration || {};
        document.getElementById('project-duration').innerHTML = `
            <div class="duration-item">
                <span class="duration-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </span>
                <div class="duration-info">
                    <span class="duration-label">${pd.startLabel || 'Inicio del Proyecto'}</span>
                    <span class="duration-value">${pd.startDate || '--'}</span>
                </div>
            </div>
            <div class="duration-item">
                <span class="duration-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <div class="duration-info">
                    <span class="duration-label">${pd.endLabel || 'Proyección Fin de Proyecto'}</span>
                    <span class="duration-value">${pd.endDate || '--'}</span>
                </div>
            </div>
            <div class="duration-item">
                <span class="duration-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                </span>
                <div class="duration-info">
                    <span class="duration-label">${pd.durationLabel || 'Duración del Proyecto'}</span>
                    <span class="duration-value">${pd.duration || '--'}</span>
                </div>
            </div>
            <div class="duration-item highlight">
                <span class="duration-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                </span>
                <div class="duration-info">
                    <span class="duration-label">${pd.annualizedRoiLabel || 'ROI Anualizado'}</span>
                    <span class="duration-value positive">${DataService.formatPercent(pd.annualizedRoi || 0)}</span>
                </div>
            </div>
        `;

        // Investors - Cards side by side
        const investorsCardsEl = document.getElementById('investors-cards');
        const investorsSummaryEl = document.getElementById('investors-summary');

        if (capital.investors.length > 0) {
            // Calcular totales
            const totalProjected = capital.investors.reduce((sum, inv) => sum + (inv.projected || 0), 0);
            const totalContributed = capital.investors.reduce((sum, inv) => sum + (inv.contributed || 0), 0);
            const totalRemaining = totalProjected - totalContributed;
            const pctTotal = totalProjected > 0 ? (totalContributed / totalProjected) * 100 : 0;

            // Tarjetas de inversionistas lado a lado
            investorsCardsEl.innerHTML = capital.investors.map(inv => {
                const initials = inv.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                const contributed = inv.contributed || 0;
                const projected = inv.projected || 0;
                const remaining = projected - contributed;
                const pctContributed = projected > 0 ? (contributed / projected) * 100 : 0;
                return `
                    <div class="investor-card-full">
                        <div class="investor-card-header">
                            <div class="investor-avatar">${initials}</div>
                            <div class="investor-name-large">${inv.name}</div>
                        </div>
                        <div class="investor-card-body">
                            <div class="investor-stat">
                                <span class="investor-stat-label">Proyectado</span>
                                <span class="investor-stat-value">${DataService.formatCurrency(projected)}</span>
                            </div>
                            <div class="investor-stat">
                                <span class="investor-stat-label">Aportado</span>
                                <span class="investor-stat-value positive">${DataService.formatCurrency(contributed)}</span>
                            </div>
                            <div class="investor-stat">
                                <span class="investor-stat-label">Faltante</span>
                                <span class="investor-stat-value ${remaining > 0 ? 'warning' : ''}">${DataService.formatCurrency(remaining)}</span>
                            </div>
                            <div class="investor-progress-section">
                                <div class="progress-bar-bg">
                                    <div class="progress-bar-fill green" style="width: ${Math.min(pctContributed, 100)}%"></div>
                                </div>
                                <span class="investor-pct">${DataService.formatPercent(pctContributed)}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Resumen de capital a lo largo
            investorsSummaryEl.innerHTML = `
                <h3 class="card-title">Resumen de Capital</h3>
                <div class="capital-summary-row">
                    <div class="capital-summary-item">
                        <span class="capital-summary-label">Capital Proyectado</span>
                        <span class="capital-summary-value">${DataService.formatCurrency(totalProjected)}</span>
                    </div>
                    <div class="capital-summary-item">
                        <span class="capital-summary-label">Total Aportado</span>
                        <span class="capital-summary-value positive">${DataService.formatCurrency(totalContributed)}</span>
                    </div>
                    <div class="capital-summary-item highlight">
                        <span class="capital-summary-label">Monto Faltante</span>
                        <span class="capital-summary-value ${totalRemaining > 0 ? 'warning' : 'positive'}">${DataService.formatCurrency(totalRemaining)}</span>
                    </div>
                </div>
            `;
        } else {
            investorsCardsEl.innerHTML = '<p class="no-data">No se encontraron datos de inversionistas.</p>';
            investorsSummaryEl.innerHTML = '';
        }
    },

    // ========== SECTION: CASAS (combinado con Ventas) ==========

    renderHouses(budget) {
        const container = document.getElementById('houses-grid');
        if (!budget.houses.length) {
            container.innerHTML = '<p class="no-data">No se encontraron datos de las casas.</p>';
            return;
        }

        // URLs de las imágenes de los renders
        const houseImages = [
            'images/casa1.jpg',
            'images/casa2.jpg'
        ];

        const inmuebles24Link = `
            <div style="grid-column: 1 / -1; text-align: center; margin-top: 8px;">
                <a href="https://www.inmuebles24.com/propiedades/clasificado/veclcapa-preventa-casa-de-lujo-en-privada-con-seguridad-y-149223492.html?n_src=Listado&n_pg=1&n_pos=1"
                   target="_blank"
                   style="display: inline-block; padding: 10px 24px; background: #1a1a2e; color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
                    Ver en Inmuebles24
                </a>
            </div>
        `;

        container.innerHTML = budget.houses.map((house, i) => {
            // Determinar estado y clase de badge
            const status = house.status || 'Disponible';
            const statusLower = status.toLowerCase();
            let statusClass = 'status-available';
            if (statusLower.includes('vendida') || statusLower.includes('vendido')) {
                statusClass = 'status-sold';
            } else if (statusLower.includes('proceso') || statusLower.includes('reservada') || statusLower.includes('reservado')) {
                statusClass = 'status-pending';
            }

            const imageUrl = houseImages[i] || '';

            return `
                <div class="property-card">
                    <div class="property-image">
                        ${imageUrl ? `<img src="${imageUrl}" alt="Render ${house.name || `Casa ${i + 1}`}" loading="lazy">` : `
                        <div class="property-image-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                <polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                            <span>Render Casa ${i + 1}</span>
                        </div>
                        `}
                    </div>
                    <div class="property-content">
                        <div class="property-header">
                            <h3 class="property-name">${house.name || `Casa ${i + 1}`}</h3>
                            <span class="property-status ${statusClass}">${status}</span>
                        </div>
                        <div class="property-details">
                            <div class="property-detail">
                                <span class="property-detail-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                </span>
                                <div>
                                    <span class="property-detail-label">Superficie</span>
                                    <span class="property-detail-value">${house.sqm.toLocaleString('en-US')} m²</span>
                                </div>
                            </div>
                            <div class="property-detail">
                                <span class="property-detail-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                </span>
                                <div>
                                    <span class="property-detail-label">Precio / m²</span>
                                    <span class="property-detail-value">${DataService.formatCurrency(house.pricePerSqm)}</span>
                                </div>
                            </div>
                            <div class="property-detail">
                                <span class="property-detail-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                </span>
                                <div>
                                    <span class="property-detail-label">Precio Mercado</span>
                                    <span class="property-detail-value highlight">${DataService.formatCurrency(house.totalCommercial)}</span>
                                </div>
                            </div>
                            <div class="property-detail">
                                <span class="property-detail-icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                                </span>
                                <div>
                                    <span class="property-detail-label">Ingreso Neto</span>
                                    <span class="property-detail-value">${DataService.formatCurrency(house.netIncome)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') + inmuebles24Link;
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

    // ========== TOGGLE BREAKDOWN ==========

    toggleBreakdown(breakdownId) {
        const breakdown = document.getElementById(breakdownId);
        const button = breakdown.previousElementSibling;
        const isCollapsed = breakdown.classList.contains('collapsed');

        if (isCollapsed) {
            breakdown.classList.remove('collapsed');
            button.classList.add('expanded');
            button.querySelector('.toggle-text').textContent = 'Ocultar desglose';
        } else {
            breakdown.classList.add('collapsed');
            button.classList.remove('expanded');
            button.querySelector('.toggle-text').textContent = 'Ver desglose';
        }
    },

};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
