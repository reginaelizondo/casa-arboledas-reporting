/**
 * Authentication Module
 * Handles project-level password authentication.
 * Each project has its own password configured in PROJECTS.
 */

const PROJECTS = {
    'ARBOLEDAS': {
        name: 'Casa Arboledas',
        password: 'ARBOLEDAS',
        sheets: {
            budget: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtH6vXsUOaCMZESDh4kKBgu4GKkQwwbXWh_KL8ZGhC5uLciBEBnDLMadWkXkVe0PKT2CeZB2PbE042/pub?output=csv&gid=0',
            desglose: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtH6vXsUOaCMZESDh4kKBgu4GKkQwwbXWh_KL8ZGhC5uLciBEBnDLMadWkXkVe0PKT2CeZB2PbE042/pub?output=csv&gid=1025952285',
            capital: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtH6vXsUOaCMZESDh4kKBgu4GKkQwwbXWh_KL8ZGhC5uLciBEBnDLMadWkXkVe0PKT2CeZB2PbE042/pub?output=csv&gid=508913285'
        },
        driveFolder: 'https://drive.google.com/drive/folders/1W_97MPUnXqRHkX-Xp_HoGjVNu8sjoYP6'
    }
    // Add more projects here in the future:
    // 'PROJECT_KEY': { name: '...', password: '...', sheets: {...}, driveFolder: '...' }
};

const Auth = {
    currentProject: null,

    /**
     * Attempt to authenticate with a password.
     * Returns the project config if the password matches, null otherwise.
     */
    login(password) {
        const trimmed = password.trim().toUpperCase();
        for (const key of Object.keys(PROJECTS)) {
            if (PROJECTS[key].password.toUpperCase() === trimmed) {
                this.currentProject = { key, ...PROJECTS[key] };
                sessionStorage.setItem('activeProject', key);
                return this.currentProject;
            }
        }
        return null;
    },

    /**
     * Check if there's an active session (within the browser tab session).
     */
    getSession() {
        const key = sessionStorage.getItem('activeProject');
        if (key && PROJECTS[key]) {
            this.currentProject = { key, ...PROJECTS[key] };
            return this.currentProject;
        }
        return null;
    },

    /**
     * Log out: clear session and current project.
     */
    logout() {
        this.currentProject = null;
        sessionStorage.removeItem('activeProject');
    }
};
