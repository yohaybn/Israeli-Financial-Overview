import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ExclusionFilter {
    id: string;
    pattern: string; // The description pattern to match
    active: boolean;
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const FILTERS_FILE = path.join(CONFIG_DIR, 'exclusion_filters.json');

export class FilterService {
    constructor() {
        fs.ensureDirSync(CONFIG_DIR);
        if (!fs.existsSync(FILTERS_FILE)) {
            fs.writeJsonSync(FILTERS_FILE, []);
        }
    }

    async getFilters(): Promise<ExclusionFilter[]> {
        return fs.readJson(FILTERS_FILE);
    }

    async addFilter(pattern: string): Promise<ExclusionFilter> {
        const filters = await this.getFilters();
        const newFilter: ExclusionFilter = {
            id: uuidv4(),
            pattern,
            active: true
        };
        filters.push(newFilter);
        await fs.writeJson(FILTERS_FILE, filters, { spaces: 2 });
        return newFilter;
    }

    async removeFilter(id: string): Promise<boolean> {
        const filters = await this.getFilters();
        const initialLength = filters.length;
        const filtered = filters.filter(f => f.id !== id);
        if (filtered.length === initialLength) return false;
        await fs.writeJson(FILTERS_FILE, filtered, { spaces: 2 });
        return true;
    }

    async toggleFilter(id: string): Promise<boolean> {
        const filters = await this.getFilters();
        const filter = filters.find(f => f.id === id);
        if (!filter) return false;
        filter.active = !filter.active;
        await fs.writeJson(FILTERS_FILE, filters, { spaces: 2 });
        return true;
    }

    async clearAllFilters(): Promise<void> {
        await fs.writeJson(FILTERS_FILE, [], { spaces: 2 });
    }
}
