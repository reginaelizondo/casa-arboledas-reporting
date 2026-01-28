/**
 * Data Module
 * Handles fetching CSVs from Google Sheets and parsing them into usable structures.
 */

const DataService = {
    cache: {},
    cacheTimestamp: null,
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes

    /**
     * Parse a CSV string into a 2D array.
     * Handles quoted fields, commas within quotes, and newlines within quotes.
     */
    parseCSV(csvText) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        currentField += '"';
                        i++; // skip escaped quote
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    currentRow.push(currentField.trim());
                    currentField = '';
                } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                    currentRow.push(currentField.trim());
                    if (currentRow.length > 0) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentField = '';
                    if (char === '\r') i++; // skip \n in \r\n
                } else {
                    currentField += char;
                }
            }
        }

        // Push last field and row
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            rows.push(currentRow);
        }

        return rows;
    },

    /**
     * Parse a US-formatted number string (e.g., "1,234,567.89" or "$1,234.56")
     * Returns a float or 0 if not parseable.
     */
    parseNumber(str) {
        if (!str) return 0;
        // Remove currency symbols, spaces, and thousands separators
        const cleaned = String(str).replace(/[$\s,MXN]/gi, '').trim();
        if (cleaned === '' || cleaned === '-') return 0;
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    },

    /**
     * Parse a percentage string (e.g., "27%" or "27.5%")
     */
    parsePercent(str) {
        if (!str) return 0;
        const cleaned = String(str).replace(/[%\s]/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    },

    /**
     * Format a number as Mexican currency.
     */
    formatCurrency(num) {
        if (num === null || num === undefined || isNaN(num)) return '$0.00 MXN';
        return '$' + num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' MXN';
    },

    /**
     * Format a number as short currency (no decimals for large numbers).
     */
    formatCurrencyShort(num) {
        if (num === null || num === undefined || isNaN(num)) return '$0';
        if (Math.abs(num) >= 1000000) {
            return '$' + (num / 1000000).toFixed(2) + 'M';
        }
        if (Math.abs(num) >= 1000) {
            return '$' + (num / 1000).toFixed(0) + 'K';
        }
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },

    /**
     * Format a percentage.
     */
    formatPercent(num) {
        if (num === null || num === undefined || isNaN(num)) return '0.0%';
        return num.toFixed(1) + '%';
    },

    /**
     * Fetch a single CSV from URL.
     */
    async fetchCSV(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const text = await response.text();
        return this.parseCSV(text);
    },

    /**
     * Fetch all data for a project.
     * Uses cache if available and not expired.
     */
    async fetchAllData(project) {
        const now = Date.now();
        if (this.cache[project.key] && this.cacheTimestamp && (now - this.cacheTimestamp) < this.CACHE_TTL) {
            return this.cache[project.key];
        }

        const [budget, desglose, capital] = await Promise.all([
            this.fetchCSV(project.sheets.budget),
            this.fetchCSV(project.sheets.desglose),
            this.fetchCSV(project.sheets.capital)
        ]);

        const parsed = {
            budget: this.parseBudget(budget),
            expenses: this.parseExpenses(desglose),
            capital: this.parseCapital(capital),
            fetchedAt: new Date()
        };

        this.cache[project.key] = parsed;
        this.cacheTimestamp = now;
        return parsed;
    },

    /**
     * Clear cache to force fresh data on next fetch.
     */
    clearCache() {
        this.cache = {};
        this.cacheTimestamp = null;
    },

    /**
     * Parse the BUDGET sheet.
     * Row indices are 0-based here (row 5 in sheet = index 4).
     */
    parseBudget(rows) {
        const data = {
            houses: [],
            hardCosts: {},
            softCosts: {},
            terreno: {}
        };

        // Use a smart row finder: search for key labels in column B (index 1)
        // This makes parsing resilient to row insertions/deletions in the spreadsheet.
        const findRow = (label) => rows.findIndex(r => r && r[1] && r[1].trim().toLowerCase().startsWith(label.toLowerCase()));
        const findRowFrom = (label, startIdx) => {
            for (let i = startIdx; i < rows.length; i++) {
                if (rows[i] && rows[i][1] && rows[i][1].trim().toLowerCase().startsWith(label.toLowerCase())) return i;
            }
            return -1;
        };

        // Houses - look for "Casa 1" and "Casa 2" rows
        const casa1Idx = findRow('Casa 1');
        const casa2Idx = findRow('Casa 2');
        for (const idx of [casa1Idx, casa2Idx]) {
            if (idx >= 0 && rows[idx]) {
                data.houses.push({
                    name: (rows[idx][1] || '').trim(),
                    sqm: this.parseNumber(rows[idx][5]),        // col F
                    pricePerSqm: this.parseNumber(rows[idx][7]), // col H
                    totalCommercial: this.parseNumber(rows[idx][9]), // col J
                    netIncome: this.parseNumber(rows[idx][10])     // col K
                });
            }
        }

        // Hard Costs - find "Total de Hard Cost" row
        const totalHardIdx = findRow('Total de Hard Cost');
        if (totalHardIdx >= 0) {
            data.hardCosts.total = this.parseNumber(rows[totalHardIdx][10]);
        }
        // Construction detail
        const constrIdx = findRow('Construcción');
        if (constrIdx >= 0) {
            data.hardCosts.construction = this.parseNumber(rows[constrIdx][10]);
        }

        // Soft Costs - find each subcategory
        const softLabels = ['Fee Administracion', 'Arquitectura', 'Trámites / Permisos', 'Legal / Fiscal', 'Ingenierías / Estudios', 'IVA Soft Cost'];
        data.softCosts.items = [];
        for (const label of softLabels) {
            const idx = findRow(label);
            if (idx >= 0 && rows[idx]) {
                data.softCosts.items.push({
                    name: (rows[idx][1] || label).trim(),
                    amount: this.parseNumber(rows[idx][10])
                });
            }
        }
        const totalSoftIdx = findRow('Total de Soft Cost');
        if (totalSoftIdx >= 0) {
            data.softCosts.total = this.parseNumber(rows[totalSoftIdx][10]);
        }

        // Terreno - find each subcategory
        data.terreno.items = [];
        const terrenoLabels = ['Lote 1', 'Lote 2', 'ISAI'];
        for (const label of terrenoLabels) {
            const idx = findRow(label);
            if (idx >= 0 && rows[idx]) {
                data.terreno.items.push({
                    name: (rows[idx][1] || label).trim(),
                    amount: this.parseNumber(rows[idx][10])
                });
            }
        }
        const totalTerrenoIdx = findRow('Valor de Terreno');
        if (totalTerrenoIdx >= 0) {
            data.terreno.total = this.parseNumber(rows[totalTerrenoIdx][10]);
        }

        return data;
    },

    /**
     * Parse the DESGLOSE COSTOS sheet.
     * Skip header row (index 0). Columns: A=Date, B=Category, C=Subcategory, D=Detail(skip), E=Amount
     */
    parseExpenses(rows) {
        const expenses = [];
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 5) continue;

            const dateStr = (row[0] || '').trim();
            const category = (row[1] || '').trim();
            const subcategory = (row[2] || '').trim();
            const amount = this.parseNumber(row[4]); // col E (index 4)

            if (!category && !amount) continue; // skip empty rows

            expenses.push({
                date: dateStr,
                dateObj: this.parseDate(dateStr),
                category,
                subcategory,
                amount
            });
        }
        return expenses;
    },

    /**
     * Parse a date string. Tries multiple formats.
     */
    parseDate(str) {
        if (!str) return null;
        // Try MM/DD/YYYY or M/D/YYYY
        const parts = str.split('/');
        if (parts.length === 3) {
            const month = parseInt(parts[0], 10);
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
                return new Date(year, month - 1, day);
            }
        }
        // Try standard Date parsing
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    },

    /**
     * Parse the CAPITAL sheet.
     */
    parseCapital(rows) {
        const data = {
            uses: {},
            investors: [],
            projectIndicators: {},
            capitalIndicators: {}
        };

        // Uses of Capital (rows 2-4 = indices 1-3)
        if (rows[1]) {
            data.uses.hardCosts = { amount: this.parseNumber(rows[1][2]), pct: this.parsePercent(rows[1][3]) };
        }
        if (rows[2]) {
            data.uses.softCosts = { amount: this.parseNumber(rows[2][2]), pct: this.parsePercent(rows[2][3]) };
        }
        if (rows[3]) {
            data.uses.terreno = { amount: this.parseNumber(rows[3][2]), pct: this.parsePercent(rows[3][3]) };
        }

        // Investors (rows 7+ = indices 6+)
        // Read until we hit an empty row or the next section header (row 12 = index 11)
        for (let i = 6; i < 11 && i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0] || row[0].trim() === '') break;
            data.investors.push({
                name: row[0].trim(),
                amount: this.parseNumber(row[2]) // col C
            });
        }

        // Project Indicators (rows 13-16 = indices 12-15)
        if (rows[12]) {
            data.projectIndicators.totalIncome = this.parseNumber(rows[12][2]);
            data.projectIndicators.totalIncomeLabel = (rows[12][0] || 'Ingresos Totales').trim();
        }
        if (rows[13]) {
            data.projectIndicators.projectCost = this.parseNumber(rows[13][2]);
            data.projectIndicators.projectCostLabel = (rows[13][0] || 'Costo del Proyecto').trim();
        }
        if (rows[14]) {
            data.projectIndicators.profit = this.parseNumber(rows[14][2]);
            data.projectIndicators.profitLabel = (rows[14][0] || 'Utilidad').trim();
        }
        if (rows[15]) {
            data.projectIndicators.margin = this.parsePercent(rows[15][2]);
            data.projectIndicators.marginLabel = (rows[15][0] || 'Margen de Utilidad').trim();
        }

        // Capital Indicators (rows 19-22 = indices 18-21)
        if (rows[18]) {
            data.capitalIndicators.capitalContributed = this.parseNumber(rows[18][2]);
            data.capitalIndicators.capitalContributedLabel = (rows[18][0] || 'Capital Aportado').trim();
        }
        if (rows[19]) {
            data.capitalIndicators.totalReturn = this.parseNumber(rows[19][2]);
            data.capitalIndicators.totalReturnLabel = (rows[19][0] || 'Retorno Total').trim();
        }
        if (rows[20]) {
            data.capitalIndicators.roi = this.parsePercent(rows[20][2]);
            data.capitalIndicators.roiLabel = (rows[20][0] || 'ROI').trim();
        }
        if (rows[21]) {
            data.capitalIndicators.capitalMultiple = this.parseNumber(rows[21][2]);
            data.capitalIndicators.capitalMultipleLabel = (rows[21][0] || 'Múltiplo de Capital').trim();
        }

        return data;
    },

    /**
     * Calculate aggregated expense totals by category and subcategory.
     */
    /**
     * Normalize category names to consistent keys.
     * Handles variations like "Soft Costs" vs "Soft Cost".
     */
    normalizeCategory(cat) {
        if (!cat) return '';
        const lower = cat.trim().toLowerCase();
        if (lower.startsWith('hard')) return 'Hard Cost';
        if (lower.startsWith('soft')) return 'Soft Cost';
        if (lower.startsWith('terreno')) return 'Terreno';
        return cat.trim();
    },

    calculateExpenseSummary(expenses) {
        const summary = {
            total: 0,
            byCategory: {},
            bySubcategory: {}
        };

        for (const exp of expenses) {
            summary.total += exp.amount;

            const catKey = this.normalizeCategory(exp.category);
            if (!summary.byCategory[catKey]) {
                summary.byCategory[catKey] = 0;
            }
            summary.byCategory[catKey] += exp.amount;

            const subKey = `${catKey}|${exp.subcategory}`;
            if (!summary.bySubcategory[subKey]) {
                summary.bySubcategory[subKey] = 0;
            }
            summary.bySubcategory[subKey] += exp.amount;
        }

        return summary;
    }
};
